import { BrowserWindow } from "electron";
import path from "path";
import { ELECTRON_RUNTIME } from "./runtime";
import { applyWindowSecurity } from "./security";

export const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(ELECTRON_RUNTIME.publicPath, "vite.svg"),
    webPreferences: {
      preload: path.join(ELECTRON_RUNTIME.dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !ELECTRON_RUNTIME.isProduction,
    },
  });

  applyWindowSecurity(mainWindow, {
    isProduction: ELECTRON_RUNTIME.isProduction,
    devServerUrl: ELECTRON_RUNTIME.devServerUrl,
  });

  if (ELECTRON_RUNTIME.devServerUrl) {
    mainWindow.loadURL(ELECTRON_RUNTIME.devServerUrl);
  } else {
    mainWindow.loadFile(path.join(ELECTRON_RUNTIME.distPath, "index.html"));
  }

  return mainWindow;
};
