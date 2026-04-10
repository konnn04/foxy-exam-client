/**
 * Kill processes matching a banned-app token only after path guards so we do not touch
 * OS daemons (systemd, launchd, System32, etc.) or the exam Electron binary.
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

import { isUnsafeUnixPkillFArg } from "./unix-kill-pattern";

const execFileAsync = promisify(execFile);

function norm(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

const LINUX_EXE_PREFIX_DENY = [
  "/usr/lib/systemd/",
  "/lib/systemd/",
  "/usr/sbin/",
  "/sbin/",
  "/snap/core/",
  "/snap/snapd/",
  "/usr/lib/firmware/",
];

const DARWIN_CMD_PREFIX_DENY = [
  "/system/",
  "/usr/libexec/",
  "/usr/sbin/",
  "/sbin/",
  "/library/system/",
  "/library/launchagents/", // Apple system agents — skip; user apps use /Users/.../LaunchAgents
];

const WIN_PATH_SUBSTR_DENY = [
  "\\windows\\system32\\",
  "\\windows\\syswow64\\",
  "\\windows\\winsxs\\",
  "\\windows\\servicing\\",
  "\\program files\\windows defender\\",
  // Not WindowsApps: Edge/Chrome from Microsoft Store live there and must remain killable.
];

function isDeniedLinuxExe(exeLower: string): boolean {
  if (!exeLower || exeLower === "(deleted)" || exeLower.startsWith("/memfd:")) return true;
  return LINUX_EXE_PREFIX_DENY.some((pre) => exeLower.startsWith(pre));
}

function firstPathishTokenDarwin(cmd: string): string {
  const trimmed = cmd.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 1 ? trimmed.slice(1, end) : trimmed;
  }
  return trimmed.split(/\s+/)[0] ?? "";
}

function isDeniedDarwinCmd(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return true;
  const first = firstPathishTokenDarwin(trimmed);
  const p = norm(first);
  if (!p.startsWith("/")) return false;
  return DARWIN_CMD_PREFIX_DENY.some((pre) => p.startsWith(pre));
}

function isDeniedWinExe(fullPath: string): boolean {
  const p = norm(fullPath);
  if (!p || p.length < 4) return true;
  return WIN_PATH_SUBSTR_DENY.some((s) => p.includes(s));
}

function isOwnExamBinaryPath(candidate: string): boolean {
  const exe = process.execPath;
  if (!exe || exe.length < 2) return false;
  const a = norm(candidate);
  const b = norm(exe);
  return a.includes(b) || b.includes(a);
}

async function linuxReadExe(pid: number): Promise<string | null> {
  try {
    return await fs.readlink(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

/** procps pgrep -f uses ERE; escape metacharacters so e.g. chrome.exe is literal. */
function escapePgrepEre(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pgrepF(pattern: string): Promise<number[]> {
  const ere = escapePgrepEre(pattern.trim());
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", ere], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err.code === 1) return [];
    throw e;
  }
}

async function darwinPsCommand(pid: number): Promise<string> {
  const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-ww", "-o", "command="], {
    encoding: "utf8",
  });
  return stdout.trim();
}

function winImageName(token: string): string {
  const t = token.trim();
  if (/\.exe$/i.test(t)) return t;
  return `${t}.exe`;
}

type WinProcRow = { pid: number; exePath: string | null };

async function winListProcessesByImageName(imageName: string): Promise<WinProcRow[]> {
  const im = winImageName(imageName).replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$name = '${im}'`,
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq $name } | ForEach-Object {",
    "  [PSCustomObject]@{ ProcessId = $_.ProcessId; ExecutablePath = $_.ExecutablePath }",
    "}",
    "| ConvertTo-Json -Compress -Depth 3",
  ].join("\n");

  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );

  const raw = stdout.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out: WinProcRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const pid = Number(o.ProcessId ?? o.processId ?? o.Pid ?? o.pid);
    const p = o.ExecutablePath ?? o.executablePath ?? o.Path ?? o.path;
    if (!Number.isFinite(pid) || pid <= 0) continue;
    out.push({ pid, exePath: typeof p === "string" && p.length > 0 ? p : null });
  }
  return out;
}

/**
 * Kill matching processes on Linux/macOS: pgrep -f then filter by path / command, never pkill -f blindly.
 */
export async function killUnixBannedTokenWithPathGuard(
  appName: string,
  platform: NodeJS.Platform,
): Promise<void> {
  if (platform === "win32") {
    throw new Error("killUnixBannedTokenWithPathGuard: use Windows kill helper");
  }

  if (isUnsafeUnixPkillFArg(appName)) {
    throw new Error(
      `Refusing kill for pattern "${appName}" on Unix (too broad for substring match). Close manually or use a more specific token.`,
    );
  }

  const pids = await pgrepF(appName.trim());
  if (pids.length === 0) {
    return;
  }

  const allowed: number[] = [];

  for (const pid of pids) {
    if (pid === process.pid) continue;

    if (platform === "linux") {
      if (pid <= 1) continue;
      const exe = await linuxReadExe(pid);
      if (!exe) continue;
      const low = norm(exe);
      if (isOwnExamBinaryPath(low)) continue;
      if (isDeniedLinuxExe(low)) continue;
      allowed.push(pid);
      continue;
    }

    if (platform === "darwin") {
      if (pid <= 1) continue;
      let cmd: string;
      try {
        cmd = await darwinPsCommand(pid);
      } catch {
        continue;
      }
      if (isOwnExamBinaryPath(cmd)) continue;
      if (isDeniedDarwinCmd(cmd)) continue;
      allowed.push(pid);
      continue;
    }

    allowed.push(pid);
  }

  if (allowed.length === 0) {
    throw new Error(
      `No safe targets to kill for "${appName}" (only system-protected or exam-app processes matched). Close the app manually.`,
    );
  }

  for (const pid of allowed) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore ESRCH */
    }
  }

  await new Promise((r) => setTimeout(r, 400));

  for (const pid of allowed) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead or ESRCH */
    }
  }
}

/**
 * Windows: enumerate by image name, skip System32 / WinSxS / Defender paths, then taskkill /PID.
 */
export async function killWinBannedTokenWithPathGuard(appName: string): Promise<void> {
  const rows = await winListProcessesByImageName(appName);
  if (rows.length === 0) {
    return;
  }

  const allowed: number[] = [];
  for (const row of rows) {
    if (row.pid === process.pid) continue;
    if (!row.exePath) continue;
    if (isDeniedWinExe(row.exePath)) continue;
    if (isOwnExamBinaryPath(row.exePath)) continue;
    allowed.push(row.pid);
  }

  if (allowed.length === 0) {
    throw new Error(
      `No safe targets to kill for "${appName}" (only system paths matched). Close the app manually.`,
    );
  }

  for (const pid of allowed) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code: number) => {
        if (code === 0 || code === 1 || code === 128 || code === 255) {
          resolve();
          return;
        }
        reject(new Error(`taskkill /PID ${pid} exited ${String(code)}`));
      });
    });
  }
}

export async function killBannedTokenCrossPlatform(
  appName: string,
  platform: NodeJS.Platform,
): Promise<void> {
  if (platform === "win32") {
    await killWinBannedTokenWithPathGuard(appName);
  } else {
    await killUnixBannedTokenWithPathGuard(appName, platform);
  }
}
