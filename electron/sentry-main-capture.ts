import * as Sentry from "@sentry/electron/main";

/**
 * IPC errors are handled by Electron and forwarded to the renderer; they do not become
 * uncaughtException on the main process, so Sentry will not see them unless captured here.
 */
export function captureMainException(
  error: unknown,
  options?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    if (options?.tags) {
      for (const [k, v] of Object.entries(options.tags)) {
        scope.setTag(k, v);
      }
    }
    if (options?.extra) {
      for (const [k, v] of Object.entries(options.extra)) {
        scope.setExtra(k, v);
      }
    }
    Sentry.captureException(err);
  });
}
