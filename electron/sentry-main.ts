import * as Sentry from "@sentry/electron/main";
import { ELECTRON_RUNTIME } from "./runtime";

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};

/**
 * Main: production/packaged with DSN, or dev when VITE_SENTRY_ENABLE_DEV is true and DSN set.
 * plug-in: extend with release (git SHA) via vite define if needed
 */
export function initSentryMain(): void {
  const raw = viteEnv.VITE_SENTRY_DSN;
  const dsn = typeof raw === "string" ? raw.trim() : "";
  if (!dsn) {
    return;
  }

  const enableInDev =
    String(viteEnv.VITE_SENTRY_ENABLE_DEV ?? "").toLowerCase() === "true";
  if (!ELECTRON_RUNTIME.isProduction && !enableInDev) {
    return;
  }

  Sentry.init({
    dsn,
    environment: ELECTRON_RUNTIME.isProduction ? "production" : "development",
    tracesSampleRate: ELECTRON_RUNTIME.isProduction ? 0.1 : 1,
    debug: enableInDev,
  });
}
