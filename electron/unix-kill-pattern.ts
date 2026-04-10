/**
 * Linux/macOS use `pkill -f <arg>`: the pattern is matched as a substring anywhere in the full argv string.
 * Tokens like "tor" hit unrelated processes (e.g. *tor* inside "monitor", "directory", "factory").
 * Never pass such patterns to pkill -f — refuse kill and let the user close the app manually.
 */

const UNIX_PKILL_F_DENY = new Set([
  "tor",
  "edge",
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "node",
  "python",
  "java",
  "ruby",
  "perl",
  "php",
  "cat",
  "dd",
  "ps",
  "ls",
  "grep",
  "ssh",
  "scp",
  "apt",
  "dnf",
  "yum",
  "snap",
  "flatpak",
  "systemctl",
  "dbus",
  "zoom",
  "meet",
  "wine",
  "curl",
  "wget",
]);

function variantsForCheck(appName: string): string[] {
  const t = appName.trim().toLowerCase();
  if (!t) return [];
  const noExe = t.replace(/\.exe$/i, "");
  return noExe === t ? [t] : [t, noExe];
}

export function isUnsafeUnixPkillFArg(appName: string): boolean {
  for (const v of variantsForCheck(appName)) {
    if (v.length <= 3) return true;
    if (UNIX_PKILL_F_DENY.has(v)) return true;
  }
  return false;
}
