import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import { APP_BANNED } from "../src/config/app-banned";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
//
// ├─┬─ dist-electron
// │ ├── main.js
// │ └── preload.mjs
// ├─┬─ dist
// │ └── index.html
//
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC!, "vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setContentProtection(true);
  
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow?.webContents.send("devtools-opened");
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWindow = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


app.whenReady().then(() => {
  // Allow renderer getDisplayMedia() and show native source picker in Electron.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "display-capture" || permission === "media") {
      return true;
    }
    return false;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "display-capture" || permission === "media") {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      // Fallback when system picker is unavailable: use first screen source.
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      });
      callback({ video: sources[0], audio: "none" });
    },
    {
      // Ask OS/Electron to show native picker dialog when available.
      useSystemPicker: true,
    }
  );

  ipcMain.handle("get-screen-count", () => {
    return screen.getAllDisplays().length;
  });

  ipcMain.on("set-always-on-top", (_, isTop: boolean) => {
    if (mainWindow) {
      // "screen-saver" level keeps it above taskbars and most other OS windows
      mainWindow.setAlwaysOnTop(isTop, "screen-saver");
    }
  });

  ipcMain.on("set-fullscreen", (_, isFull: boolean) => {
    if (mainWindow) {
      mainWindow.setFullScreen(isFull);
    }
  });

  ipcMain.on("quit-app", () => {
    app.quit();
  });

  ipcMain.handle("get-network-info", () => {
    const interfaces = os.networkInterfaces();
    const addresses: { ip: string, mac: string }[] = [];
    
    for (const k in interfaces) {
      const iface = interfaces[k];
      if (!iface) continue;
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          addresses.push({ ip: info.address, mac: info.mac });
        }
      }
    }
    return addresses;
  });

  ipcMain.handle("get-system-info", () => {
    return {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      sessionType: process.env.XDG_SESSION_TYPE || "unknown", // To distinguish x11 vs wayland
    };
  });

  ipcMain.handle("get-running-banned-apps", async (_, bannedApps?: string[]) => {
    try {
      let command = "";
      if (process.platform === "win32") {
        command = 'tasklist /FO CSV /NH';
      } else if (process.platform === "darwin") {
        command = 'ps -axco command | awk \'NR>1\'';
      } else {
        // Use 'args' on Linux to prevent truncation of long process names
        command = 'ps -axo args | awk \'NR>1\''; 
      }
      
      const { stdout } = await execAsync(command);
      const runningProcesses = stdout.toLowerCase();
      
      const appsToCheck = Array.isArray(bannedApps) ? bannedApps : [];
      
      if (appsToCheck.length === 0) {
          return [];
      }
      
      const detected = appsToCheck.filter(appName => {
        const lowerName = appName.toLowerCase();
        return runningProcesses.includes(lowerName);
      });
      return detected;
    } catch (e: any) {
      console.error("Lỗi lấy danh sách process:", e);
      return [`[LỖI HỆ THỐNG]: ${e.message || "Unknown Execute Error"}`]; 
    }
  });

  ipcMain.handle("kill-banned-apps", async (_, appNames: string[]) => {
    const killed: string[] = [];
    const failed: string[] = [];
    for (const appName of appNames) {
      try {
        let command = "";
        if (process.platform === "win32") {
        } else {
          command = `pkill -f "${appName}" 2>/dev/null || true`;
        }
        await execAsync(command);
        killed.push(appName);
      } catch (e: any) {
        if (e.code === 1) {
          killed.push(appName); 
        } else {
          failed.push(appName);
          console.error(`Failed to kill ${appName}:`, e);
        }
      }
    }
    return { killed, failed };
  });

  ipcMain.handle("log-system-metrics", async (_, payload: { examId: string, fps: number }) => {
    try {
      const logDir = path.join(app.getPath("desktop"), "exam_logs");
      await fs.mkdir(logDir, { recursive: true });
      
      const metricsPath = path.join(logDir, `exam_${payload.examId}_METRICS.csv`);
      
      // Check if file exists to write header
      try {
        await fs.access(metricsPath);
      } catch {
        await fs.writeFile(metricsPath, "Time,FPS,Process_Type,CPU_Percent,WorkingSet_KB,PeakWorkingSet_KB\n", "utf8");
      }
      
      const metrics = app.getAppMetrics();
      const timeStr = new Date().toISOString();
      let csvData = "";
      
      for (const m of metrics) {
        // m.type = Browser (Main), Tab (Renderer), GPU, etc.
        const cpu = m.cpu.percentCPUUsage.toFixed(2);
        const mem = m.memory.workingSetSize;
        const peakMem = m.memory.peakWorkingSetSize;
        csvData += `${timeStr},${payload.fps},${m.type},${cpu},${mem},${peakMem}\n`;
      }
      
      await fs.appendFile(metricsPath, csvData, "utf8");
      return true;
    } catch (e) {
      console.error("Lỗi ghi system metrics:", e);
      return false;
    }
  });

  ipcMain.handle("save-exam-log", async (_, payload: { examId: string, violations: any[], tracking: any[] }) => {
    try {
      const logDir = path.join(app.getPath("desktop"), "exam_logs");
      await fs.mkdir(logDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const violationPath = path.join(logDir, `exam_${payload.examId}_VIOLATION_${timestamp}.txt`);
      const trackingPath = path.join(logDir, `exam_${payload.examId}_TRACKING_${timestamp}.txt`);
      
      // Write Violation Logs
      const violationContent = payload.violations.map(v => `[${new Date(v.timestamp).toISOString()}] [${v.type}] ${v.message}`).join("\n");
      await fs.writeFile(violationPath, violationContent || "No violations recorded.", "utf8");
      
      // Write Tracking Logs
      const trackingContent = payload.tracking.map(l => `[${l.time}] [${l.type}] ${l.data}`).join("\n");
      await fs.writeFile(trackingPath, trackingContent || "No tracking recorded.", "utf8");
      
      console.log(`\n======================================================`);
      console.log(`[+] Đã xuất file ghi log thành công:`);
      console.log(` -> Vi phạm: ${violationPath}`);
      console.log(` -> Tracking: ${trackingPath}`);
      console.log(`======================================================\n`);
      
      return { success: true, violationPath, trackingPath };
    } catch (e) {
      console.error("Lỗi lưu log:", e);
      return { success: false, error: e };
    }
  });
  
  createWindow();
});