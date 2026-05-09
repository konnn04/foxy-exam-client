import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const ELECTRON_DIST = path.join(ROOT, "dist-electron");
const MANIFEST_PATH = path.join(ELECTRON_DIST, "integrity-manifest.json");

function loadEnvSecret() {
  // Prefer env var (CI), fallback to .env file (local dev)
  if (process.env.INTEGRITY_SECRET) {
    return process.env.INTEGRITY_SECRET;
  }

  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) {
    console.error("❌ .env not found and INTEGRITY_SECRET env var not set");
    process.exit(1);
  }
  const match = readFileSync(envPath, "utf-8").match(/^INTEGRITY_SECRET=["']?(.+?)["']?\s*$/m);
  if (!match) {
    console.error("❌ INTEGRITY_SECRET not found in .env");
    process.exit(1);
  }
  return match[1];
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkDir(dir, base = dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkDir(full, base));
    } else {
      entries.push({
        path: path.relative(base, full).replace(/\\/g, "/"),
        hash: sha256(full),
        size: stat.size,
      });
    }
  }
  return entries;
}

console.log("🔐 Generating integrity manifest...");

if (!existsSync(DIST_DIR)) {
  console.error("❌ dist/ not found. Run `vite build` first.");
  process.exit(1);
}

const secret = loadEnvSecret();
const files = walkDir(DIST_DIR);

const payload = {
  version: 1,
  generated_at: new Date().toISOString(),
  nonce: randomBytes(16).toString("hex"),
  files,
};

const payloadStr = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

if (!existsSync(ELECTRON_DIST)) {
  mkdirSync(ELECTRON_DIST, { recursive: true });
}

writeFileSync(MANIFEST_PATH, JSON.stringify({ payload, signature }, null, 2));
console.log(`✅ Manifest: ${files.length} files, sig=${signature.substring(0, 16)}...`);
