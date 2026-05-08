import { BrowserWindow, shell } from "electron";

type HardeningOptions = {
  isProduction: boolean;
  devServerUrl?: string;
  /** FOXY_EXAM_DEBUG=1 — allow DevTools and debug shortcuts in packaged builds. */
  allowDevTools?: boolean;
};

export const applyWindowSecurity = (
  mainWindow: BrowserWindow,
  { isProduction, devServerUrl, allowDevTools = false }: HardeningOptions
) => {
  mainWindow.setContentProtection(true);

  mainWindow.webContents.on("devtools-opened", () => {
    if (isProduction && !allowDevTools) {
      mainWindow.webContents.closeDevTools();
    }
    mainWindow.webContents.send("devtools-opened");
  });

  // Mở link ngoài (http/https) bằng trình duyệt hệ thống, không tạo cửa sổ con trong app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (!isProduction) {
    return;
  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = (devServerUrl && url.startsWith(devServerUrl)) || url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (allowDevTools) {
    return;
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const ctrlOrCmd = input.control || input.meta;
    const shift = input.shift;

    const blockedDebugCombo =
      key === "f12" || (ctrlOrCmd && shift && (key === "i" || key === "j" || key === "c"));
    const blockedReloadCombo =
      key === "f5" || (ctrlOrCmd && (key === "r" || (shift && key === "r")));

    if (blockedDebugCombo || blockedReloadCombo) {
      event.preventDefault();
    }
  });
};
