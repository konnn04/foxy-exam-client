import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEST_WASM = path.join(ROOT, "public", "mediapipe", "wasm");
const DEST_MODEL = path.join(ROOT, "public", "mediapipe", "face_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const SRC_WASM = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");

function copyWasmIfNeeded() {
  const marker = "vision_wasm_internal.wasm";
  const srcFile = path.join(SRC_WASM, marker);
  const destFile = path.join(DEST_WASM, marker);
  if (!fs.existsSync(srcFile)) {
    throw new Error(`Missing ${srcFile} — install dependencies (pnpm install / npm install).`);
  }
  let copy = !fs.existsSync(destFile);
  if (!copy) {
    copy = fs.statSync(srcFile).size !== fs.statSync(destFile).size;
  }
  if (copy) {
    fs.mkdirSync(DEST_WASM, { recursive: true });
    fs.cpSync(SRC_WASM, DEST_WASM, { recursive: true });
    console.log("[sync-mediapipe] Copied WASM from @mediapipe/tasks-vision → public/mediapipe/wasm/");
  } else {
    console.log("[sync-mediapipe] WASM up to date, skip copy.");
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        reject(new Error(`Download failed: HTTP ${res.statusCode} ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    });
    req.on("error", (err) => {
      try {
        file.close();
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      reject(err);
    });
    req.setTimeout(600_000, () => {
      req.destroy(new Error("Download timeout"));
    });
  });
}

async function ensureModel() {
  const force = String(process.env.FORCE_MEDIAPIPE_MODEL ?? "").toLowerCase() === "1";
  const minBytes = 2_000_000;
  if (!force && fs.existsSync(DEST_MODEL) && fs.statSync(DEST_MODEL).size >= minBytes) {
    console.log("[sync-mediapipe] face_landmarker.task present, skip download.");
    return;
  }
  console.log("[sync-mediapipe] Downloading face_landmarker.task …");
  await downloadFile(MODEL_URL, DEST_MODEL);
  console.log("[sync-mediapipe] Model saved:", DEST_MODEL);
}

async function main() {
  copyWasmIfNeeded();
  await ensureModel();
}

main().catch((e) => {
  console.error("[sync-mediapipe]", e);
  process.exit(1);
});
