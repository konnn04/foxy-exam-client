import fs from "fs";
import path from "path";
import { app } from "electron";

export function isDiagnosticMode(): boolean {
  const v = process.env.FOXY_EXAM_DEBUG;
  return v === "1" || String(v).toLowerCase() === "true";
}

export function getMainLogFilePath(): string {
  try {
    return path.join(app.getPath("userData"), "foxy-exam-main.log");
  } catch {
    return path.join(process.cwd(), "foxy-exam-main.log");
  }
}

const preReadyLines: string[] = [];

function writeLineToFile(msg: string): void {
  const file = getMainLogFilePath();
  fs.appendFileSync(file, `${msg}\n`, "utf8");
}

export function flushMainLogPreReadyQueue(): void {
  if (preReadyLines.length === 0) return;
  try {
    const file = getMainLogFilePath();
    fs.appendFileSync(file, `${preReadyLines.join("\n")}\n`, "utf8");
    preReadyLines.length = 0;
  } catch (err) {
    console.error("[foxy-exam] flushMainLogPreReadyQueue failed", err);
  }
}

export function appendMainLog(line: string): void {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.error("[foxy-exam]", msg);
  try {
    if (!app.isReady()) {
      preReadyLines.push(msg);
      return;
    }
    writeLineToFile(msg);
  } catch (err) {
    console.error("[foxy-exam] appendMainLog file write failed:", err);
    console.error("[foxy-exam] intended log path:", getMainLogFilePath());
  }
}

export function logMainLogFileLocation(): void {
  try {
    if (!app.isReady()) return;
    const file = getMainLogFilePath();
    const banner = `[${new Date().toISOString()}] Main log file: ${file}`;
    console.error("[foxy-exam]", banner);
    writeLineToFile(banner);
  } catch (err) {
    console.error("[foxy-exam] logMainLogFileLocation failed", err);
  }
}
