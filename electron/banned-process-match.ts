/**
 * Banned process matching for ps/tasklist output.
 *
 * - No trailing *: EXACT match — a path/argv segment must equal the token (after normalizing .exe),
 *   or for multi-word tokens the raw line must contain that exact phrase with non-word boundaries.
 *   Never plain substring (so "tor" does not hit "monitor", "directory", …).
 * - Trailing *: PREFIX match on segments — "tor*" matches segments tor, tor_beta, tor-browser, not "monitor".
 * - Own app / whitelist / Electron browser heuristics unchanged.
 */

import path from "node:path";

const CHROME_EMBED_SEGMENTS = new Set([
  "chrome-sandbox",
  "chromedriver",
  "chrome_crashpad_handler",
]);

function splitProcessSegments(line: string): string[] {
  return line
    .toLowerCase()
    .split(/[\s\\/]+/)
    .map((t) => t.replace(/^[^\w.]+|[^\w.]+$/g, ""))
    .filter(Boolean);
}

function isChromeEmbedSegment(seg: string): boolean {
  if (CHROME_EMBED_SEGMENTS.has(seg)) return true;
  return seg.startsWith("chrome_crashpad");
}

function isLikelyElectronPackagedCommandLine(l: string): boolean {
  const x = l.toLowerCase();
  if (x.includes("app.asar")) return true;
  if (x.includes("node_modules/electron") || x.includes("node_modules\\electron")) return true;
  if (x.includes("/electron/dist/electron") || x.includes("\\electron\\dist\\electron")) return true;
  if (x.includes("electron.app/contents/macos/electron")) return true;
  return false;
}

function isBrowserTokenBase(base: string): boolean {
  const b = base.toLowerCase();
  if (b === "chrome" || b === "chromium") return true;
  if (b.startsWith("chrome.") || b.startsWith("chromium.")) return true;
  return (
    b === "msedge" ||
    b === "firefox" ||
    b === "brave" ||
    b === "opera" ||
    b === "vivaldi" ||
    b === "coccoc" ||
    b === "yandex" ||
    b === "tor" ||
    b === "safari" ||
    b === "edge" ||
    b === "microsoft-edge" ||
    b === "microsoft edge" ||
    b === "google-chrome" ||
    b === "chromium-browser" ||
    b === "chrome.exe" ||
    b === "msedge.exe" ||
    b === "ucbrowser"
  );
}

function collectProcessSegments(raw: string, platform: NodeJS.Platform): string[] {
  const segsUnix = splitProcessSegments(raw);
  const segsWin =
    platform === "win32"
      ? raw
          .toLowerCase()
          .split(/[^a-z0-9._]+/)
          .filter((t) => t.length > 0)
      : [];
  if (platform === "win32") {
    return Array.from(new Set(segsUnix.concat(segsWin)));
  }
  return segsUnix;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Multi-word exact token: phrase appears as a whole unit (not substring inside a longer word). */
function lineMatchesExactPhrase(raw: string, phraseLower: string): boolean {
  const p = phraseLower.trim();
  if (!p) return false;
  const esc = escapeRegExp(p);
  return new RegExp(`(^|[^a-zA-Z0-9._])${esc}([^a-zA-Z0-9._]|$)`, "i").test(raw);
}

/** Single-segment exact: "discord" === discord, "tor" === tor, not monitor (no segment "tor"). */
function segmentMatchesExactToken(seg: string, needleLower: string): boolean {
  const s = seg.toLowerCase().replace(/\.exe$/i, "").trim();
  const n = needleLower.replace(/\.exe$/i, "").trim();
  return s === n;
}

function lineMatchesExactChrome(raw: string, l: string, platform: NodeJS.Platform): boolean {
  if (/chrome-sandbox|chromedriver|chrome_crashpad_handler/i.test(raw)) {
    return false;
  }
  if (isLikelyElectronPackagedCommandLine(l)) {
    return false;
  }
  if (platform === "win32") {
    return /\bchrome\.exe\b/i.test(raw);
  }
  return (
    l.includes("google-chrome") ||
    l.includes("/opt/google/chrome") ||
    l.includes("/usr/bin/google-chrome") ||
    l.includes("/usr/share/google-chrome")
  );
}

/**
 * Exact token (no *): segment equality or multi-word phrase bounds — never includes().
 */
function lineMatchesExactToken(
  raw: string,
  l: string,
  needle: string,
  platform: NodeJS.Platform,
): boolean {
  if (needle === "chrome") {
    return lineMatchesExactChrome(raw, l, platform);
  }
  if (isBrowserTokenBase(needle) && isLikelyElectronPackagedCommandLine(l)) {
    return false;
  }
  if (needle.includes(" ")) {
    return lineMatchesExactPhrase(raw, needle);
  }
  const segs = collectProcessSegments(raw, platform);
  for (const seg of segs) {
    if (segmentMatchesExactToken(seg, needle)) {
      return true;
    }
  }
  return false;
}

/**
 * Wildcard *: prefix on at least one segment; multi-word prefix uses phrase-start in raw.
 */
function lineMatchesPrefix(
  raw: string,
  l: string,
  prefix: string,
  platform: NodeJS.Platform,
): boolean {
  if (prefix.includes(" ")) {
    const esc = escapeRegExp(prefix);
    if (!new RegExp(`(^|[^a-zA-Z0-9._])${esc}`, "i").test(raw)) {
      return false;
    }
    const firstWord = prefix.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (firstWord && isBrowserTokenBase(firstWord) && isLikelyElectronPackagedCommandLine(l)) {
      return false;
    }
    return true;
  }

  const segs = collectProcessSegments(raw, platform);
  for (const seg of segs) {
    if (!seg.startsWith(prefix)) continue;
    if (prefix === "chrome" && isChromeEmbedSegment(seg)) continue;
    if (prefix === "chrome" && seg === "chromium") continue;
    if (isBrowserTokenBase(prefix) && isLikelyElectronPackagedCommandLine(l)) continue;
    return true;
  }
  return false;
}

/**
 * True if this process line is the exam Electron app (any process sharing the packaged executable name or path).
 */
export function isOwnApplicationProcessLine(line: string, platform: NodeJS.Platform): boolean {
  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  const l = line.toLowerCase();

  if (platform === "win32") {
    const quoted = line.match(/^"([^"]*)"/);
    const first = (quoted?.[1] ?? line.split(",")[0]?.replace(/^"|"$/g, "") ?? "").trim().toLowerCase();
    if (!first) return false;
    const withExe = first.endsWith(".exe") ? first : `${first}.exe`;
    const baseNorm = base.endsWith(".exe") ? base : `${base}.exe`;
    return withExe === baseNorm || first === base.replace(/\.exe$/i, "").toLowerCase();
  }

  const e = exe.toLowerCase();
  if (e.length > 2 && l.includes(e)) return true;

  if (platform === "darwin") {
    const short = base.replace(/\.exe$/i, "").toLowerCase();
    const t = line.trim().toLowerCase();
    return t === short || t.startsWith(`${short} `);
  }

  return false;
}

function lineMatchesAppToken(
  line: string,
  appName: string,
  platform: NodeJS.Platform,
  options: { suppressOwnExePath: boolean },
): boolean {
  const trimmed = appName.trim();
  if (!trimmed) return false;

  const l = line.toLowerCase();
  const raw = line;

  if (options.suppressOwnExePath) {
    const exe = process.execPath.toLowerCase();
    if (exe.length > 2 && l.includes(exe)) {
      return false;
    }
  }

  const isWildcard = trimmed.endsWith("*");
  const base = (isWildcard ? trimmed.slice(0, -1) : trimmed).trim().toLowerCase();
  if (!base) return false;

  if (isWildcard) {
    return lineMatchesPrefix(raw, l, base, platform);
  }

  return lineMatchesExactToken(raw, l, base, platform);
}

function lineMatchesWhitelistToken(line: string, token: string, platform: NodeJS.Platform): boolean {
  return lineMatchesAppToken(line, token, platform, { suppressOwnExePath: false });
}

function lineMatchesBannedToken(line: string, appName: string, platform: NodeJS.Platform): boolean {
  return lineMatchesAppToken(line, appName, platform, { suppressOwnExePath: true });
}

/**
 * Tokens for OS shells that always have system-level instances running.
 * On Windows, only user-launched instances (not NT AUTHORITY\SYSTEM etc.) are flagged.
 * Matching uses the same prefix/exact rules as banned tokens.
 */
const WINDOWS_SYSTEM_SHELL_TOKENS = ["powershell", "cmd", "conhost"];

const WINDOWS_SYSTEM_USER_PREFIXES = [
  "nt authority",
  "nt-autorität",
  "window manager",
  "font driver host",
  "dwm-",
];

function isWindowsSystemShellToken(token: string): boolean {
  const base = token.replace(/\*$/, "").trim().toLowerCase();
  return WINDOWS_SYSTEM_SHELL_TOKENS.some((t) => base === t || base.startsWith(t));
}

/**
 * On Windows with `/V` CSV output the User Name is the 7th column (index 6).
 * Returns true if the user is a system account.
 */
function isWindowsSystemUserLine(csvLine: string): boolean {
  const cols = csvLine.match(/"([^"]*)"/g);
  if (!cols || cols.length < 7) return false;
  const user = (cols[6] ?? "").replace(/"/g, "").trim().toLowerCase();
  if (!user || user === "n/a") return true;
  return WINDOWS_SYSTEM_USER_PREFIXES.some((p) => user.startsWith(p));
}

export function findRunningBannedAppsFromPs(
  stdout: string,
  platform: NodeJS.Platform,
  appsToCheck: string[],
  whitelistApps: string[] = [],
): string[] {
  const lines =
    platform === "win32"
      ? stdout.split(/\r?\n/).filter(Boolean)
      : stdout.split("\n").filter(Boolean);

  const wl = whitelistApps ?? [];

  const found: string[] = [];
  for (const appName of appsToCheck) {
    const isShellToken = platform === "win32" && isWindowsSystemShellToken(appName);

    const hit = lines.some((line) => {
      if (isOwnApplicationProcessLine(line, platform)) return false;
      if (wl.length > 0 && wl.some((w) => lineMatchesWhitelistToken(line, w, platform))) {
        return false;
      }
      if (!lineMatchesBannedToken(line, appName, platform)) return false;
      if (isShellToken && isWindowsSystemUserLine(line)) return false;
      return true;
    });
    if (hit) {
      found.push(appName);
    }
  }
  return found;
}

/** Patterns ending with `*` are detect-only; killing by open-ended pattern is unsafe. */
export function bannedAppNamesKillable(names: string[]): string[] {
  return names.filter((n) => !n.trim().endsWith("*"));
}
