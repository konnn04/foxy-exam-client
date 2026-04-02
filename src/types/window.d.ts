export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getScreenCount: () => Promise<number>;
      getRunningBannedApps: (bannedApps?: string[]) => Promise<string[]>;
      getNetworkInfo: () => Promise<{ ip: string, mac: string }[]>;
      getSystemInfo: () => Promise<{ platform: string, release: string, arch: string, sessionType: string }>;
      saveExamLog: (examId: string, violations: any[], tracking: any[]) => Promise<{success: boolean, violationPath?: string, trackingPath?: string}>;
      logSystemMetrics: (examId: string, fps: number) => Promise<boolean>;
      killBannedApps: (appNames: string[]) => Promise<{killed: string[], failed: string[]}>;
      startGlobalHook: () => void;
      stopGlobalHook: () => void;
      setAlwaysOnTop: (isTop: boolean) => void;
      setFullScreen: (isFull: boolean) => void;
      /** Main process: always-on-top off + native fullscreen off (await before navigate). */
      resetExamWindowState?: () => Promise<void>;
      /** Optional stable machine id from Electron main (if implemented). */
      getMachineId?: () => Promise<string>;
      quitApp: () => void;
      onGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      offGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      onDevToolsOpened: (callback: () => void) => void;
      offDevToolsOpened: (callback: () => void) => void;
    };
  }
}
