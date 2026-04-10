import fs from "fs";
import path from "path";
import { app } from "electron";

export function isDiagnosticMode(): boolean {
  const v = process.env.FOXY_EXAM_DEBUG;
  return v === "1" || String(v).toLowerCase() === "true";
}

export function appendMainLog(line: string): void {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.error("[foxy-exam]", msg);
  try {
    if (!app.isReady()) return;
    const file = path.join(app.getPath("userData"), "foxy-exam-main.log");
    fs.appendFileSync(file, `${msg}\n`, "utf8");
  } catch {
    /* plug-in: production error reporting */
  }
}
