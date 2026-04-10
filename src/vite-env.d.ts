/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  /** When "true" and DSN is set, Sentry runs in `pnpm dev` (environment: development). */
  readonly VITE_SENTRY_ENABLE_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
