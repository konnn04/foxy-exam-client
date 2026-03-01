import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { WebcamPopup, WebcamPopupHandle } from "@/components/exam/webcam-popup";
import { CameraCheck } from "@/components/exam/camera-check";
import { CameraLivenessCheck } from "@/components/exam/camera-liveness-check";
import { CameraOrientationCheck } from "@/components/exam/camera-orientation-check";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useFaceMonitor } from "@/hooks/use-face-monitor";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { DEV_MODE, NO_LOCKSCREEN_WHEN_DEV_MODE } from "@/config/app";

import {
  Flag,
  Send,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldAlert,
  Maximize,
  Monitor,
  Video,
} from "lucide-react";

interface Option {
  id: number;
  label?: string;
  content: string;
}

interface Question {
  id: number;
  content: string;
  type: string; 
  options?: Option[];
  answers?: Option[];
  image_url?: string;
}

interface Answer {
  question_id: number;
  answer_id?: number | null;
  answer_content?: string | null;
}

interface ExamTrackingConfig {
  level: "none" | "standard" | "strict";
  requireApp?: boolean;          // Bắt buộc dùng Electron App
  requireCamera?: boolean;       // Mở Camera kiểm tra tập trung
  requireMic?: boolean;          // Ghi âm mic (Chưa chạy, lưu config)
  requireFaceAuth?: boolean;     // Giám sát xác minh khuôn mặt
  bannedAppsExceptions?: string[]; // Các app cấm được ngoại lệ
}

interface ExamData {
  exam: {
    id: number;
    name?: string;
    title?: string;
    duration?: number;
    duration_minutes?: number;
  };
  attempt: {
    id: number;
    started_at: string;
    time_remaining?: number;
  };
  config?: ExamTrackingConfig;   // Config tracking mode (default: strict if missing)
  questions: {
    data: Question[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  all_question_ids: number[];
  answers: Answer[];
  flagged: number[];
}

interface Violation {
  type: string;
  timestamp: number;
  message: string;
}

export default function ExamTakePage() {
  const { examId, attemptId } = useParams<{
    examId: string;
    attemptId: string;
  }>();
  const navigate = useNavigate();
  const toast = useToastCustom();
  const { confirm } = useAlertDialog();

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [wizardPhase, setWizardPhase] = useState<number>(0); // 0 = Checking Config
  const webcamPopupRef = useRef<WebcamPopupHandle>(null);

  const [data, setData] = useState<ExamData | null>(null);
  const [config, setConfig] = useState<ExamTrackingConfig | null>(null);
  const [configError, setConfigError] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [changingPage, setChangingPage] = useState(false);
  const [globalIdx, setGlobalIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<number, Answer>>(new Map());
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataJustLoadedRef = useRef(true);

  const [violations, setViolations] = useState<Violation[]>([]);
  const [isBlurred, setIsBlurred] = useState(false);
  const [blurReason, setBlurReason] = useState("");
  const [devBypassLock, setDevBypassLock] = useState(false);
  const [hardwareLock, setHardwareLock] = useState("");
  
  const [bannedApps, setBannedApps] = useState<string[]>([]);
  const [screenCount, setScreenCount] = useState<number>(1);
  const keyLogsRef = useRef<{time: string, type: string, data: string}[]>([]);

  const perPage = data?.questions.per_page ?? 5;
  const totalQuestions = data?.questions.total ?? 0;
  const allIds = data?.all_question_ids ?? [];
  const currentQuestions = data?.questions.data ?? [];
  const currentPage = data?.questions.current_page ?? 1;

  const handleFrameRender = useCallback((results: FaceLandmarkerResult | null) => {
    if (webcamPopupRef.current) {
      webcamPopupRef.current.drawFrame(results);
    }
  }, []);

  const { isLoaded: monitorLoaded, status: faceStatus, error: monitorError } = useFaceMonitor(
    cameraStream,
    wizardPhase === 4,
    handleFrameRender
  );

  let monitorWarning = "";
  if (wizardPhase === 4 && (!submitting && data)) {
    if (!monitorLoaded && !monitorError) {
      monitorWarning = "Đang đồng bộ luồng theo dõi AI chống gian lận...";
    } else if (monitorLoaded) {
      if (!faceStatus) {
        monitorWarning = "Hệ thống không tìm thấy khuôn mặt của bạn.";
      } else if (!faceStatus.isGoodDistance) {
        monitorWarning = "Bạn đang ở quá gần màn hình. Hãy ngồi xa ra một chút.";
      } else if (!faceStatus.isCentered) {
        monitorWarning = "Khuôn mặt của bạn đang lệch khỏi trung tâm camera.";
      } else if (!faceStatus.isLooking) {
        monitorWarning = "Vui lòng duy trì hướng nhìn thẳng vào bài thi.";
      } else if (faceStatus.eyeLookAway) {
        monitorWarning = "Mắt bạn đang nhìn lệch với bài thi quá nhiều.";
      }
    }
  }

  const lastToastWarningRef = useRef("");

  useEffect(() => {
    if (monitorWarning && DEV_MODE && NO_LOCKSCREEN_WHEN_DEV_MODE) {
      if (lastToastWarningRef.current !== monitorWarning) {
        toast.error(`[Dev Bypass] ${monitorWarning}`);
        lastToastWarningRef.current = monitorWarning;
      }
    } else if (!monitorWarning) {
      lastToastWarningRef.current = "";
    }
  }, [monitorWarning, toast]);

  useEffect(() => {
    if (hardwareLock) {
      if (DEV_MODE && NO_LOCKSCREEN_WHEN_DEV_MODE) {
        toast.error(`[Dev Bypass] ${hardwareLock}`);
      } else {
        setIsBlurred(true);
        setBlurReason(hardwareLock);
      }
    }
  }, [hardwareLock, toast]);

  useEffect(() => {
    if (!monitorWarning && devBypassLock) {
      setDevBypassLock(false);
    }
  }, [monitorWarning, devBypassLock]);

  const showLockOverlay = monitorWarning !== "" && !devBypassLock && !(DEV_MODE && NO_LOCKSCREEN_WHEN_DEV_MODE);

  const localIdx = globalIdx % perPage;
  const currentQuestion = currentQuestions[localIdx];

  // ─── Phase 0: Checking Config Error ─────────────────────────
  if (configError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive mb-2">Không đủ điều kiện truy cập</h2>
        <p className="text-muted-foreground text-center max-w-md">{configError}</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          Quay lại Bảng điều khiển
        </Button>
      </div>
    );
  }

  if (wizardPhase === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
        <p className="text-muted-foreground">Đang lấy cấu hình bài thi...</p>
      </div>
    );
  }

  // ─── Phase 0: Pre-Flight Config Fetch ───────────────────────
  useEffect(() => {
    if (wizardPhase !== 0) return;

    (async () => {
      try {
        const res = await api.get(`/student/exams/${examId}/take/${attemptId}?page=1`);
        const d: ExamData = res.data;
        setData(d);
        
        // Default to strict if backend hasn't implemented it yet
        const remoteConfig = d.config || { level: "strict", requireApp: true, requireCamera: true };
        setConfig(remoteConfig);

        const isElectron = window.electronAPI?.isElectron === true;

        if (remoteConfig.level === "strict" || remoteConfig.requireApp) {
          if (!isElectron) {
            setConfigError("Bài thi này yêu cầu sử dụng Ứng dụng Giám sát trên Máy tính (App). Bạn không thể thi trên Trình duyệt Web.");
            return;
          }
          
          if (window.electronAPI?.getSystemInfo) {
            const sysInfo = await window.electronAPI.getSystemInfo();
            // Restrict OS: Window > 10, Ubuntu X11, MacOS
            const isWin10Plus = sysInfo.platform === "win32" && parseFloat(sysInfo.release) >= 10.0;
            const isMac = sysInfo.platform === "darwin";
            const isLinuxX11 = sysInfo.platform === "linux" && sysInfo.sessionType.toLowerCase() === "x11";
            
            if (!isWin10Plus && !isMac && !isLinuxX11) {
               setConfigError(`Hệ điều hành không được hỗ trợ (${sysInfo.platform} ${sysInfo.release} ${sysInfo.sessionType}). Yêu cầu Windows 10+, MacOS hoặc Linux X11.`);
               return;
            }
          }
        }

        if (remoteConfig.level === "none" || remoteConfig.requireCamera === false) {
           // Skip camera wizard entirely
           setWizardPhase(4);
        } else {
           setWizardPhase(1);
        }
        
      } catch (err) {
        console.error("Lỗi lấy cấu hình bài thi:", err);
        setConfigError("Không thể tải cấu hình bài thi. Vui lòng thử lại.");
      }
    })();
  }, [wizardPhase, examId, attemptId]);

  const handleCameraConfirm = (stream: MediaStream) => {
    setCameraStream(stream);
    setWizardPhase(2);
  };

  const handleLivenessSuccess = () => {
    setWizardPhase(3);
  };
  
  const handleOrientationSuccess = () => {
    setWizardPhase(4);
  };

  useEffect(() => {
    if (wizardPhase < 4) return;

    (async () => {
      try {
        const res = await api.get(
          `/student/exams/${examId}/take/${attemptId}?page=1`
        );
        const d: ExamData = res.data;
        setData(d);

        const ansMap = new Map<number, Answer>();
        if (Array.isArray(d.answers)) {
          d.answers.forEach((a) => ansMap.set(a.question_id, a));
        } else if (d.answers && typeof d.answers === "object") {
          Object.values(d.answers).forEach((a: any) => ansMap.set(a.question_id, a));
        }
        setAnswers(ansMap);

        setFlagged(new Set(d.flagged ?? []));

        const duration = d.exam.duration ?? d.exam.duration_minutes ?? 60;
        if (d.attempt.time_remaining !== undefined && d.attempt.time_remaining !== null) {
          setTimeLeft(Math.max(0, d.attempt.time_remaining));
        } else {
          const started = new Date(d.attempt.started_at).getTime();
          const durationMs = duration * 60 * 1000;
          const nowMs = Date.now();
          const remaining = Math.max(
            0,
            Math.floor((started + durationMs - nowMs) / 1000)
          );
          setTimeLeft(remaining);
        }

        dataJustLoadedRef.current = true;
        setTimeout(() => {
          dataJustLoadedRef.current = false;
        }, 3000);
      } catch (err) {
        console.error("Lỗi tải bài thi:", err);
        toast.error("Không thể tải bài thi");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [wizardPhase, examId, attemptId]);

  const fetchPage = async (page: number, targetGlobalIdx: number) => {
    setChangingPage(true);
    try {
      const res = await api.get(`/student/exams/${examId}/take/${attemptId}?page=${page}`);
      const d: ExamData = res.data;
      setData(prev => prev ? { ...prev, questions: d.questions } : d);
      setGlobalIdx(targetGlobalIdx);
    } catch {
      toast.error("Không thể tải trang câu hỏi.");
    } finally {
      setChangingPage(false);
    }
  };

  const handleGoToQuestion = (idx: number) => {
    if (idx < 0 || idx >= totalQuestions) return;
    const targetPage = Math.floor(idx / perPage) + 1;
    if (targetPage !== currentPage) {
      fetchPage(targetPage, idx);
    } else {
      setGlobalIdx(idx);
    }
  };

  useEffect(() => {
    if (timeLeft === null) return;
    
    if (timeLeft <= 0) {
      if (!submitting && !dataJustLoadedRef.current) {
        handleSubmit(true);
      } else if (dataJustLoadedRef.current) {
        console.log("[exam-take] time_remaining=0 on first load, waiting for grace period...");
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null || t <= 1) {
          clearInterval(timer);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, submitting]);

  const addViolation = useCallback((type: string, message: string) => {
    const v: Violation = { type, timestamp: Date.now(), message };
    setViolations((prev) => [...prev, v]);
    
    if (DEV_MODE && NO_LOCKSCREEN_WHEN_DEV_MODE) {
      toast.error(`[Dev Bypass] ${message}`);
    } else {
      setIsBlurred(true);
      setBlurReason(message);
    }
  }, [toast]);

  useEffect(() => {
    if (wizardPhase < 4) return;
    const trackingLvl = config?.level || "strict";
    
    // Level 'none' still tracks tab switching/blur, but bypasses strict hooks
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
          } else if (["c", "v", "a", "p", "s", "u"].includes(lowerKey)) {
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
  }, [wizardPhase, addViolation, submitting]);

  useEffect(() => {
    if (wizardPhase < 4) return;
    const trackingLvl = config?.level || "strict";
    
    if (trackingLvl === "strict" && window.electronAPI?.setAlwaysOnTop) {
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

  useEffect(() => {
    if (wizardPhase < 4) return;
    const trackingLvl = config?.level || "strict";
    if (trackingLvl !== "strict") return; // Banned Apps & Multi-screen only for strict
    
    const monitorInterval = setInterval(async () => {
      let isLocked = false;
      let lockMsgs: string[] = [];

      if (window.electronAPI) {
        try {
          if (window.electronAPI.getScreenCount) {
            const count = await window.electronAPI.getScreenCount();
            setScreenCount(count);
            if (count > 1) {
              isLocked = true;
              lockMsgs.push(`Phát hiện ${count} màn hình. Vui lòng ngắt kết nối màn hình phụ.`);
            }
          }
          if (window.electronAPI.getRunningBannedApps) {
            const apps = await window.electronAPI.getRunningBannedApps();
            setBannedApps(apps);
            if (apps.length > 0) {
              isLocked = true;
              lockMsgs.push(`Phát hiện phần mềm bị cấm: ${apps.join(', ')}. Vui lòng tắt phần mềm.`);
            }
          }
        } catch (e) {
          console.error("Lỗi Hardware Check:", e);
        }
      }

      if (isLocked) {
        const fullReason = lockMsgs.join("\n");
        setHardwareLock(fullReason);
      } else {
        setHardwareLock(prev => {
          if (prev !== "") {
            setIsBlurred(false);
            setBlurReason("");
          }
          return "";
        });
      }
    }, 3000); 
    
    return () => clearInterval(monitorInterval);
  }, [wizardPhase, toast]);

  useEffect(() => {
    if (wizardPhase < 4) return;
    const trackingLvl = config?.level || "strict";

    const requestFullscreen = async () => {
      if (trackingLvl === "none") return; // Optional for non-tracking
      try {
        await document.documentElement.requestFullscreen();
      } catch {
      }
    };
    requestFullscreen();

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && wizardPhase >= 4 && !submitting) {
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
  }, [wizardPhase, addViolation, submitting]);

  const dismissBlur = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
    }
    setIsBlurred(false);
    setBlurReason("");
  };

  const saveAnswer = useCallback(
    (questionId: number, answerId?: number | null, answerContent?: string | null) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await api.post(
            `/student/exams/${examId}/take/${attemptId}/save-answer`,
            {
              question_id: questionId,
              answer_id: answerId ?? null,
              answer_content: answerContent ?? null,
            }
          );
        } catch {
          toast.error("Không thể lưu câu trả lời");
        }
      }, 500);
    },
    [examId, attemptId, toast]
  );

  const handleSelectOption = (questionId: number, optionId: number) => {
    const answer: Answer = { question_id: questionId, answer_id: optionId };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    saveAnswer(questionId, optionId);
  };

  const handleEssayChange = (questionId: number, content: string) => {
    const answer: Answer = { question_id: questionId, answer_content: content };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    saveAnswer(questionId, null, content);
  };

  const handleToggleFlag = async (questionId: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    try {
      await api.post(
        `/student/exams/${examId}/take/${attemptId}/flag`,
        { question_id: questionId }
      );
    } catch {
    }
  };

  const handleSubmit = async (auto = false) => {
    if (submitting) return;

    if (!auto) {
      const unanswered = totalQuestions - answers.size;
      const message =
        unanswered > 0
          ? `Bạn còn ${unanswered} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài?`
          : "Bạn có chắc chắn muốn nộp bài thi?";
      const ok = await confirm({
        title: "Nộp bài thi",
        description: message,
        confirmLabel: "Nộp bài",
        variant: "destructive",
      });
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => {
          t.stop();
        });
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      if (window.electronAPI?.setAlwaysOnTop) {
        window.electronAPI.setAlwaysOnTop(false);
      }

      if (window.electronAPI?.saveExamLog) {
        try {
          await window.electronAPI.saveExamLog(examId || "unknown", violations, keyLogsRef.current);
        } catch (e) {
          console.error("Failed to save exam log", e);
        }
      }

      await api.post(`/student/exams/${examId}/submit/${attemptId}`);
      toast.success(auto ? "Bài thi đã tự động nộp (hết giờ)" : "Nộp bài thành công!");
      navigate(`/exams/${examId}`, { replace: true });
    } catch {
      toast.error("Không thể nộp bài thi");
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (wizardPhase === 1) {
    return <CameraCheck onConfirm={handleCameraConfirm} />;
  }
  
  if (wizardPhase === 2 && cameraStream) {
    return <CameraLivenessCheck stream={cameraStream} onSuccess={handleLivenessSuccess} onCancel={() => navigate("/dashboard")} />;
  }
  
  if (wizardPhase === 3 && cameraStream) {
    return <CameraOrientationCheck stream={cameraStream} onSuccess={handleOrientationSuccess} onCancel={() => navigate("/dashboard")} />;
  }

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Đang tải bài thi...</p>
        </div>
      </div>
    );
  }

  const answeredCount = Math.min(answers.size, totalQuestions);
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const isTimeLow = timeLeft !== null && timeLeft <= 300;

  return (
    <div
      className="flex flex-col h-screen bg-background select-none relative overflow-hidden"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div className="flex flex-1 overflow-hidden w-full relative">
        {}
      {showLockOverlay && !isBlurred && config?.requireCamera !== false && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="bg-card border-2 border-primary/50 rounded-2xl p-8 max-w-sm text-center space-y-4 shadow-xl">
            <div className="flex justify-center">
              <ShieldAlert className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Tạm khóa bài thi</h2>
            <p className="text-muted-foreground">{monitorWarning}</p>
            <p className="text-xs text-muted-foreground mt-4">
              Bài thi sẽ tự động mở lại khi hệ thống xác nhận tư thế hợp lệ.
            </p>
            {DEV_MODE && (
              <Button 
                variant="outline" 
                className="w-full mt-4 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={() => setDevBypassLock(true)}
              >
                [Dev] Bỏ qua cảnh báo
              </Button>
            )}
          </div>
        </div>
      )}

      {}
      {isBlurred && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
          <div className="bg-card border rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-destructive">
              Cảnh báo vi phạm!
            </h2>
            <p className="text-muted-foreground">{blurReason}</p>
            <p className="text-sm text-muted-foreground">
              Hành vi này đã được ghi nhận ({violations.length} lần vi phạm).
              <br />
              Vui lòng quay lại toàn màn hình và tuân thủ nội quy để tiếp tục làm bài.
            </p>
            {hardwareLock !== "" && !devBypassLock ? (
              <div className="text-destructive font-semibold animate-pulse mt-4 bg-destructive/10 p-3 rounded-lg border border-destructive/20 whitespace-pre-wrap text-sm">
                Đang chờ hệ thống xác nhận đóng phần mềm / ứng dụng vi phạm...
                <br/>
                Hệ thống sẽ tự động xác nhận trong vòng 3 giây.
              </div>
            ) : (
              <Button onClick={dismissBlur} className="w-full mt-4">
                <Maximize className="h-4 w-4 mr-2" />
                Quay lại toàn màn hình & Tiếp tục
              </Button>
            )}

            {DEV_MODE && hardwareLock !== "" && (
               <Button onClick={() => {
                 setHardwareLock("");
                 dismissBlur();
               }} variant="outline" className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2">
                 [Dev] Ignore Lock
               </Button>
            )}
            {DEV_MODE && hardwareLock === "" && (
               <Button onClick={dismissBlur} variant="outline" className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2">
                 [Dev] Bỏ qua cảnh báo nhanh
               </Button>
            )}
          </div>
        </div>
      )}

      {}
      {config?.requireCamera !== false && (
        <WebcamPopup ref={webcamPopupRef} stream={cameraStream} />
      )}

      {}
      <div className="w-72 border-r bg-card flex flex-col">
        {}
        <div className={`p-4 border-b ${isTimeLow ? "bg-destructive/10" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Thời gian còn lại
            </span>
          </div>
          <p
            className={`text-2xl font-mono font-bold ${isTimeLow ? "text-destructive animate-pulse" : ""}`}
          >
            {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
          </p>
          <Progress value={progressPercent} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {answeredCount}/{totalQuestions} câu đã trả lời
          </p>
        </div>

        {}
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-5 gap-2">
            {allIds.map((qid, idx) => {
              const isAnswered = answers.has(qid);
              const isFlagged = flagged.has(qid);
              const isCurrent = idx === globalIdx;

              return (
                <button
                  key={qid}
                  disabled={changingPage}
                  onClick={() => handleGoToQuestion(idx)}
                  className={`
                    relative h-10 w-10 rounded-lg text-sm font-medium transition-all
                    ${isCurrent ? "ring-2 ring-primary scale-110" : ""}
                    ${isAnswered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                    hover:scale-105 disabled:opacity-50 disabled:hover:scale-100
                  `}
                >
                  {idx + 1}
                  {isFlagged && (
                    <Flag className="absolute -top-1 -right-1 h-3 w-3 text-yellow-500 fill-yellow-500" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {}
        {violations.length > 0 && (
          <div className="p-3 border-t bg-destructive/10">
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Vi phạm: {violations.length}
            </p>
          </div>
        )}

        {}
        <div className="p-4 border-t">
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => handleSubmit()}
            disabled={submitting}
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Đang nộp..." : "Nộp bài"}
          </Button>
        </div>
      </div>

      {}
      <div className="flex-1 flex flex-col">
        {}
        <div className="flex items-center justify-between border-b p-4">
          <h1 className="font-semibold">
            {data.exam.name ?? data.exam.title}
          </h1>
          <div className="flex items-center gap-2">
            {!changingPage && currentQuestion && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleFlag(currentQuestion.id)}
                className={
                  flagged.has(currentQuestion.id)
                    ? "text-yellow-600 border-yellow-600"
                    : ""
                }
              >
                <Flag
                  className={`h-4 w-4 mr-1 ${flagged.has(currentQuestion.id) ? "fill-yellow-500" : ""}`}
                />
                {flagged.has(currentQuestion.id) ? "Bỏ đánh dấu" : "Đánh dấu"}
              </Button>
            )}
            <Badge variant="secondary">
              Câu {globalIdx + 1} / {totalQuestions}
            </Badge>
          </div>
        </div>

        {}
        <ScrollArea className="flex-1 p-6">
          <div
            className="max-w-3xl mx-auto"
            style={{
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: (isBlurred || monitorWarning !== "") ? "none" : "auto",
            }}
          >
            {changingPage || !currentQuestion ? (
              <div className="flex justify-center items-center py-20 text-muted-foreground">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                Đang chuyển trang...
              </div>
            ) : (
              <>
                {}
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-primary mb-3">
                    Câu {globalIdx + 1}
                  </h2>
              <div 
                className="prose dark:prose-invert max-w-none prose-sm md:prose-base"
                dangerouslySetInnerHTML={{ __html: currentQuestion.content }}
              />
              {currentQuestion.image_url && (
                <img
                  src={currentQuestion.image_url}
                  alt="Question"
                  className="max-w-full rounded-lg border mt-4"
                  draggable={false}
                />
              )}
            </div>

            {}
            {currentQuestion.type === "essay" ? (
              <textarea
                className="w-full min-h-[200px] rounded-lg border bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                placeholder="Nhập câu trả lời của bạn..."
                value={answers.get(currentQuestion.id)?.answer_content ?? ""}
                onChange={(e) =>
                  handleEssayChange(currentQuestion.id, e.target.value)
                }
                style={{ userSelect: "text", WebkitUserSelect: "text" }}
              />
            ) : (
              <div className="space-y-3">
                {(currentQuestion.options ?? currentQuestion.answers ?? []).map((option, oi) => {
                  const isSelected =
                    String(answers.get(currentQuestion.id)?.answer_id) === String(option.id);
                  const label = option.label ?? String.fromCharCode(65 + oi);

                  return (
                    <button
                      key={option.id}
                      onClick={() =>
                        handleSelectOption(currentQuestion.id, option.id)
                      }
                      className={`
                        w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-all
                        ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                        }
                      `}
                    >
                      {}
                      <div
                        className={`
                          mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                          ${isSelected ? "border-primary" : "border-muted-foreground/30"}
                        `}
                      >
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-sm block mb-1">{label}.</span>{" "}
                        <div 
                          className="text-sm prose dark:prose-invert max-w-none inline-block mt-0"
                          dangerouslySetInnerHTML={{ __html: String(option.content) }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
              </>
            )}
          </div>
        </ScrollArea>

        {}
        <div className="flex items-center justify-between border-t p-4">
          <Button
            variant="outline"
            onClick={() => handleGoToQuestion(globalIdx - 1)}
            disabled={globalIdx === 0 || changingPage}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Câu trước
          </Button>
          <Button
            variant="outline"
            onClick={() => handleGoToQuestion(globalIdx + 1)}
            disabled={globalIdx === totalQuestions - 1 || changingPage}
          >
            Câu sau
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      </div>
    
      {}
      <div className="h-7 bg-card border-t shrink-0 flex items-center px-4 justify-between z-40 text-xs text-muted-foreground font-mono">
        <div className="flex gap-4">
          <div className="flex items-center gap-1" title="Số vi phạm">
            <AlertTriangle className={`h-3 w-3 ${violations.length > 0 ? "text-destructive" : ""}`} />
            <span className={violations.length > 0 ? "text-destructive font-bold" : ""}>{violations.length} Vi phạm</span>
          </div>
          <div className="flex items-center gap-1" title="Số Màn hình">
            <Monitor className={`h-3 w-3 ${screenCount > 1 ? "text-destructive font-bold" : ""}`} />
            <span className={screenCount > 1 ? "text-destructive font-bold" : ""}>{screenCount} Màn hình</span>
          </div>
          {config?.requireCamera !== false && (
            <div className="flex items-center gap-1" title="Số Camera">
              <Video className="h-3 w-3 text-green-500" />
              <span>1 Camera</span>
            </div>
          )}
          {bannedApps.length > 0 && (
            <div className="flex items-center gap-1 text-destructive font-bold">
              <ShieldAlert className="h-3 w-3" />
              <span>Cấm: {bannedApps.join(", ")}</span>
            </div>
          )}
        </div>
        <div>Hệ thống giám sát thi KLTN</div>
      </div>
    </div>
  );
}
