import { BrowserWindow, dialog } from "electron";
import path from "path";
import { ELECTRON_RUNTIME } from "./runtime";
import { applyWindowSecurity } from "./security";
import { appendMainLog, isDiagnosticMode } from "./diagnostic-log";
import { isExamCloseGuardActive, getExamCloseGuardMessage, setExamCloseGuard } from "./exam-close-guard";

export const createMainWindow = () => {
  const allowDebug = isDiagnosticMode();
  const indexHtml = path.join(ELECTRON_RUNTIME.distPath, "index.html");

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(ELECTRON_RUNTIME.publicPath, "assets/icons/icon.png"),
    webPreferences: {
      preload: path.join(ELECTRON_RUNTIME.dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !ELECTRON_RUNTIME.isProduction || allowDebug,
    },
  });

  applyWindowSecurity(mainWindow, {
    isProduction: ELECTRON_RUNTIME.isProduction,
    devServerUrl: ELECTRON_RUNTIME.devServerUrl,
    allowDevTools: allowDebug,
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    appendMainLog(`did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    appendMainLog("did-finish-load");
  });
  // Renderer console can be very noisy in long exam sessions; keep it only in diagnostic mode.
  if (allowDebug) {
    mainWindow.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2) {
        appendMainLog(`renderer console level=${level} ${message}`);
      }
    });
  }

  if (ELECTRON_RUNTIME.devServerUrl) {
    appendMainLog(`loadURL ${ELECTRON_RUNTIME.devServerUrl}`);
    mainWindow.loadURL(ELECTRON_RUNTIME.devServerUrl);
  } else {
    appendMainLog(`loadFile ${indexHtml} packaged=${String(Boolean(ELECTRON_RUNTIME.isProduction))}`);
    mainWindow.loadFile(indexHtml);
  }

  if (allowDebug) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  let allowCloseWithoutConfirm = false;
  mainWindow.on("close", (event) => {
    if (allowCloseWithoutConfirm) {
      return;
    }
    if (!isExamCloseGuardActive()) {
      return;
    }
    event.preventDefault();
    void dialog
      .showMessageBox(mainWindow, {
        type: "warning",
        title: "Đang làm bài thi",
        message: getExamCloseGuardMessage(),
        buttons: ["Ở lại làm bài", "Đóng ứng dụng"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 1) {
          setExamCloseGuard(false);
          allowCloseWithoutConfirm = true;
          mainWindow.close();
        }
      })
      .catch(() => {
        /* user dismissed — stay */
      });
  });

  return mainWindow;
};
