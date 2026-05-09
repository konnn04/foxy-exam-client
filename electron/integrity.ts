import { createHash, createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { appendMainLog } from "./diagnostic-log";

declare const __INTEGRITY_SECRET__: string;

interface IntegrityFile {
  path: string;
  hash: string;
  size: number;
}

interface IntegrityManifest {
  payload: {
    version: number;
    generated_at: string;
    nonce: string;
    files: IntegrityFile[];
  };
  signature: string;
}

export function verifyIntegrity(distElectronDir: string, distDir: string): { ok: boolean; error?: string } {
  const manifestPath = path.join(distElectronDir, "integrity-manifest.json");

  if (!existsSync(manifestPath)) {
    appendMainLog("[integrity] manifest not found — skipping");
    return { ok: true };
  }

  try {
    const manifest: IntegrityManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const payloadStr = JSON.stringify(manifest.payload);
    const expectedSig = createHmac("sha256", __INTEGRITY_SECRET__).update(payloadStr).digest("hex");

    if (expectedSig !== manifest.signature) {
      appendMainLog("[integrity] HMAC signature mismatch");
      return { ok: false, error: "Chữ ký manifest không hợp lệ." };
    }

    let failed = 0;
    for (const entry of manifest.payload.files) {
      const filePath = path.join(distDir, entry.path);

      if (!existsSync(filePath)) {
        appendMainLog(`[integrity] missing: ${entry.path}`);
        failed++;
        continue;
      }

      const actualHash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      if (actualHash !== entry.hash) {
        appendMainLog(`[integrity] hash mismatch: ${entry.path}`);
        failed++;
      }
    }

    if (failed > 0) {
      return { ok: false, error: `Phát hiện ${failed} file bị thay đổi.` };
    }

    appendMainLog(`[integrity] verified ${manifest.payload.files.length} files OK`);
    return { ok: true };
  } catch (err) {
    appendMainLog(`[integrity] error: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, error: "Lỗi kiểm tra toàn vẹn ứng dụng." };
  }
}
