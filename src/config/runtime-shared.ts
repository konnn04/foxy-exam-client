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
  return Boolean(isPackaged) || nodeEnv === "production" || toBoolean(viteProduction);
};
