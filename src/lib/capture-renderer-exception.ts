import * as Sentry from "@sentry/electron/renderer";

/**
 * Report handled failures from the renderer (MediaPipe, precheck, etc.).
 * No-op if Sentry was never initialised (missing VITE_SENTRY_DSN at build time).
 */
export function captureRendererException(
  error: unknown,
  context: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context.tags ?? {})) {
        scope.setTag(k, v);
      }
      for (const [k, v] of Object.entries(context.extra ?? {})) {
        scope.setExtra(k, v);
      }
      Sentry.captureException(err);
    });
  } catch {
    // Sentry must never break the exam flow
  }
}
