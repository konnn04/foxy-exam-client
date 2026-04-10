/**
 * Interface for platform-dependent operations.
 * Each platform (Windows, macOS, Linux) implements this with static methods.
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  user?: string;
  cpu?: number;
  mem?: number;
}

export interface VmDetectionResult {
  isVirtualMachine: boolean;
  confidence: number;
  reasons: string[];
  details: Record<string, string>;
  error?: string;
}

export interface KillResult {
  success: boolean;
  error?: string;
}

export interface IPlatformOps {
  /** Command to list all processes (for process list panel). */
  getProcessListCommand(): string;

  /** Parse stdout from process list command into ProcessInfo[]. */
  parseProcessList(stdout: string): ProcessInfo[];

  /** Command to list process names for banned app detection. */
  getBannedAppsCommand(): string;

  /** Detect if the system is running inside a VM. */
  detectVirtualMachine(): Promise<VmDetectionResult>;

  /** Kill a process by PID. Returns success/error. */
  killProcessByPid(pid: number, name: string): Promise<KillResult>;
}
