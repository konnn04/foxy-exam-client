import { useEffect, useRef, useState } from "react";
import { useToastCustom } from "./use-toast-custom";
import { ExamTrackingConfig } from "@/types/exam";
import {
  DEVELOPMENT_MODE,
  EXAM_LOCKDOWN,
} from "@/config";
import { telemetryPublisher } from "@/lib/telemetry-publisher";

const EXAM_FULLSCREEN_EXIT_BLUR_MSG = "Chế độ xem toàn màn hình đã bị tắt.";

interface UseExamLockdownProps {
  wizardPhase: number;
  config: ExamTrackingConfig | null;
  examId?: string;
  submitting: boolean;
  /** Client-side UI lock callback — only for UX that needs instant feedback */
  setIsBlurred: (blurred: boolean) => void;
  setBlurReason: (reason: string) => void;
}

/**
 * Exam Lockdown Hook — Refactored for Telemetry Architecture
 *
 * This hook now ONLY:
 * 1. Captures raw events (keyboard, mouse, blur, process, display, network, perf)
 * 2. Sends them via telemetryPublisher → LiveKit DataChannel → Agent
 * 3. Applies CLIENT-SIDE instant locks for events that need real-time UX
 *    (banned_app, multiple_screens, exit_fullscreen, connection_lost)
 *
 * The Agent decides violations. Client does NOT create violations.
 */
export function useExamLockdown({
  wizardPhase,
  config,
  examId,
  submitting,
  setIsBlurred,
  setBlurReason,
}: UseExamLockdownProps) {
  const toast = useToastCustom();

  const [hardwareLock, setHardwareLock] = useState("");
  const [bannedApps, setBannedApps] = useState<string[]>([]);
  const [screenCount, setScreenCount] = useState<number>(1);

  const keyLogsRef = useRef<{ time: string; type: string; data: string }[]>([]);
  const lastMetricsTimeRef = useRef(performance.now());
  const fpsRef = useRef(0);

  // Process diff tracking
  const lastProcessListRef = useRef<Set<string>>(new Set());
  const isFirstProcessSnapshotRef = useRef(true);

  // Initial display ID (for monitor_changed detection)
  const initialDisplayIdRef = useRef<number | null>(null);
  const vmCheckDoneRef = useRef(false);
  /** Native Electron fullscreen lost (document.fullscreenElement stays null). */
  const nativeWindowFsLostRef = useRef(false);
  /** User requested no continuous perf/process telemetry during exam. */
  const PERF_CONTINUOUS_MONITORING = false;

  // FPS Counter removed to save CPU

  // ─── Global Input Hooks: Emit events, NOT violations ───────
  useEffect(() => {
    if (wizardPhase < 5) return;
    const trackingLvl = config?.level || "strict";
    const isFocusMode = config?.is_focus_mode ?? true;
    const isSecureContent = config?.is_secure_content ?? true;

    // Tab switch (visibilitychange)
    const handleVisibilityChange = () => {
      if (trackingLvl === "none" || !isFocusMode) return;
      if (document.hidden) {
        telemetryPublisher.send("tab_switch", {});
      } else {
        telemetryPublisher.send("tab_return", {});
      }
    };

    // Window blur/focus
    const handleBlur = () => {
      if (trackingLvl !== "none" && isFocusMode) {
        telemetryPublisher.send("window_blur", {});
      }
    };
    const handleFocus = () => {
      if (trackingLvl !== "none" && isFocusMode) {
        telemetryPublisher.emit("window_focus", {});
      }
    };

    // Context menu blocked
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Hardware/Window Protections based on Config
    if (window.electronAPI) {
      if (trackingLvl === "strict") {
        if (isFocusMode && window.electronAPI.setAlwaysOnTop) {
          window.electronAPI.setAlwaysOnTop(true);
        }
        if (isSecureContent && window.electronAPI.setContentProtection) {
          window.electronAPI.setContentProtection(true);
        }
      }
    }

    // Global hook (Electron native keyboard/mouse hook)
    if (window.electronAPI?.startGlobalHook && trackingLvl === "strict") {
      window.electronAPI.startGlobalHook();

      const handleGlobalHook = (_: any, payload: { type: string; data: string }) => {
        keyLogsRef.current.push({
          time: new Date().toISOString(),
          type: payload.type,
          data: payload.data,
        });

        if (payload.type === "keydown") {
          window.dispatchEvent(new CustomEvent("exam-keypressed", { detail: payload.data }));
          const lowerKey = payload.data.toLowerCase();
          if (lowerKey === "printscreen") {
            telemetryPublisher.send("screenshot", {});
          } else if (lowerKey === "f12") {
            if (!DEVELOPMENT_MODE.ENABLED) {
              telemetryPublisher.send("devtools", { source: "f12" });
            }
          }
        }
      };

      window.electronAPI.onGlobalHookEvent(handleGlobalHook);

      const handleDevToolsOpened = () => {
        if (!DEVELOPMENT_MODE.ENABLED) {
          telemetryPublisher.send("devtools", { source: "devtools_opened" });
        }
      };

      if (window.electronAPI.onDevToolsOpened) {
        window.electronAPI.onDevToolsOpened(handleDevToolsOpened);
      }

      (window as any)._cleanupGlobalHook = () => {
        if (window.electronAPI?.offGlobalHookEvent) {
          window.electronAPI.offGlobalHookEvent(handleGlobalHook);
        }
        if (window.electronAPI?.offDevToolsOpened) {
          window.electronAPI.offDevToolsOpened(handleDevToolsOpened);
        }
        if (window.electronAPI?.stopGlobalHook) {
          window.electronAPI.stopGlobalHook();
        }
        if (window.electronAPI?.setContentProtection) {
          window.electronAPI.setContentProtection(false);
        }
        if (window.electronAPI?.setAlwaysOnTop) {
          window.electronAPI.setAlwaysOnTop(false);
        }
      };
    }

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      window.dispatchEvent(new CustomEvent("exam-keypressed", { detail: e.key }));
      if (e.key === "PrintScreen") {
        e.preventDefault();
        telemetryPublisher.send("screenshot", { source: "keydown_printscreen" });
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const blockedKeys = EXAM_LOCKDOWN.BLOCKED_KEY_COMBINATIONS;
        if (blockedKeys.includes(e.key.toLowerCase())) {
          e.preventDefault();
          telemetryPublisher.send("keyboard_shortcut", {
            keys: `${e.ctrlKey ? "Ctrl" : "Cmd"}+${e.key.toUpperCase()}`,
          });
          return;
        }
      }
      if (e.key === "F11") {
        if (!DEVELOPMENT_MODE.ENABLED) e.preventDefault();
        telemetryPublisher.send("keyboard_shortcut", { keys: "F11" });
        return;
      }
      if (e.key === "F12") {
        if (!DEVELOPMENT_MODE.ENABLED) e.preventDefault();
      }
      
      // Block generic navigations on Production
      if (!DEVELOPMENT_MODE.ENABLED) {
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "r" || e.key === "F5")) {
          e.preventDefault();
        }
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
        }
      }
    };

    // Copy/Cut
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      telemetryPublisher.send("copy_attempt", {});
    };

    // Mouse click logging
    const handleMouseDown = (e: MouseEvent) => {
      if (!DEVELOPMENT_MODE.ENABLED) {
        if (e.button === 3 || e.button === 4) { // Mouse back/forward
          e.preventDefault();
        }
      }

      telemetryPublisher.emit("mouse_click", {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      });

      const ripple = document.createElement("div");
      ripple.className = "click-ripple";
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCopy);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCopy);
      document.removeEventListener("mousedown", handleMouseDown);

      if ((window as any)._cleanupGlobalHook) {
        (window as any)._cleanupGlobalHook();
      }
    };
  }, [wizardPhase, submitting, config]);

  // ─── Network info (log once) ───────────────────────────────
  useEffect(() => {
    if (wizardPhase < 5) return;
    if (!window.electronAPI?.getNetworkInfo) return;
    window.electronAPI
      .getNetworkInfo()
      .then((info: any) => {
        telemetryPublisher.emit("network_snapshot", { addresses: info });
      })
      .catch((e: any) => console.error("Failed to fetch network info", e));
  }, [wizardPhase]);

  // ─── VM detection (one-time at exam start) ───────────────────
  useEffect(() => {
    if (wizardPhase < 5 || submitting) return;
    if (vmCheckDoneRef.current) return;
    vmCheckDoneRef.current = true;

    (async () => {
      if (!window.electronAPI?.getVmDetection) return;
      try {
        const vm = await window.electronAPI.getVmDetection();
        if (!vm?.isVirtualMachine) return;

        telemetryPublisher.send("virtual_machine_detected", {
          confidence: vm.confidence,
          reasons: vm.reasons,
          details: vm.details,
        });

        const reasonText = `Phát hiện môi trường máy ảo (${(vm.confidence * 100).toFixed(0)}%). Vui lòng dùng máy vật lý để tiếp tục làm bài.`;
        if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV) {
          toast.error(`[Dev Bypass] ${reasonText}`);
        } else {
          setIsBlurred(true);
          setBlurReason(reasonText);
          setHardwareLock(reasonText);
        }
      } catch (error) {
        console.error("VM detection error", error);
      }
    })();
  }, [wizardPhase, submitting, setIsBlurred, setBlurReason, toast]);

  // ─── HW Monitoring: Display & Network change events ────────
  useEffect(() => {
    if (wizardPhase < 5) return;
    if (!window.electronAPI?.startHwMonitoring) return;

    window.electronAPI.startHwMonitoring();

    // Get initial display ID
    if (window.electronAPI.getDisplayId) {
      window.electronAPI.getDisplayId().then((display: any) => {
        if (display) {
          initialDisplayIdRef.current = display.id;
          telemetryPublisher.emit("display_snapshot", { displayId: display.id, label: display.label });
        }
      });
    }

    // Get initial Peripheral Device Snapshot
    if (window.electronAPI.getPeripheralSnapshot) {
      window.electronAPI.getPeripheralSnapshot().then((devices: any) => {
        if (devices && Array.isArray(devices)) {
          telemetryPublisher.emit("device_snapshot", { count: devices.length, devices });
        }
      });
    }

    const handleDisplayChanged = (_: any, data: any) => {
      telemetryPublisher.send("display_changed", data);

      // Client-side lock for multiple screens
      if (data.count > 1) {
        telemetryPublisher.send("multiple_screens", { count: data.count });
        
        const shouldLockMultiMonitor = config?.level === "strict" || config?.noMultiMonitor === true;
        if (!DEVELOPMENT_MODE.ENABLED && shouldLockMultiMonitor) {
          setIsBlurred(true);
          setBlurReason(`Phát hiện ${data.count} màn hình. Vui lòng chỉ sử dụng một màn hình.`);
          setHardwareLock(`Phát hiện ${data.count} màn hình. Vui lòng chỉ sử dụng một màn hình duy nhất.`);
        }
      }

      // Monitor changed (same count but different monitor)
      if (data.currentId !== initialDisplayIdRef.current && data.count <= 1) {
        telemetryPublisher.send("monitor_changed", {
          oldId: data.previousId,
          newId: data.currentId,
        });
      }
    };

    const handleNetworkChanged = (_: any, data: any) => {
      telemetryPublisher.send("network_changed", data);
    };

    const handlePeripheralChanged = (_: any, data: {action: string, device: any}) => {
      telemetryPublisher.send("device_changed", data);
    };

    window.electronAPI.onDisplayChanged?.(handleDisplayChanged);
    window.electronAPI.onNetworkChanged?.(handleNetworkChanged);
    window.electronAPI.onPeripheralChanged?.(handlePeripheralChanged);

    return () => {
      window.electronAPI?.stopHwMonitoring?.();
      window.electronAPI?.offDisplayChanged?.(handleDisplayChanged);
      window.electronAPI?.offNetworkChanged?.(handleNetworkChanged);
      window.electronAPI?.offPeripheralChanged?.(handlePeripheralChanged);
    };
  }, [wizardPhase, setIsBlurred, setBlurReason, config]);

  // ─── Hardware Checks: Banned Apps, Screen Count, Perf, Process ──
  useEffect(() => {
    if (wizardPhase < 5) return;
    const trackingLvl = config?.level || "none";
    const shouldCheckBannedApps = config?.detectBannedApps === true || trackingLvl === "strict";

    if (trackingLvl === "none" && !shouldCheckBannedApps) return;

    let hardwareViolated = false;

    const monitorInterval = setInterval(async () => {
      let isLocked = false;
      let lockMsgs: string[] = [];
      let detectedApps: string[] = [];
      let currentScreenCount = 1;

      if (window.electronAPI) {
        try {
          // Screen count check (telemetry emission handled by onDisplayChanged; only lock UI here)
          if (window.electronAPI.getScreenCount) {
            currentScreenCount = await window.electronAPI.getScreenCount();
            setScreenCount(currentScreenCount);
            
            const shouldLockMultiMonitor = config?.level === "strict" || config?.noMultiMonitor === true;
            if (currentScreenCount > 1 && shouldLockMultiMonitor) {
              if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_MULTI_SCREEN) {
                toast.error(`[Dev Bypass] Phát hiện ${currentScreenCount} màn hình (bypassed)`);
              } else if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV) {
                toast.error(`[Dev Bypass] Phát hiện ${currentScreenCount} màn hình.`);
              } else {
                isLocked = true;
                lockMsgs.push(`Phát hiện ${currentScreenCount} màn hình. Vui lòng chỉ sử dụng một màn hình duy nhất.`);
              }
            }
          }

          // Banned apps check
          if (window.electronAPI.getRunningBannedApps && shouldCheckBannedApps) {
            if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_BANNED_APPS) {
              setBannedApps([]);
            } else {
              const appsList = Array.isArray(config?.bannedApps) ? config.bannedApps : [];
              const whitelist = Array.isArray(config?.bannedAppsWhitelist) ? config.bannedAppsWhitelist : [];
              if (appsList.length > 0) {
                detectedApps = await window.electronAPI.getRunningBannedApps(appsList, whitelist);
                setBannedApps(detectedApps);
                if (detectedApps.length > 0) {
                  // Client-side lock immediately (don't wait for Agent)
                  if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV) {
                    toast.error(`[Dev Bypass] Đang mở phần mềm bị cấm: ${detectedApps.join(", ")}`);
                  } else {
                    isLocked = true;
                    lockMsgs.push(`Đang mở phần mềm bị cấm: ${detectedApps.join(", ")}. Vui lòng tắt các phần mềm này để tiếp tục.`);
                  }
                  telemetryPublisher.send("banned_app_detected", { apps: detectedApps });
                } else if (hardwareViolated) {
                  // Apps were cleared
                  telemetryPublisher.emit("banned_app_cleared", {});
                }
              } else {
                setBannedApps([]);
              }
            }
          }

          if (PERF_CONTINUOUS_MONITORING && window.electronAPI.getProcessList) {
            const processes: any[] = await window.electronAPI.getProcessList();
            const currentNames = new Set(processes.map((p: any) => p.name));

            if (isFirstProcessSnapshotRef.current) {
              telemetryPublisher.emit("process_snapshot", {
                action: "full",
                processes: processes.map((p: any) => ({ name: p.name, pid: p.pid })),
              });
              isFirstProcessSnapshotRef.current = false;
            } else {
              const started = [...currentNames].filter((n) => !lastProcessListRef.current.has(n));
              const stopped = [...lastProcessListRef.current].filter((n) => !currentNames.has(n));
              if (started.length > 0 || stopped.length > 0) {
                telemetryPublisher.emit("process_diff", { started, stopped });
              }
            }
            lastProcessListRef.current = currentNames;
          }
        } catch (e) {
          console.error("Lỗi Hardware Check:", e);
        }
      }

      if (isLocked) {
        const fullReason = lockMsgs.join("\n");
        setHardwareLock(fullReason);
        setIsBlurred(true);
        hardwareViolated = true;
      } else {
        if (hardwareViolated) {
          hardwareViolated = false;
        }
        setHardwareLock((prev) => {
          if (prev !== "") {
            setIsBlurred(false);
            setBlurReason("");
          }
          return "";
        });
      }

      // Removed FPS calculation to save CPU
      lastMetricsTimeRef.current = performance.now();
    }, 5000); // Every 5s for process and hardware

    // ─── System metrics (CPU/RAM) — disabled continuously, send summary on cleanup only
    let perfInterval: ReturnType<typeof setInterval> | null = null;
    if (PERF_CONTINUOUS_MONITORING && window.electronAPI?.getSystemMetrics) {
      perfInterval = setInterval(async () => {
        try {
          const metrics = await window.electronAPI!.getSystemMetrics!();
          telemetryPublisher.emit("perf_metrics", {
            ...metrics,
            fps: fpsRef.current,
          });
        } catch {
          /* ignore */
        }
      }, 5000);
    }

    return () => {
      clearInterval(monitorInterval);
      if (perfInterval) clearInterval(perfInterval);
      // Final summary snapshot (requested: no continuous performance monitoring).
      if (window.electronAPI?.getSystemMetrics) {
        window.electronAPI.getSystemMetrics().then((metrics: any) => {
          telemetryPublisher.emit("perf_metrics", {
            ...metrics,
            fps: fpsRef.current,
            summary: true,
            scope: "exam_end",
          });
        }).catch(() => {});
      }
      if (window.electronAPI?.getProcessList) {
        window.electronAPI.getProcessList().then((processes: any[]) => {
          telemetryPublisher.emit("process_snapshot", {
            action: "final",
            scope: "exam_end",
            processes: (processes || []).map((p: any) => ({ name: p.name, pid: p.pid })),
          });
        }).catch(() => {});
      }
    };
  }, [wizardPhase, config, examId, setIsBlurred, setBlurReason, toast]);

  // ─── Fullscreen: client-side lock (Layer 1) ────────────────
  useEffect(() => {
    if (wizardPhase < 5) return;
    if (window.electronAPI?.setFullScreen) return; // Electron handles native fullscreen

    const trackingLvl = config?.level || "strict";

    const requestFullscreen = async () => {
      if (trackingLvl === "none") return;
      if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_FULLSCREEN) return;
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        /* browser may reject */
      }
    };
    void requestFullscreen();

    const handleFullscreenChange = () => {
      if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_FULLSCREEN) return;
      if (!document.fullscreenElement && wizardPhase >= 5 && !submitting) {
        if (trackingLvl !== "none") {
          // Emit event to Agent
          telemetryPublisher.send("exit_fullscreen", {});

          // Client-side lock immediately
          if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV) {
            toast.error(`[Dev Bypass] ${EXAM_FULLSCREEN_EXIT_BLUR_MSG}`);
          } else {
            setIsBlurred(true);
            setBlurReason(EXAM_FULLSCREEN_EXIT_BLUR_MSG);
          }
        }
      } else if (document.fullscreenElement) {
        telemetryPublisher.emit("enter_fullscreen", {});
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [wizardPhase, submitting, config, toast, setIsBlurred, setBlurReason]);

  // ─── Native fullscreen (Electron): poll BrowserWindow — not tied to Fullscreen API ─
  useEffect(() => {
    if (wizardPhase < 5) return;

    const api = window.electronAPI;
    if (!api?.getWindowLockState || !api.setFullScreen) return;

    const trackingLvl = config?.level || "strict";
    const isFocusMode = config?.is_focus_mode ?? true;
    if (trackingLvl === "none" || !isFocusMode) return;
    if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_FULLSCREEN) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        let { isFullScreen } = await api.getWindowLockState!();
        if (!isFullScreen && trackingLvl === "strict" && isFocusMode) {
          api.setFullScreen(true);
          if (api.setAlwaysOnTop) api.setAlwaysOnTop(true);
          await new Promise((r) => setTimeout(r, 400));
          if (cancelled) return;
          isFullScreen = (await api.getWindowLockState!()).isFullScreen;
        }

        if (!isFullScreen && !submitting) {
          const firstInEpisode = !nativeWindowFsLostRef.current;
          nativeWindowFsLostRef.current = true;
          if (firstInEpisode) {
            telemetryPublisher.send("exit_fullscreen", { source: "native_window" });
          }
          if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV) {
            if (firstInEpisode) {
              toast.error(`[Dev Bypass] ${EXAM_FULLSCREEN_EXIT_BLUR_MSG}`);
            }
          } else {
            setIsBlurred(true);
            setBlurReason(EXAM_FULLSCREEN_EXIT_BLUR_MSG);
          }
        } else if (isFullScreen && nativeWindowFsLostRef.current) {
          nativeWindowFsLostRef.current = false;
          telemetryPublisher.emit("enter_fullscreen", {});
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wizardPhase, submitting, config, toast, setIsBlurred, setBlurReason]);

  const clearHardwareLock = () => {
    setHardwareLock("");
  };

  return {
    hardwareLock,
    bannedApps,
    screenCount,
    keyLogs: keyLogsRef.current,
    clearHardwareLock,
  };
}
