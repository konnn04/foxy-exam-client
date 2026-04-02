import { app, BrowserWindow, ipcMain, screen } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

type GetMainWindow = () => BrowserWindow | null;

export const registerIpcHandlers = (getMainWindow: GetMainWindow) => {
  ipcMain.handle("get-screen-count", () => {
    return screen.getAllDisplays().length;
  });

  ipcMain.on("set-always-on-top", (_, isTop: boolean) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(isTop, "screen-saver");
    }
  });

  ipcMain.on("set-fullscreen", (_, isFull: boolean) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.setFullScreen(isFull);
    }
  });

  /** Awaitable: leave exam lockdown — always-on-top off, native fullscreen off, then normal maximized desktop window. */
  ipcMain.handle("reset-exam-window-state", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setFullScreen(false);
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
    mainWindow.focus();
  });

  ipcMain.on("quit-app", () => {
    app.quit();
  });

  ipcMain.handle("get-network-info", () => {
    const interfaces = os.networkInterfaces();
    const addresses: { ip: string; mac: string }[] = [];

    for (const k in interfaces) {
      const iface = interfaces[k];
      if (!iface) continue;
      for (const info of iface) {
        if (info.family === "IPv4" && !info.internal) {
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
      sessionType: process.env.XDG_SESSION_TYPE || "unknown",
    };
  });

  ipcMain.handle("get-running-banned-apps", async (_, bannedApps?: string[]) => {
    try {
      let command = "";
      if (process.platform === "win32") {
        command = "tasklist /FO CSV /NH";
      } else if (process.platform === "darwin") {
        command = "ps -axco command | awk 'NR>1'";
      } else {
        command = "ps -axo args | awk 'NR>1'";
      }

      const { stdout } = await execAsync(command);
      const runningProcesses = stdout.toLowerCase();

      const appsToCheck = Array.isArray(bannedApps) ? bannedApps : [];
      if (appsToCheck.length === 0) {
        return [];
      }

      return appsToCheck.filter((appName) => {
        return runningProcesses.includes(appName.toLowerCase());
      });
    } catch (e: any) {
      console.error("Loi lay danh sach process:", e);
      return [`[LOI HE THONG]: ${e.message || "Unknown Execute Error"}`];
    }
  });

  ipcMain.handle("kill-banned-apps", async (_, appNames: string[]) => {
    const killed: string[] = [];
    const failed: string[] = [];

    for (const appName of appNames) {
      try {
        let command = "";
        if (process.platform === "win32") {
          command = `taskkill /IM "${appName}" /F`;
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

  ipcMain.handle("log-system-metrics", async (_, payload: { examId: string; fps: number }) => {
    try {
      const logDir = path.join(app.getPath("desktop"), "exam_logs");
      await fs.mkdir(logDir, { recursive: true });

      const metricsPath = path.join(logDir, `exam_${payload.examId}_METRICS.csv`);

      try {
        await fs.access(metricsPath);
      } catch {
        await fs.writeFile(
          metricsPath,
          "Time,FPS,Process_Type,CPU_Percent,WorkingSet_KB,PeakWorkingSet_KB\n",
          "utf8"
        );
      }

      const metrics = app.getAppMetrics();
      const timeStr = new Date().toISOString();
      let csvData = "";

      for (const m of metrics) {
        const cpu = m.cpu.percentCPUUsage.toFixed(2);
        const mem = m.memory.workingSetSize;
        const peakMem = m.memory.peakWorkingSetSize;
        csvData += `${timeStr},${payload.fps},${m.type},${cpu},${mem},${peakMem}\n`;
      }

      await fs.appendFile(metricsPath, csvData, "utf8");
      return true;
    } catch (e) {
      console.error("Loi ghi system metrics:", e);
      return false;
    }
  });

  ipcMain.handle(
    "save-exam-log",
    async (_, payload: { examId: string; violations: any[]; tracking: any[] }) => {
      try {
        const logDir = path.join(app.getPath("desktop"), "exam_logs");
        await fs.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const violationPath = path.join(
          logDir,
          `exam_${payload.examId}_VIOLATION_${timestamp}.txt`
        );
        const trackingPath = path.join(
          logDir,
          `exam_${payload.examId}_TRACKING_${timestamp}.txt`
        );

        const violationContent = payload.violations
          .map((v) => `[${new Date(v.timestamp).toISOString()}] [${v.type}] ${v.message}`)
          .join("\n");
        await fs.writeFile(violationPath, violationContent || "No violations recorded.", "utf8");

        const trackingContent = payload.tracking
          .map((l) => `[${l.time}] [${l.type}] ${l.data}`)
          .join("\n");
        await fs.writeFile(trackingPath, trackingContent || "No tracking recorded.", "utf8");

        console.log("\n======================================================");
        console.log("[+] Da xuat file ghi log thanh cong:");
        console.log(` -> Vi pham: ${violationPath}`);
        console.log(` -> Tracking: ${trackingPath}`);
        console.log("======================================================\n");

        return { success: true, violationPath, trackingPath };
      } catch (e) {
        console.error("Loi luu log:", e);
        return { success: false, error: e };
      }
    }
  );
};
