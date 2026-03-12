import { useEffect, useRef, useState } from "react";
import { useToastCustom } from "./use-toast-custom";
import { ExamTrackingConfig } from "@/types/exam";
import { DEV_MODE, NO_LOCKSCREEN_WHEN_DEV_MODE } from "@/config/app";

interface UseExamLockdownProps {
  wizardPhase: number;
  config: ExamTrackingConfig | null;
  examId?: string;
  submitting: boolean;
  addViolation: (type: string, message: string) => void;
  setIsBlurred: (blurred: boolean) => void;
  setBlurReason: (reason: string) => void;
}

export function useExamLockdown({
  wizardPhase,
  config,
  examId,
  submitting,
  addViolation,
  setIsBlurred,
  setBlurReason,
}: UseExamLockdownProps) {
  const toast = useToastCustom();
  
  const [hardwareLock, setHardwareLock] = useState("");
  const [bannedApps, setBannedApps] = useState<string[]>([]);
  const [screenCount, setScreenCount] = useState<number>(1);
  
  const keyLogsRef = useRef<{time: string, type: string, data: string}[]>([]);
  const frameCountRef = useRef(0);
  const lastMetricsTimeRef = useRef(performance.now());
  const fpsRef = useRef(0);

  // FPS Counter
  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      frameCountRef.current++;
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Global Input Hooks (Keyboard, Mouse, Blur, Tab switch, etc.)
  useEffect(() => {
    if (wizardPhase < 7) return;
    const trackingLvl = config?.level || "strict";
    
    const handleVisibilityChange = () => {
      if (document.hidden && trackingLvl !== "none") {
        addViolation("tab_switch", "Bạn đã chuyển tab hoặc rời khỏi trang thi.");
      }
    };

    const handleBlur = () => {
      if (trackingLvl !== "none") {
        addViolation("window_blur", "Bạn đã chuyển sang cửa sổ khác.");
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    if (window.electronAPI?.startGlobalHook && trackingLvl === "strict") {
      window.electronAPI.startGlobalHook();
      
      const handleGlobalHook = (_: any, payload: { type: string, data: string }) => {
        keyLogsRef.current.push({
          time: new Date().toISOString(),
          type: payload.type,
          data: payload.data
        });
        
        if (payload.type === "keydown") {
          const lowerKey = payload.data.toLowerCase();
          if (lowerKey === "printscreen") {
            addViolation("screenshot", "Bạn đã cố chụp ảnh màn hình.");
          } else if (lowerKey === "f12") {
            if (!DEV_MODE) {
              addViolation("devtools", "Bạn đã cố mở Developer Tools.");
            }
          }
        }
      };
      
      window.electronAPI.onGlobalHookEvent(handleGlobalHook);
      
      const handleDevToolsOpened = () => {
        if (!DEV_MODE) {
          addViolation("devtools", "Phát hiện mở Developer Tools.");
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
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const blockedKeys = ["c", "v", "a", "p", "s", "u", "shift"];
        if (blockedKeys.includes(e.key.toLowerCase())) {
          e.preventDefault();
          addViolation("keyboard_shortcut", `Phím tắt bị cấm: ${e.ctrlKey ? "Ctrl" : "Cmd"}+${e.key.toUpperCase()}`);
          return;
        }
      }
      if (e.key === "F11") {
        if (!DEV_MODE) {
          e.preventDefault();
        }
        addViolation("keyboard_shortcut", `Phím tắt bị cấm: ${e.key}`);
        return;
      }
      if (e.key === "F12") {
        if (!DEV_MODE) {
          e.preventDefault();
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      addViolation("copy", "Bạn đã cố sao chép nội dung.");
    };
    
    const handleMouseDownFallback = (e: MouseEvent) => {
      keyLogsRef.current.push({
        time: new Date().toISOString(),
        type: "mousedown_fallback",
        data: `X:${e.clientX}, Y:${e.clientY}, Button:${e.button}`
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCopy);
    document.addEventListener("mousedown", handleMouseDownFallback);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCopy);
      document.removeEventListener("mousedown", handleMouseDownFallback);
      
      if ((window as any)._cleanupGlobalHook) {
        (window as any)._cleanupGlobalHook();
      }
    };
  }, [wizardPhase, addViolation, submitting, config]);

  // Always On Top & Network Info
  useEffect(() => {
    if (wizardPhase < 7) return;

    if (window.electronAPI?.setAlwaysOnTop && !DEV_MODE) {
      window.electronAPI.setAlwaysOnTop(true);
    }

    if (window.electronAPI?.getNetworkInfo) {
      window.electronAPI.getNetworkInfo().then(info => {
        console.log("Exam Client Network Info:", info);
      }).catch(e => console.error("Failed to fetch network info", e));
    }
    
    return () => {
      if (window.electronAPI?.setAlwaysOnTop) {
        window.electronAPI.setAlwaysOnTop(false);
      }
    };
  }, [wizardPhase]);

  // Hardware Checks (Banned Apps, Multiple Screens, FPS)
  useEffect(() => {
    if (wizardPhase < 7) return;
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
          if (window.electronAPI.getScreenCount) {
            currentScreenCount = await window.electronAPI.getScreenCount();
            setScreenCount(currentScreenCount);
            if (currentScreenCount > 1) {
              isLocked = true;
              lockMsgs.push(`Phát hiện ${currentScreenCount} màn hình. Vui lòng ngắt kết nối màn hình phụ.`);
            }
          }
          if (window.electronAPI.getRunningBannedApps && shouldCheckBannedApps) {
            const appsList = Array.isArray(config?.bannedApps) ? config.bannedApps : [];
            if (appsList.length > 0) {
              detectedApps = await window.electronAPI.getRunningBannedApps(appsList);
              setBannedApps(detectedApps);
              if (detectedApps.length > 0) {
                isLocked = true;
                lockMsgs.push(`Phát hiện phần mềm bị cấm: ${detectedApps.join(', ')}. Vui lòng tắt phần mềm.`);
              }
            } else {
              setBannedApps([]);
            }
          }
        } catch (e) {
          console.error("Lỗi Hardware Check:", e);
        }
      }

      if (isLocked) {
        const fullReason = lockMsgs.join("\n");
        setHardwareLock(fullReason);
        setIsBlurred(true); 
        
        if (!hardwareViolated) {
          hardwareViolated = true;
          if (detectedApps.length > 0) {
            addViolation("banned_app", `Đang mở phần mềm bị cấm: ${detectedApps.join(', ')}`);
          }
          if (currentScreenCount > 1) {
            addViolation("multiple_screens", `Phát hiện ${currentScreenCount} màn hình`);
          }
        }
      } else {
        hardwareViolated = false;
        setHardwareLock(prev => {
          if (prev !== "") {
            setIsBlurred(false);
            setBlurReason("");
          }
          return "";
        });
      }

      const now = performance.now();
      const elapsed = now - lastMetricsTimeRef.current;
      if (elapsed > 0) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / elapsed);
      }
      frameCountRef.current = 0;
      lastMetricsTimeRef.current = now;

      if (window.electronAPI && window.electronAPI.logSystemMetrics && examId) {
        window.electronAPI.logSystemMetrics(examId, fpsRef.current).catch(e => console.error("Lỗi log system metrics:", e));
      }

    }, 1000); 
    
    return () => clearInterval(monitorInterval);
  }, [wizardPhase, config, addViolation, examId, setIsBlurred, setBlurReason]);

  useEffect(() => {
    if (wizardPhase < 7) return;
    const trackingLvl = config?.level || "strict";

    const requestFullscreen = async () => {
      if (trackingLvl === "none") return;
      try {
        await document.documentElement.requestFullscreen();
      } catch {
      }
    };
    requestFullscreen();

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && wizardPhase >= 7 && !submitting) {
        if (trackingLvl !== "none") {
          const blurReasonFullscreen = "Chế độ xem toàn màn hình đã bị tắt.";
          addViolation("exit_fullscreen", blurReasonFullscreen);
          
          if (DEV_MODE && NO_LOCKSCREEN_WHEN_DEV_MODE) {
            toast.error(`[Dev Bypass] ${blurReasonFullscreen}`);
          } else {
            setIsBlurred(true);
            setBlurReason(blurReasonFullscreen);
          }
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [wizardPhase, addViolation, submitting, config, toast, setIsBlurred, setBlurReason]);

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
