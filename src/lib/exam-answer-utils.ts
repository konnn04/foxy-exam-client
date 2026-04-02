import type { Answer } from "@/types/exam";

/** Whether a leaf question has a non-empty saved response (MC, TF, fill JSON, text). */
export function isLeafAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.answer_id != null && a.answer_id !== undefined) return true;
  const c = a.answer_content;
  if (c == null || c === "") return false;
  const t = String(c).trim();
  if (t === "true" || t === "false") return true;
  try {
    const j = JSON.parse(c) as unknown;
    if (Array.isArray(j)) {
      return j.some((x) => String(x ?? "").trim() !== "");
    }
  } catch {
    /* plain text */
  }
  return t.length > 0;
}
