import { useEffect } from "react";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import { exitExamFullscreen } from "@/lib/exit-fullscreen";

/**
 * Electron only: while the exam take route is mounted (precheck + doing the exam),
 * keep the main window always-on-top and native fullscreen. On unmount (dashboard,
 * exam detail, submit, etc.), restore normal window (see main process reset + maximize).
 *
 * Browser builds: no-op; they use document fullscreen from useExamLockdown during the session.
 */
export function useElectronExamStrictWindow(): void {
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.setFullScreen) return;

    if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_FULLSCREEN) {
      return;
    }

    try {
      api.setAlwaysOnTop?.(true);
      api.setFullScreen(true);
    } catch {
      /* plug-in: production error reporting */
    }

    return () => {
      void exitExamFullscreen();
    };
  }, []);
}
