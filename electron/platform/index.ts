import type { IPlatformOps } from "./platform-ops";
import { WindowsOps } from "./windows-ops";
import { DarwinOps } from "./darwin-ops";
import { LinuxOps } from "./linux-ops";

let _instance: IPlatformOps | null = null;

export function getPlatformOps(): IPlatformOps {
  if (_instance) return _instance;

  switch (process.platform) {
    case "win32":
      _instance = new WindowsOps();
      break;
    case "darwin":
      _instance = new DarwinOps();
      break;
    default:
      _instance = new LinuxOps();
      break;
  }
  return _instance;
}

export type { IPlatformOps, ProcessInfo, VmDetectionResult, KillResult } from "./platform-ops";
