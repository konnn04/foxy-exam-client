import { BrowserWindow } from "electron";

type HardeningOptions = {
  isProduction: boolean;
  devServerUrl?: string;
};

export const applyWindowSecurity = (
  mainWindow: BrowserWindow,
  { isProduction, devServerUrl }: HardeningOptions
) => {
  mainWindow.setContentProtection(true);

  mainWindow.webContents.on("devtools-opened", () => {
    if (isProduction) {
      mainWindow.webContents.closeDevTools();
    }
    mainWindow.webContents.send("devtools-opened");
  });

  if (!isProduction) {
    return;
  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = (devServerUrl && url.startsWith(devServerUrl)) || url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
    }
  });
};
