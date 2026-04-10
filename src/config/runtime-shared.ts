export type RuntimeProductionInput = {
  isPackaged?: boolean;
  nodeEnv?: string;
  viteProduction?: string;
};

export const toBoolean = (value: unknown): boolean =>
  String(value).toLowerCase() === "true";

export const resolveProductionFlag = ({
  isPackaged,
  nodeEnv,
  viteProduction,
}: RuntimeProductionInput): boolean => {
  // `vite build --mode development` (build:dev): packaged app still gets DevTools / dev bypasses.
  if (nodeEnv === "development") {
    return false;
  }
  return Boolean(isPackaged) || nodeEnv === "production" || toBoolean(viteProduction);
};
