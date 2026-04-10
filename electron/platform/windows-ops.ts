import { exec, spawn } from "child_process";
import { promisify } from "util";
import type { IPlatformOps, ProcessInfo, VmDetectionResult, KillResult } from "./platform-ops";

const execAsync = promisify(exec);

const VM_KEYWORDS = ["kvm", "qemu", "vmware", "virtualbox", "vbox", "xen", "hyper-v", "hyperv", "parallels", "bochs", "bhyve", "virtual machine"];
function containsVmKeyword(input: string): boolean {
  const lower = input.toLowerCase();
  return VM_KEYWORDS.some((k) => lower.includes(k));
}

export class WindowsOps implements IPlatformOps {
  getProcessListCommand(): string {
    return "tasklist /V /FO CSV /NH";
  }

  parseProcessList(stdout: string): ProcessInfo[] {
    return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const cols = line.match(/"([^"]*)"/g);
      if (!cols || cols.length < 7) {
        const parts = line.replace(/"/g, "").split(",");
        return { name: parts[0]?.trim() || "", pid: parseInt(parts[1]) || 0, user: "" };
      }
      const strip = (s: string) => s.replace(/"/g, "").trim();
      return {
        name: strip(cols[0]),
        pid: parseInt(strip(cols[1])) || 0,
        user: strip(cols[6]),
      };
    });
  }

  getBannedAppsCommand(): string {
    return "tasklist /V /FO CSV /NH";
  }

  async detectVirtualMachine(): Promise<VmDetectionResult> {
    const reasons: string[] = [];
    const details: Record<string, string> = {};
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).Model; (Get-CimInstance Win32_ComputerSystem).Manufacturer; (Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion"'
      );
      const info = stdout.trim();
      details.windowsHardware = info;
      if (containsVmKeyword(info)) {
        reasons.push("windows_hardware_signature");
      }
    } catch { /* ignore */ }

    const uniqueReasons = Array.from(new Set(reasons));
    return {
      isVirtualMachine: uniqueReasons.length > 0,
      confidence: Math.min(1, uniqueReasons.length / 2),
      reasons: uniqueReasons,
      details,
    };
  }

  async killProcessByPid(pid: number, _name: string): Promise<KillResult> {
    if (!pid || pid <= 0) return { success: false, error: "Invalid PID" };
    if (pid === process.pid) return { success: false, error: "Cannot kill own process" };

    try {
      const { stdout } = await execAsync(
        `tasklist /FI "PID eq ${pid}" /V /FO CSV /NH`,
        { maxBuffer: 256 * 1024 },
      );
      const cols = stdout.match(/"([^"]*)"/g);
      if (cols && cols.length >= 7) {
        const user = (cols[6] ?? "").replace(/"/g, "").trim().toLowerCase();
        if (user.startsWith("nt authority") || user.startsWith("window manager") || user === "system") {
          return { success: false, error: "Cannot kill system process" };
        }
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore" });
        child.on("error", reject);
        child.on("close", (code: number) => {
          if (code === 0 || code === 1) resolve();
          else reject(new Error(`taskkill exited ${code}`));
        });
      });

      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Kill failed";
      return { success: false, error: msg };
    }
  }
}
