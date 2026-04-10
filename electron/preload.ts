import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  setExamIpcSession: (active: boolean) => ipcRenderer.invoke("set-exam-ipc-session", active),
  getScreenCount: () => ipcRenderer.invoke("get-screen-count"),
  getRunningBannedApps: (bannedApps?: string[], whitelistApps?: string[]) =>
    ipcRenderer.invoke("get-running-banned-apps", bannedApps, whitelistApps),
  getNetworkInfo: () => ipcRenderer.invoke("get-network-info"),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  getVmDetection: () => ipcRenderer.invoke("get-vm-detection"),
  setAlwaysOnTop: (isTop: boolean) => ipcRenderer.send("set-always-on-top", isTop),
  setContentProtection: (isSecure: boolean) => ipcRenderer.send("set-content-protection", isSecure),
  setFullScreen: (isFull: boolean) => ipcRenderer.send("set-fullscreen", isFull),
  getWindowLockState: () =>
    ipcRenderer.invoke("get-window-lock-state") as Promise<{
      isFullScreen: boolean;
      isAlwaysOnTop: boolean;
    }>,
  resetExamWindowState: () => ipcRenderer.invoke("reset-exam-window-state"),
  quitApp: () => ipcRenderer.send("quit-app"),
  saveExamLog: (examId: string, violations: any[], tracking: any[]) => ipcRenderer.invoke("save-exam-log", { examId, violations, tracking }),
  killBannedApps: (appNames: string[]) => ipcRenderer.invoke("kill-banned-apps", appNames),
  startGlobalHook: () => ipcRenderer.send("start-global-hook"),
  stopGlobalHook: () => ipcRenderer.send("stop-global-hook"),
  onGlobalHookEvent: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on("global-hook-event", callback);
  },
  offGlobalHookEvent: (callback: (event: any, data: any) => void) => {
    ipcRenderer.off("global-hook-event", callback);
  },
  onDevToolsOpened: (callback: () => void) => {
    ipcRenderer.on("devtools-opened", callback);
  },
  offDevToolsOpened: (callback: () => void) => {
    ipcRenderer.off("devtools-opened", callback);
  },

  // ─── NEW: Telemetry APIs ───────────────────────────────────
  getProcessList: () => ipcRenderer.invoke("get-process-list"),
  getSystemMetrics: () => ipcRenderer.invoke("get-system-metrics"),
  getDisplayId: () => ipcRenderer.invoke("get-display-id"),
  getScreenSourceId: (preferredDisplayId?: number) =>
    ipcRenderer.invoke("get-screen-source-id", preferredDisplayId),

  // HW monitoring lifecycle (display + network change events)
  startHwMonitoring: () => ipcRenderer.invoke("start-hw-monitoring"),
  stopHwMonitoring: () => ipcRenderer.invoke("stop-hw-monitoring"),

  onDisplayChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on("display-changed", callback);
  },
  offDisplayChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.off("display-changed", callback);
  },
  onNetworkChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on("network-changed", callback);
  },
  offNetworkChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.off("network-changed", callback);
  },
  getPeripheralSnapshot: () => ipcRenderer.invoke("get-peripheral-snapshot"),
  onPeripheralChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on("peripheral-changed", callback);
  },
  offPeripheralChanged: (callback: (event: any, data: any) => void) => {
    ipcRenderer.off("peripheral-changed", callback);
  },
});
