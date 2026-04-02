/**
 * Exit exam window state: always-on-top + native fullscreen (Electron) + Fullscreen API (browser).
 * Electron main process also maximizes the window for normal desktop use after reset.
 * Call and await before navigate away after submit / suspension / forced stop.
 */

async function exitDocumentFullscreenLayers(): Promise<void> {
  if (typeof document === "undefined") return;

  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozFullScreenElement?: Element | null;
    mozCancelFullScreen?: () => Promise<void> | void;
  };

  const tryExit = async (fn: () => void | Promise<void>) => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).then === "function") await r;
    } catch {
      /* ignore — not in fullscreen or browser denied */
    }
  };

  if (document.fullscreenElement) {
    await tryExit(() => document.exitFullscreen());
  }
  if (d.webkitFullscreenElement && d.webkitExitFullscreen) {
    await tryExit(() => d.webkitExitFullscreen!());
  }
  if (d.mozFullScreenElement && d.mozCancelFullScreen) {
    await tryExit(() => d.mozCancelFullScreen!());
  }
}

export async function exitExamFullscreen(): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.resetExamWindowState) {
    try {
      await window.electronAPI.resetExamWindowState();
    } catch {
      /* plug-in: production error reporting */
    }
  } else if (typeof window !== "undefined" && window.electronAPI) {
    try {
      window.electronAPI.setAlwaysOnTop?.(false);
    } catch {
      /* plug-in: production error reporting */
    }
    try {
      window.electronAPI.setFullScreen?.(false);
    } catch {
      /* plug-in: production error reporting */
    }
  }

  await exitDocumentFullscreenLayers();
}
