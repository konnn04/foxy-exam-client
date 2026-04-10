import { z } from "zod";

/** Trailing `*` = prefix wildcard (detect only for kill). No other `*` allowed. */
/** Aligned with exam-sys validation: ASCII letters, digits, . _ - space, optional trailing *. */
const bannedSegment = z.string().min(1).max(120).regex(/^[A-Za-z0-9._\- ]+\*?$/);

/** Must accept merged exam + global lists (often 80–150+ tokens); Laravel does not cap array length. */
const MAX_APP_TOKENS = 256;

function parseAppTokenList(input: unknown, errorMessage: string): string[] {
  if (input === undefined || input === null) {
    return [];
  }
  const r = z.array(bannedSegment).max(MAX_APP_TOKENS).safeParse(input);
  if (!r.success) {
    throw new Error(errorMessage);
  }
  return r.data;
}

/** App/process name tokens safe for tasklist/pkill wrappers (no shell metacharacters). */
export function parseBannedAppNames(input: unknown): string[] {
  return parseAppTokenList(input, "Invalid banned app name list");
}

export function parseWhitelistAppNames(input: unknown): string[] {
  return parseAppTokenList(input, "Invalid banned apps whitelist");
}

const looseObject = z.record(z.string(), z.unknown());

export const saveExamLogPayloadSchema = z.object({
  examId: z.string().min(1).max(64).regex(/^[\w-]+$/),
  violations: z.array(looseObject).max(10000),
  tracking: z.array(looseObject).max(50000),
});

export type SaveExamLogPayload = z.infer<typeof saveExamLogPayloadSchema>;

export function parseSaveExamLogPayload(input: unknown): SaveExamLogPayload {
  const r = saveExamLogPayloadSchema.safeParse(input);
  if (!r.success) {
    throw new Error("Invalid save-exam-log payload");
  }
  return r.data;
}

const logMetricsSchema = z.object({
  examId: z.string().min(1).max(64).regex(/^[\w-]+$/),
  fps: z.number().finite().min(0).max(480),
});

export function parseLogSystemMetricsPayload(input: unknown): z.infer<typeof logMetricsSchema> {
  const r = logMetricsSchema.safeParse(input);
  if (!r.success) {
    throw new Error("Invalid log-system-metrics payload");
  }
  return r.data;
}

export function parseOptionalDisplayId(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }
  const n =
    typeof input === "string"
      ? Number.parseInt(input, 10)
      : typeof input === "number"
        ? input
        : Number.NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 999_999) {
    return undefined;
  }
  return n;
}
