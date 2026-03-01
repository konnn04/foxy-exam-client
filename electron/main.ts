import { app, BrowserWindow, ipcMain, screen } from "electron";
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
  ipcMain.handle("get-screen-count", () => {
    return screen.getAllDisplays().length;
  });

  ipcMain.on("set-always-on-top", (_, isTop: boolean) => {
    if (mainWindow) {
      // "screen-saver" level keeps it above taskbars and most other OS windows
      mainWindow.setAlwaysOnTop(isTop, "screen-saver");
    }
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

  ipcMain.handle("get-running-banned-apps", async () => {
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
      
      // Match whole words to avoid false positives (e.g. edge.exe vs something_edge)
      const detected = APP_BANNED.filter(appName => {
        const lowerName = appName.toLowerCase();
        return runningProcesses.includes(lowerName);
      });
      console.log("TEST - BANNED APPS DETECTED:", detected);
      return detected;
    } catch (e: any) {
      console.error("Lỗi lấy danh sách process:", e);
      return [`[LỖI HỆ THỐNG]: ${e.message || "Unknown Execute Error"}`]; 
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