import * as Sentry from "@sentry/electron/renderer";

/**
 * Renderer: production build with DSN, or dev when VITE_SENTRY_ENABLE_DEV=true and DSN set.
 */
const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();
const enableInDev =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_SENTRY_ENABLE_DEV ?? "").toLowerCase() === "true";

if (dsn && (import.meta.env.PROD || enableInDev)) {
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? "production" : "development",
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    debug: enableInDev,
  });
}
