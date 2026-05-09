import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { appendMainLog } from "./diagnostic-log";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * GitHub Releases auto-update (electron-builder + electron-updater).
 * Requires a published GitHub release with `latest.yml` / `latest-mac.yml` artifacts.
 * Draft-only releases are not visible to the public API — use a published release for updates.
 * Plug Sentry / webhook in error handler when wired.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    appendMainLog(`[updater] error: ${err.message}`);
    // Sentry / reporting webhook: capture updater failures in production
  });

  autoUpdater.on("update-available", (info) => {
    appendMainLog(`[updater] update available: ${info.version}`);
  });

  autoUpdater.on("update-not-available", (info) => {
    appendMainLog(`[updater] no update (${info.version})`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    appendMainLog(`[updater] update downloaded: ${info.version} — will install on quit`);
  });

  void autoUpdater.checkForUpdatesAndNotify();

  setInterval(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, CHECK_INTERVAL_MS);
}
