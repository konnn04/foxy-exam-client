import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { IPlatformOps, ProcessInfo, VmDetectionResult, KillResult } from "./platform-ops";

const execAsync = promisify(exec);

const VM_KEYWORDS = ["kvm", "qemu", "vmware", "virtualbox", "vbox", "xen", "hyper-v", "hyperv", "parallels", "bochs", "bhyve", "virtual machine"];
function containsVmKeyword(input: string): boolean {
  const lower = input.toLowerCase();
  return VM_KEYWORDS.some((k) => lower.includes(k));
}

export class LinuxOps implements IPlatformOps {
  getProcessListCommand(): string {
    return "ps -axo pid,user,comm,%cpu,%mem --no-headers";
  }

  parseProcessList(stdout: string): ProcessInfo[] {
    return stdout.split("\n").filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0]) || 0,
        user: parts[1] || "",
        name: parts[2] || "",
        cpu: parseFloat(parts[3]) || 0,
        mem: parseFloat(parts[4]) || 0,
      };
    });
  }

  getBannedAppsCommand(): string {
    return "ps -axo args | awk 'NR>1'";
  }

  async detectVirtualMachine(): Promise<VmDetectionResult> {
    const reasons: string[] = [];
    const details: Record<string, string> = {};

    try {
      const { stdout } = await execAsync("systemd-detect-virt || true");
      const virt = stdout.trim();
      if (virt && virt !== "none") {
        reasons.push(`systemd-detect-virt=${virt}`);
        details.systemdDetectVirt = virt;
      }
    } catch { /* ignore */ }

    const dmiFiles = [
      "/sys/class/dmi/id/product_name",
      "/sys/class/dmi/id/sys_vendor",
      "/sys/class/dmi/id/board_vendor",
      "/sys/class/dmi/id/bios_vendor",
    ];
    for (const f of dmiFiles) {
      try {
        const v = (await fs.readFile(f, "utf8")).trim();
        if (v) {
          details[f] = v;
          if (containsVmKeyword(v)) {
            reasons.push(`${path.basename(f)}=${v}`);
          }
        }
      } catch { /* ignore unavailable files */ }
    }

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
    if (pid <= 2) return { success: false, error: "Cannot kill system process" };

    try {
      process.kill(pid, "SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch { /* already dead */ }
      return { success: true };
    } catch (e: any) {
      if (e.code === "ESRCH") return { success: false, error: "Process not found" };
      if (e.code === "EPERM") return { success: false, error: "Permission denied" };
      return { success: false, error: e.message || "Kill failed" };
    }
  }
}
