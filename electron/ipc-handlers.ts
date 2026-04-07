import { app, BrowserWindow, ipcMain, screen, desktopCapturer } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

type GetMainWindow = () => BrowserWindow | null;

// ─── Tracking state for diff-based monitoring ─────────────────
let _lastNetworkSnapshot: { ip: string; mac: string }[] = [];
let _lastDisplayId: number | null = null;
let _networkPollTimer: ReturnType<typeof setInterval> | null = null;
let _displayChangeHandler: (() => void) | null = null;

const VM_KEYWORDS = [
  "kvm",
  "qemu",
  "vmware",
  "virtualbox",
  "vbox",
  "xen",
  "hyper-v",
  "hyperv",
  "parallels",
  "bochs",
  "bhyve",
  "virtual machine",
];

function _containsVmKeyword(input: string): boolean {
  const lower = input.toLowerCase();
  return VM_KEYWORDS.some((k) => lower.includes(k));
}

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
  ipcMain.handle("get-screen-count", () => {
    return screen.getAllDisplays().length;
  });

  // ─── NEW: Full process list ────────────────────────────────
  ipcMain.handle("get-process-list", async () => {
    try {
      let command = "";
      if (process.platform === "win32") {
        command = 'tasklist /FO CSV /NH';
      } else if (process.platform === "darwin") {
        command = "ps -axco pid,command,%cpu,%mem | awk 'NR>1'";
      } else {
        command = "ps -axo pid,comm,%cpu,%mem --no-headers";
      }
      const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 });

      if (process.platform === "win32") {
        return stdout.split("\n").filter(Boolean).map((line) => {
          const parts = line.replace(/"/g, "").split(",");
          return { name: parts[0]?.trim() || "", pid: parseInt(parts[1]) || 0 };
        });
      }
      return stdout.split("\n").filter(Boolean).map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parseInt(parts[0]) || 0,
          name: parts[1] || "",
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0,
        };
      });
    } catch (e: any) {
      console.error("Error getting process list:", e);
      return [];
    }
  });

  // ─── NEW: System metrics (CPU, RAM) ────────────────────────
  ipcMain.handle("get-system-metrics", () => {
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
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    return { id: display.id, label: display.label || `${display.id}`, bounds: display.bounds };
  });

  // ─── NEW: Screen Source ID for WebRTC Target ────────────────
  ipcMain.handle("get-screen-source-id", async (_event, preferredDisplayId?: number) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const targetDisplayId = Number.isFinite(preferredDisplayId as number)
      ? Number(preferredDisplayId)
      : display.id;

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
    } catch (e) {
      console.error("Failed to get desktop capturer sources", e);
      return null;
    }
  });

  // ─── NEW: Start monitoring display & network changes ──────
  ipcMain.handle("start-hw-monitoring", () => {
    const mainWindow = getMainWindow();

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

  ipcMain.handle("get-vm-detection", async () => {
    const reasons: string[] = [];
    const details: Record<string, string> = {};

    try {
      if (process.platform === "linux") {
        try {
          const { stdout } = await execAsync("systemd-detect-virt || true");
          const virt = stdout.trim();
          if (virt && virt !== "none") {
            reasons.push(`systemd-detect-virt=${virt}`);
            details.systemdDetectVirt = virt;
          }
        } catch {
          // ignore
        }

        const dmiFiles = [
          "/sys/class/dmi/id/product_name",
          "/sys/class/dmi/id/sys_vendor",
          "/sys/class/dmi/id/board_vendor",
          "/sys/class/dmi/id/bios_vendor",
        ];
        for (const f of dmiFiles) {
          try {
            const v = (await fs.readFile(f, "utf8")).trim();
            if (v) {
              details[f] = v;
              if (_containsVmKeyword(v)) {
                reasons.push(`${path.basename(f)}=${v}`);
              }
            }
          } catch {
            // ignore unavailable files
          }
        }
      } else if (process.platform === "win32") {
        try {
          const { stdout } = await execAsync(
            "powershell -NoProfile -Command \"(Get-CimInstance Win32_ComputerSystem).Model; (Get-CimInstance Win32_ComputerSystem).Manufacturer; (Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion\""
          );
          const info = stdout.trim();
          details.windowsHardware = info;
          if (_containsVmKeyword(info)) {
            reasons.push("windows_hardware_signature");
          }
        } catch {
          // ignore
        }
      } else if (process.platform === "darwin") {
        try {
          const { stdout } = await execAsync("sysctl -n machdep.cpu.features || true");
          const features = stdout.trim();
          details.cpuFeatures = features;
          if (features.toLowerCase().includes("vmm")) {
            reasons.push("cpu_feature_vmm");
          }
        } catch {
          // ignore
        }
      }
    } catch (error: any) {
      console.error("VM detection failed", error);
      return { isVirtualMachine: false, confidence: 0, reasons: [], details: {}, error: String(error?.message || error) };
    }

    const uniqueReasons = Array.from(new Set(reasons));
    const confidence = Math.min(1, uniqueReasons.length / 2);
    return {
      isVirtualMachine: uniqueReasons.length > 0,
      confidence,
      reasons: uniqueReasons,
      details,
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
