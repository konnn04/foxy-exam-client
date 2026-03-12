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
      onGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      offGlobalHookEvent: (callback: (event: any, data: any) => void) => void;
      onDevToolsOpened: (callback: () => void) => void;
      offDevToolsOpened: (callback: () => void) => void;
    };
  }
}
