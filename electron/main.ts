import "./runtime";
import { initSentryMain } from "./sentry-main";
import { app, BrowserWindow } from "electron";
import { configureMediaPermissions } from "./media-permissions";
import { createMainWindow } from "./main-window";
import { registerIpcHandlers } from "./ipc-handlers";
import { appendMainLog } from "./diagnostic-log";

initSentryMain();

process.on("uncaughtException", (err) => {
  appendMainLog(`uncaughtException: ${err?.stack ?? String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  appendMainLog(`unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

let mainWindow: BrowserWindow | null = null;

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
  configureMediaPermissions();
  registerIpcHandlers(() => mainWindow);
  mainWindow = createMainWindow();
});