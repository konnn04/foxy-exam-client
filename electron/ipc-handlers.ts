import { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { bannedAppNamesKillable, findRunningBannedAppsFromPs } from "./banned-process-match";
import { killBannedTokenCrossPlatform } from "./safe-banned-kill";
import { captureMainException } from "./sentry-main-capture";
import { PeripheralMonitor } from "./peripheral-monitor";
import { assertExamIpcSession, isExamIpcSessionActive, setExamIpcSessionActive } from "./ipc-exam-session";
import { setExamCloseGuard } from "./exam-close-guard";
import {
  parseBannedAppNames,
  parseWhitelistAppNames,
  parseLogSystemMetricsPayload,
  parseOptionalDisplayId,
  parseSaveExamLogPayload,
} from "./ipc-payload";
import { getPlatformOps } from "./platform";
import { z } from "zod";

const execAsync = promisify(exec);
const platformOps = getPlatformOps();

type GetMainWindow = () => BrowserWindow | null;

// ─── Tracking state for diff-based monitoring ─────────────────
let _lastNetworkSnapshot: { ip: string; mac: string }[] = [];
let _lastDisplayId: number | null = null;
let _networkPollTimer: ReturnType<typeof setInterval> | null = null;
let _displayChangeHandler: (() => void) | null = null;

const _peripheralMonitor = new PeripheralMonitor();

function _getNetworkSnapshot(): { ip: string; mac: string }[] {
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
}

export const registerIpcHandlers = (getMainWindow: GetMainWindow) => {
  ipcMain.handle("set-exam-close-guard", (_, payload: unknown) => {
    const schema = z.object({
      active: z.boolean(),
      message: z.string().max(600).optional(),
    });
    const r = schema.safeParse(payload);
    if (!r.success) {
      return { ok: false as const };
    }
    setExamCloseGuard(r.data.active, r.data.message);
    return { ok: true as const };
  });

  ipcMain.handle("set-exam-ipc-session", (_, active: unknown) => {
    const r = z.boolean().safeParse(active);
    if (!r.success) {
      return { ok: false as const };
    }
    setExamIpcSessionActive(r.data);
    if (!r.data) {
      setExamCloseGuard(false);
    }
    return { ok: true as const };
  });

  ipcMain.handle("get-screen-count", () => {
    return screen.getAllDisplays().length;
  });

  // ─── Full process list (with user ownership) ──────────────
  ipcMain.handle("get-process-list", async () => {
    if (!isExamIpcSessionActive()) {
      return [];
    }
    try {
      const command = platformOps.getProcessListCommand();
      const { stdout } = await execAsync(command, { maxBuffer: 2 * 1024 * 1024 });
      return platformOps.parseProcessList(stdout);
    } catch (e: unknown) {
      console.error("Error getting process list:", e);
      captureMainException(e, { tags: { ipc_channel: "get-process-list" } });
      return [];
    }
  });

  // ─── NEW: System metrics (CPU, RAM) ────────────────────────
  ipcMain.handle("get-system-metrics", () => {
    assertExamIpcSession("get-system-metrics");
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Aggregate CPU usage across all cores
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }
    const cpuPercent = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;

    // Electron app-specific metrics
    const appMetrics = app.getAppMetrics();
    let appCpuPercent = 0;
    let appMemKB = 0;
    for (const m of appMetrics) {
      appCpuPercent += m.cpu.percentCPUUsage;
      appMemKB += m.memory.workingSetSize;
    }

    return {
      cpuPercent: +cpuPercent.toFixed(1),
      ramUsedMB: +((totalMem - freeMem) / (1024 * 1024)).toFixed(0),
      ramTotalMB: +(totalMem / (1024 * 1024)).toFixed(0),
      ramPercent: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
      appCpuPercent: +appCpuPercent.toFixed(1),
      appMemMB: +(appMemKB / 1024).toFixed(0),
    };
  });

  // ─── NEW: Current display ID ───────────────────────────────
  ipcMain.handle("get-display-id", () => {
    assertExamIpcSession("get-display-id");
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    return { id: display.id, label: display.label || `${display.id}`, bounds: display.bounds };
  });

  // ─── NEW: Screen Source ID for WebRTC Target ────────────────
  ipcMain.handle("get-screen-source-id", async (_event, preferredDisplayId?: number) => {
    assertExamIpcSession("get-screen-source-id");
    const targetFromPayload = parseOptionalDisplayId(preferredDisplayId);
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const targetDisplayId =
      typeof targetFromPayload === "number" ? targetFromPayload : display.id;

    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"] });

      // Primary matching strategy: display_id from Electron source metadata.
      for (const s of sources) {
        const srcDisplayId = Number((s.display_id || "").trim());
        if (Number.isFinite(srcDisplayId) && srcDisplayId === targetDisplayId) {
          return s.id;
        }
      }

      // Fallback strategy: if display_id metadata is missing, pick by display order.
      // This is still better than blindly taking sources[0] on multi-monitor setups.
      const displays = screen.getAllDisplays().sort((a, b) => a.id - b.id);
      const targetIndex = displays.findIndex((d) => d.id === targetDisplayId);
      if (targetIndex >= 0 && sources[targetIndex]) {
        return sources[targetIndex].id;
      }

      return sources[0]?.id || null;
    } catch (e: unknown) {
      console.error("Failed to get desktop capturer sources", e);
      captureMainException(e, { tags: { ipc_channel: "get-screen-source-id" } });
      return null;
    }
  });

  // ─── NEW: Start monitoring display & network changes & peripherals ──────
  ipcMain.handle("start-hw-monitoring", () => {
    assertExamIpcSession("start-hw-monitoring");
    const mainWindow = getMainWindow();

    // Monitor Peripherals (USB, Capture Card, Mouse, Keyboard)
    _peripheralMonitor.onChange = (action, device) => {
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send("peripheral-changed", { action, device });
      }
    };
    _peripheralMonitor.start(5000); // Poll every 5s

    // Monitor display changes
    if (!_displayChangeHandler) {
      _displayChangeHandler = () => {
        const mainWin = getMainWindow();
        if (!mainWin) return;
        const displays = screen.getAllDisplays();
        const bounds = mainWin.getBounds();
        const currentDisplay = screen.getDisplayMatching(bounds);

        mainWin.webContents.send("display-changed", {
          count: displays.length,
          currentId: currentDisplay.id,
          previousId: _lastDisplayId,
        });
        _lastDisplayId = currentDisplay.id;
      };
      screen.on("display-added", _displayChangeHandler);
      screen.on("display-removed", _displayChangeHandler);
    }
    // Set initial display
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      _lastDisplayId = screen.getDisplayMatching(bounds).id;
    }

    // Monitor network changes (poll every 5s)
    if (!_networkPollTimer) {
      _lastNetworkSnapshot = _getNetworkSnapshot();
      _networkPollTimer = setInterval(() => {
        const mainWin = getMainWindow();
        if (!mainWin) return;
        const current = _getNetworkSnapshot();
        const prevIPs = _lastNetworkSnapshot.map(a => a.ip).sort().join(",");
        const currIPs = current.map(a => a.ip).sort().join(",");
        if (prevIPs !== currIPs) {
          mainWin.webContents.send("network-changed", {
            previous: _lastNetworkSnapshot,
            current,
          });
        }
        _lastNetworkSnapshot = current;
      }, 5000);
    }

    return true;
  });

  // ─── NEW: Stop monitoring ──────────────────────────────────
  ipcMain.handle("stop-hw-monitoring", () => {
    // No exam session gate: renderer cleanup often runs after IPC session flag is cleared (unmount order).
    _peripheralMonitor.stop();
    if (_displayChangeHandler) {
      screen.removeListener("display-added", _displayChangeHandler);
      screen.removeListener("display-removed", _displayChangeHandler);
      _displayChangeHandler = null;
    }
    if (_networkPollTimer) {
      clearInterval(_networkPollTimer);
      _networkPollTimer = null;
    }
    return true;
  });

  // ─── NEW: Retrieve Peripheral Snapshot snapshot ──────
  ipcMain.handle("get-peripheral-snapshot", async () => {
    assertExamIpcSession("get-peripheral-snapshot");
    return await _peripheralMonitor.getSnapshot();
  });

  ipcMain.on("set-always-on-top", (_, isTop: boolean) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(isTop, "screen-saver");
    }
  });

  ipcMain.on("set-content-protection", (_, isSecure: boolean) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.setContentProtection(isSecure);
    }
    
    // Toggle system-wide shortcut blocking for screenshots
    if (isSecure) {
      globalShortcut.register('PrintScreen', () => { /* no-op */ });
      globalShortcut.register('CommandOrControl+Shift+S', () => { /* no-op */ });
      globalShortcut.register('CommandOrControl+Shift+4', () => { /* no-op */ });
      globalShortcut.register('CommandOrControl+Shift+3', () => { /* no-op */ });
    } else {
      globalShortcut.unregister('PrintScreen');
      globalShortcut.unregister('CommandOrControl+Shift+S');
      globalShortcut.unregister('CommandOrControl+Shift+4');
      globalShortcut.unregister('CommandOrControl+Shift+3');
    }
  });

  ipcMain.on("set-fullscreen", (_, isFull: boolean) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.setFullScreen(isFull);
    }
  });

  ipcMain.handle("get-window-lock-state", () => {
    assertExamIpcSession("get-window-lock-state");
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { isFullScreen: false, isAlwaysOnTop: false };
    }
    return {
      isFullScreen: mainWindow.isFullScreen(),
      isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
    };
  });

  ipcMain.on("quit-app", () => {
    app.quit();
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

  ipcMain.handle("get-vm-detection", async () => {
    try {
      return await platformOps.detectVirtualMachine();
    } catch (error: unknown) {
      console.error("VM detection failed", error);
      captureMainException(error, { tags: { ipc_channel: "get-vm-detection" } });
      const msg = error instanceof Error ? error.message : String(error);
      return { isVirtualMachine: false, confidence: 0, reasons: [], details: {}, error: msg };
    }
  });

  ipcMain.handle("get-running-banned-apps", async (_, bannedApps?: string[], whitelistApps?: string[]) => {
    assertExamIpcSession("get-running-banned-apps");
    let appsToCheck: string[];
    try {
      appsToCheck = parseBannedAppNames(bannedApps);
    } catch (e: unknown) {
      console.error("get-running-banned-apps: invalid bannedApps payload", e);
      captureMainException(e instanceof Error ? e : new Error(String(e)), {
        tags: { ipc_channel: "get-running-banned-apps" },
        extra: { phase: "parse_banned" },
      });
      return [];
    }
    let whitelist: string[] = [];
    try {
      whitelist = parseWhitelistAppNames(whitelistApps);
    } catch {
      whitelist = [];
    }
    try {
      const command = platformOps.getBannedAppsCommand();
      const { stdout } = await execAsync(command, { maxBuffer: 2 * 1024 * 1024 });

      if (appsToCheck.length === 0) {
        return [];
      }

      return findRunningBannedAppsFromPs(stdout, process.platform, appsToCheck, whitelist);
    } catch (e: unknown) {
      console.error("Loi lay danh sach process:", e);
      captureMainException(e, { tags: { ipc_channel: "get-running-banned-apps" } });
      const msg = e instanceof Error ? e.message : "Unknown Execute Error";
      return [`[LOI HE THONG]: ${msg}`];
    }
  });

  ipcMain.handle("kill-banned-apps", async (_, appNames: string[]) => {
    assertExamIpcSession("kill-banned-apps");
    let names: string[];
    try {
      names = parseBannedAppNames(appNames);
    } catch {
      return { killed: [] as string[], failed: [] as string[] };
    }
    const killed: string[] = [];
    const failed: string[] = [];
    const killTargets = bannedAppNamesKillable(names);

    for (const appName of killTargets) {
      try {
        await killBannedTokenCrossPlatform(appName, process.platform);
        killed.push(appName);
      } catch (e: unknown) {
        failed.push(appName);
        console.error(`Failed to kill ${appName}:`, e);
        captureMainException(e, {
          tags: { ipc_channel: "kill-banned-apps" },
          extra: { app_name: appName },
        });
      }
    }

    return { killed, failed };
  });

  ipcMain.handle("kill-process-by-pid", async (_, pid: number, name: string) => {
    assertExamIpcSession("kill-process-by-pid");
    try {
      const result = await platformOps.killProcessByPid(pid, name);
      if (!result.success) {
        captureMainException(new Error(result.error || "Kill failed"), {
          tags: { ipc_channel: "kill-process-by-pid" },
          extra: { pid, name },
        });
      }
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Kill failed";
      captureMainException(e, { tags: { ipc_channel: "kill-process-by-pid" }, extra: { pid, name } });
      return { success: false, error: msg };
    }
  });

  ipcMain.handle("log-system-metrics", async (_, payload: unknown) => {
    assertExamIpcSession("log-system-metrics");
    let parsed: { examId: string; fps: number };
    try {
      parsed = parseLogSystemMetricsPayload(payload);
    } catch {
      return false;
    }
    try {
      const logDir = path.join(app.getPath("desktop"), "exam_logs");
      await fs.mkdir(logDir, { recursive: true });

      const metricsPath = path.join(logDir, `exam_${parsed.examId}_METRICS.csv`);

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
        csvData += `${timeStr},${parsed.fps},${m.type},${cpu},${mem},${peakMem}\n`;
      }

      await fs.appendFile(metricsPath, csvData, "utf8");
      return true;
    } catch (e: unknown) {
      console.error("Loi ghi system metrics:", e);
      captureMainException(e, { tags: { ipc_channel: "log-system-metrics" } });
      return false;
    }
  });

  ipcMain.handle("save-exam-log", async (_, payload: unknown) => {
    assertExamIpcSession("save-exam-log");
    let parsed;
    try {
      parsed = parseSaveExamLogPayload(payload);
    } catch (e) {
      return { success: false as const, error: String(e) };
    }
    try {
      const logDir = path.join(app.getPath("desktop"), "exam_logs");
      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const violationPath = path.join(
        logDir,
        `exam_${parsed.examId}_VIOLATION_${timestamp}.txt`
      );
      const trackingPath = path.join(
        logDir,
        `exam_${parsed.examId}_TRACKING_${timestamp}.txt`
      );

      const violationContent = parsed.violations
        .map((v) => {
          const ts = v["timestamp"];
          const lineTs =
            typeof ts === "number" || typeof ts === "string"
              ? new Date(ts).toISOString()
              : "?";
          const type = typeof v["type"] === "string" ? v["type"] : "?";
          const message =
            typeof v["message"] === "string" ? v["message"] : JSON.stringify(v);
          return `[${lineTs}] [${type}] ${message}`;
        })
        .join("\n");
      await fs.writeFile(violationPath, violationContent || "No violations recorded.", "utf8");

      const trackingContent = parsed.tracking
        .map((l) => {
          const time =
            typeof l["time"] === "string" ? l["time"] : String(l["time"] ?? "");
          const type = typeof l["type"] === "string" ? l["type"] : "?";
          const data =
            typeof l["data"] === "string" ? l["data"] : JSON.stringify(l);
          return `[${time}] [${type}] ${data}`;
        })
        .join("\n");
      await fs.writeFile(trackingPath, trackingContent || "No tracking recorded.", "utf8");

      console.log("\n======================================================");
      console.log("[+] Da xuat file ghi log thanh cong:");
      console.log(` -> Vi pham: ${violationPath}`);
      console.log(` -> Tracking: ${trackingPath}`);
      console.log("======================================================\n");

      return { success: true as const, violationPath, trackingPath };
    } catch (e: unknown) {
      console.error("Loi luu log:", e);
      captureMainException(e, { tags: { ipc_channel: "save-exam-log" } });
      return { success: false as const, error: e };
    }
  });

  ipcMain.on("start-global-hook", () => {
    if (!isExamIpcSessionActive()) {
      console.warn("[IPC] start-global-hook ignored (no exam take session)");
      return;
    }
  });

  ipcMain.on("stop-global-hook", () => {
    if (!isExamIpcSessionActive()) {
      return;
    }
  });
};
