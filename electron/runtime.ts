import { app } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const toBoolean = (value: unknown): boolean => String(value).toLowerCase() === "true";

const resolveProductionFlag = ({
  isPackaged,
  nodeEnv,
  viteProduction,
}: {
  isPackaged?: boolean;
  nodeEnv?: string;
  viteProduction?: string;
}): boolean => {
  return Boolean(isPackaged) || nodeEnv === "production" || toBoolean(viteProduction);
};

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const distPath = path.join(dirname, "../dist");
const publicPath = app.isPackaged ? distPath : path.join(distPath, "../public");

process.env.DIST = distPath;
process.env.VITE_PUBLIC = publicPath;

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};

const viteDevServerUrl = typeof viteEnv.VITE_DEV_SERVER_URL === "string"
  ? viteEnv.VITE_DEV_SERVER_URL
  : undefined;

const viteMode = typeof viteEnv.MODE === "string" ? viteEnv.MODE : undefined;
const viteProduction = typeof viteEnv.VITE_PRODUCTION === "string"
  ? viteEnv.VITE_PRODUCTION
  : undefined;

export const ELECTRON_RUNTIME = {
  dirname,
  distPath,
  publicPath,
  devServerUrl: process.env.VITE_DEV_SERVER_URL ?? viteDevServerUrl,
  isProduction: resolveProductionFlag({
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV ?? viteMode,
    viteProduction: process.env.VITE_PRODUCTION ?? viteProduction,
  }),
};
