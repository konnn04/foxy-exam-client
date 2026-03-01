import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getScreenCount: () => ipcRenderer.invoke("get-screen-count"),
  getRunningBannedApps: () => ipcRenderer.invoke("get-running-banned-apps"),
  getNetworkInfo: () => ipcRenderer.invoke("get-network-info"),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  setAlwaysOnTop: (isTop: boolean) => ipcRenderer.send("set-always-on-top", isTop),
  saveExamLog: (examId: string, violations: any[], tracking: any[]) => ipcRenderer.invoke("save-exam-log", { examId, violations, tracking }),
  startGlobalHook: () => ipcRenderer.send("start-global-hook"),
  stopGlobalHook: () => ipcRenderer.send("stop-global-hook"),
  onGlobalHookEvent: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on("global-hook-event", callback);
  },
  onDevToolsOpened: (callback: () => void) => {
    ipcRenderer.on("devtools-opened", callback);
  },
  offDevToolsOpened: (callback: () => void) => {
    ipcRenderer.off("devtools-opened", callback);
  }
});
