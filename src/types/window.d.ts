export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      /** When true, main process allows privileged IPC (process list, kill apps, telemetry, etc.). */
      setExamIpcSession?: (active: boolean) => Promise<{ ok: boolean }>;
      getScreenCount: () => Promise<number>;
      getRunningBannedApps: (bannedApps?: string[], whitelistApps?: string[]) => Promise<string[]>;
      getNetworkInfo: () => Promise<{ ip: string, mac: string }[]>;
      getSystemInfo: () => Promise<{ platform: string, release: string, arch: string, sessionType: string }>;
      getVmDetection?: () => Promise<{
        isVirtualMachine: boolean;
        confidence: number;
        reasons: string[];
        details: Record<string, string>;
        error?: string;
      }>;
      saveExamLog: (examId: string, violations: any[], tracking: any[]) => Promise<{success: boolean, violationPath?: string, trackingPath?: string}>;
      killBannedApps: (appNames: string[]) => Promise<{ killed: string[]; failed: string[] }>;
      startGlobalHook: () => void;
      stopGlobalHook: () => void;
      setAlwaysOnTop: (isTop: boolean) => void;
      setContentProtection?: (isSecure: boolean) => void;
      setFullScreen: (isFull: boolean) => void;
      /** Native BrowserWindow fullscreen / always-on-top (not document.fullscreenElement). */
      getWindowLockState?: () => Promise<{ isFullScreen: boolean; isAlwaysOnTop: boolean }>;
      /** Main process: always-on-top off + native fullscreen off (await before navigate). */
      resetExamWindowState?: () => Promise<void>;
      /** Optional stable machine id from Electron main (if implemented). */
      getMachineId?: () => Promise<string>;
      quitApp: () => void;
      onGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      offGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      onDevToolsOpened: (callback: () => void) => void;
      offDevToolsOpened: (callback: () => void) => void;

      // ─── Telemetry APIs ─────────────────────────────────
      /** Full process list (pid, name, cpu%, mem%). */
      getProcessList?: () => Promise<{ pid: number; name: string; cpu?: number; mem?: number }[]>;
      /** System-wide metrics (CPU, RAM). */
      getSystemMetrics?: () => Promise<{
        cpuPercent: number;
        ramUsedMB: number;
        ramTotalMB: number;
        ramPercent: number;
        appCpuPercent: number;
        appMemMB: number;
      }>;
      /** Current display where the window is located. */
      getDisplayId?: () => Promise<{ id: number; label: string; bounds: any } | null>;
      getScreenSourceId?: (preferredDisplayId?: number) => Promise<string | null>;

      /** Start monitoring display & network changes (push events). */
      startHwMonitoring?: () => Promise<boolean>;
      /** Stop monitoring. */
      stopHwMonitoring?: () => Promise<boolean>;

      /** Display add/remove event listener. */
      onDisplayChanged?: (callback: (event: any, data: any) => void) => void;
      offDisplayChanged?: (callback: (event: any, data: any) => void) => void;
      /** Network IP change event listener. */
      onNetworkChanged?: (callback: (event: any, data: any) => void) => void;
      offNetworkChanged?: (callback: (event: any, data: any) => void) => void;
      /** Peripheral (USB) initial snapshot. */
      getPeripheralSnapshot?: () => Promise<{ id: string, name: string, type: string }[]>;
      /** Peripheral change listener. */
      onPeripheralChanged?: (callback: (event: any, data: { action: string, device: any }) => void) => void;
      offPeripheralChanged?: (callback: (event: any, data: { action: string, device: any }) => void) => void;
    };
  }
}
