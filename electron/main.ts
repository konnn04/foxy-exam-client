import "./runtime";
import { initSentryMain } from "./sentry-main";
import { app, BrowserWindow, dialog, session } from "electron";
import { configureMediaPermissions } from "./media-permissions";
import { createMainWindow } from "./main-window";
import { registerIpcHandlers } from "./ipc-handlers";
import {
  appendMainLog,
  flushMainLogPreReadyQueue,
  logMainLogFileLocation,
} from "./diagnostic-log";
import { ELECTRON_RUNTIME } from "./runtime";
import { verifyIntegrity } from "./integrity";
import { initAutoUpdater } from "./updater";

initSentryMain();

process.on("uncaughtException", (err) => {
  appendMainLog(`uncaughtException: ${err?.stack ?? String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  appendMainLog(`unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

let mainWindow: BrowserWindow | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
      mainWindow = null;
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });

  app.whenReady().then(() => {
  // ── Content-Security-Policy ──────────────────────────────────────
  // Production: strict CSP. MediaPipe WASM needs 'wasm-unsafe-eval' on script-src
  // (see Chrome docs); do not use full 'unsafe-eval'.
  // Dev: allows localhost HMR + eval for Vite
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = ELECTRON_RUNTIME.isProduction
      ? [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' https: wss: blob:",
          "media-src 'self' blob: mediastream:",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "worker-src 'self' blob:",
        ].join("; ")
      : [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: blob: https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline' https:",
          "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https: wss: blob:",
          "media-src 'self' blob: mediastream:",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "worker-src 'self' blob:",
        ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  flushMainLogPreReadyQueue();
  logMainLogFileLocation();

  if (ELECTRON_RUNTIME.isProduction) {
    const result = verifyIntegrity(ELECTRON_RUNTIME.dirname, ELECTRON_RUNTIME.distPath);
    if (!result.ok) {
      appendMainLog(`[main] integrity check failed: ${result.error}`);
      dialog.showErrorBox(
        "Lỗi bảo mật — Foxy Exam",
        `Phát hiện ứng dụng đã bị chỉnh sửa.\n\n${result.error}\n\nVui lòng tải lại ứng dụng gốc từ nguồn chính thức.`
      );
      app.quit();
      return;
    }
  }

  configureMediaPermissions();
  registerIpcHandlers(() => mainWindow);
  mainWindow = createMainWindow();
  initAutoUpdater();
  });
}