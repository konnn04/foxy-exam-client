import { useEffect } from "react";

/**
 * Electron: allow high-privilege IPC only while the exam take route is mounted.
 * Register before `useElectronExamStrictWindow` so on unmount fullscreen resets first, then IPC gates close.
 */
export function useElectronIpcExamSession(): void {
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.setExamIpcSession) return;

    void api.setExamIpcSession(true).catch(() => {
      /* plug-in: production error reporting */
    });

    return () => {
      void api.setExamIpcSession?.(false).catch(() => {
        /* plug-in: production error reporting */
      });
    };
  }, []);
}
