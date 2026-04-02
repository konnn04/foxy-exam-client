import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useExamSocketStore, useExamSocket } from "@/hooks/use-exam-socket";
import { webrtcService } from "@/lib/webrtc-service";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { ExamMainContent, ExamOverlay, ExamTopNav, ExamStatusBar } from "@/components/exam/exam-take-sections";
import { WebcamPopup, WebcamPopupHandle } from "@/components/exam/webcam-popup";
import { useFaceMonitor } from "@/hooks/use-face-monitor";
import { useExamLockdown } from "@/hooks/use-exam-lockdown";
import { useEvidenceRecorder } from "@/hooks/use-evidence-recorder";
import { useAudioMonitor } from "@/hooks/use-audio-monitor";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { DEVELOPMENT_MODE, NO_LOCKSCREEN_WHEN_DEV_MODE } from "@/config/security.config";
import { useExamStore } from "@/stores/use-exam-store";
import { useProctorStore } from "@/stores/use-proctor-store";

import { STORAGE_KEYS } from "@/config";
import { AttemptChatbox } from "@/components/chat/AttemptChatbox";
import type { ExamData, ExamTrackingConfig, Answer, Violation } from "@/types/exam";
import { useTranslation } from "react-i18next";
import { exitExamFullscreen } from "@/lib/exit-fullscreen";
import { isLeafAnswered } from "@/lib/exam-answer-utils";
import { useExamHistoryLock } from "@/hooks/use-exam-history-lock";

export interface ExamSessionProps {
  examId: string;
  attemptId: string;
  cameraStream: MediaStream | null;
  initialScreenStream: MediaStream | null;
  config: ExamTrackingConfig;
  /**
   * Phone QR publishes video as LiveKit `-mobile` only; desktop does not republish that video.
   * Supervisor-agent and proctor UI use desktop camera + screen only.
   */
  mobileRelayOnly?: boolean;
}

export function ExamSession({
  examId,
  attemptId,
  cameraStream,
  initialScreenStream,
  config,
  mobileRelayOnly = false,
}: ExamSessionProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();
  const { confirm } = useAlertDialog();
  const { t } = useTranslation();

  const webcamPopupRef = useRef<WebcamPopupHandle>(null);

  const [data, setData] = useState<ExamData | null>(null);
  
  // Initialize and auto-join exam socket
  useExamSocket(examId, attemptId);

  // current User
  const authStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH_STORE) || '{}');
  const currentUserId = authStore?.state?.user?.id || 0;

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [changingPage, setChangingPage] = useState(false);
  const [globalIdx, setGlobalIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<number, Answer>>(new Map());
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  useExamHistoryLock(Boolean(data) && !submitting);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataJustLoadedRef = useRef(true);

  const [violations, setViolations] = useState<Violation[]>([]);
  const [isBlurred, setIsBlurred] = useState(false);
  const [blurReason, setBlurReason] = useState("");
  const [devBypassLock, setDevBypassLock] = useState(false);
  const [, setWsDisconnected] = useState(false);
  
  // Zustand read: face monitor warnings are piped directly here (causes minimal re-renders when warning changes)
  const monitorWarning = useProctorStore((s) => s.monitorWarning);
  const faceAuthLockedMsg = useProctorStore((s) => s.faceAuthLockedMsg);

  const [isScreenSharing, setIsScreenSharing] = useState(!!initialScreenStream);
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false);
  
  const screenStreamRef = useRef<MediaStream | null>(initialScreenStream);
  const dismissCooldownRef = useRef(false); // suppress violations during dismiss

  const addViolation = useCallback((type: string, message: string) => {
    // Skip violations during dismiss cooldown to prevent cascade loop
    if (dismissCooldownRef.current) return;

    const v: Violation = { type, timestamp: Date.now(), message };
    setViolations((prev) => [...prev, v]);

    // Log violation to WebSocket with enriched data
    useExamSocketStore.getState().logEvent('violation', { 
      violationType: type, 
      message,
      localTime: new Date().toISOString(),
    });
    
    if (DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE) {
      toast.error(`[Dev Bypass] ${message}`);
    } else {
      setIsBlurred(true);
      setBlurReason(message);
    }
  }, [toast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentScreenStream = isScreenSharing ? screenStreamRef.current : null;

  const { reportViolation } = useEvidenceRecorder({
    examId,
    attemptId,
    enabled: !submitting,
    cameraStream,
    screenStream: currentScreenStream,
  });

  // When a violation is added locally, report to exam-sys with evidence (skip server-broadcast rows)
  const prevViolationsLenRef = useRef(0);
  useEffect(() => {
    if (violations.length > prevViolationsLenRef.current) {
      const latest = violations[violations.length - 1];
      if (!latest.fromServer) {
        reportViolation(latest.type, latest.message);
      }
    }
    prevViolationsLenRef.current = violations.length;
  }, [violations, reportViolation]);

  const { hardwareLock, bannedApps, screenCount, keyLogs, clearHardwareLock } = useExamLockdown({
    wizardPhase: 5,
    config,
    examId,
    submitting,
    addViolation,
    setIsBlurred,
    setBlurReason,
  });

  // Audio monitoring for speech detection during exam
  const { speechDetected: _speechDetected, isRecording: _isRecordingAudio, clipCount: _audioClipCount } = useAudioMonitor({
    stream: cameraStream,
    enabled: !submitting && Boolean(cameraStream),
    examId,
    attemptId,
  });

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

  // Periodic face-crop + server jobs disabled — LiveKit supervisor-agent handles face/object + evidence.
  const uploadFramesToServer = false;

  useFaceMonitor(
    cameraStream,
    Boolean(cameraStream),
    handleFrameRender,
    examId,
    attemptId,
    uploadFramesToServer,
  );

  const lastToastWarningRef = useRef("");

  useEffect(() => {
    if (monitorWarning && monitorWarning !== "Đang đồng bộ luồng theo dõi AI chống gian lận...") {
      if (lastToastWarningRef.current !== monitorWarning) {
        useExamSocketStore.getState().logEvent("face_warning", { message: monitorWarning });
        if (DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE) {
          toast.error(`[Dev Bypass] ${monitorWarning}`);
        }
        lastToastWarningRef.current = monitorWarning;
      }
    } else if (!monitorWarning) {
      lastToastWarningRef.current = "";
    }
  }, [monitorWarning, toast]);

  useEffect(() => {
    if (hardwareLock) {
      if (DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE) {
        toast.error(`[Dev Bypass] ${hardwareLock}`);
      } else {
        setIsBlurred(true);
        setBlurReason(hardwareLock);
      }
    }
  }, [hardwareLock, toast]);

  const effectiveWarning = faceAuthLockedMsg || monitorWarning;
  const showLockOverlay = effectiveWarning !== "" && !devBypassLock && !(DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE);

  useEffect(() => {
    if (!effectiveWarning && devBypassLock) {
      setDevBypassLock(false);
    }
  }, [effectiveWarning, devBypassLock]);

  const localIdx = globalIdx % perPage;
  const currentQuestion = currentQuestions[localIdx];

  const stopScreenCapture = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
  }, []);

  // Set up screen stopping handler directly inside ExamSession
  useEffect(() => {
    if (screenStreamRef.current) {
      const videoTrack = screenStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setIsScreenSharing(false);
          if (!submitting) {
            addViolation("screen_share_stopped", "Bạn đã tắt chia sẻ màn hình trong lúc thi.");
          }
        };
      }
    }

    return () => {
      stopScreenCapture();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, addViolation]);

  // Track mouse leaving the window (throttled to once every 10s)
  const lastCursorLeftRef = useRef(0);
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
        const now = Date.now();
        if (now - lastCursorLeftRef.current < 10000) return; // throttle 10s
        lastCursorLeftRef.current = now;
        addViolation('cursor_left', 'Di chuyển chuột ra khỏi màn hình thi.');
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [addViolation]);

  useEffect(() => {
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
          useExamStore.getState().setTimeLeft(Math.max(0, d.attempt.time_remaining));
        } else {
          const started = new Date(d.attempt.started_at).getTime();
          const durationMs = duration * 60 * 1000;
          const nowMs = Date.now();
          const remaining = Math.max(
            0,
            Math.floor((started + durationMs - nowMs) / 1000)
          );
          useExamStore.getState().setTimeLeft(remaining);
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
  }, [examId, attemptId, navigate, toast]);

  const fetchPage = async (page: number, targetGlobalIdx: number) => {
    setChangingPage(true);
    try {
      const res = await api.get(`/student/exams/${examId}/take/${attemptId}?page=${page}`);
      const d: ExamData = res.data;
      setData(prev => prev ? { ...prev, questions: d.questions } : d);
      setGlobalIdx(targetGlobalIdx);

      // Merge answers from API to restore any saved answers for this page
      if (d.answers) {
        const serverAnswers = Array.isArray(d.answers) ? d.answers : Object.values(d.answers);
        setAnswers(prev => {
          const merged = new Map(prev);
          (serverAnswers as any[]).forEach((a: any) => merged.set(a.question_id, a));
          return merged;
        });
      }
    } catch {
      toast.error("Không thể tải trang câu hỏi.");
    } finally {
      setChangingPage(false);
    }
  };

  const handleGoToQuestion = (idx: number) => {
    if (idx < 0 || idx >= totalQuestions) return;
    useExamSocketStore.getState().logEvent('navigation', { fromQuestion: globalIdx, toQuestion: idx });
    const targetPage = Math.floor(idx / perPage) + 1;
    if (targetPage !== currentPage) {
      fetchPage(targetPage, idx);
    } else {
      setGlobalIdx(idx);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    
    // We start the timer only when the attempt starts
    if (!submitting) {
      timer = setInterval(() => {
        const currentDataJustLoaded = dataJustLoadedRef.current;
        useExamStore.getState().setTimeLeft((t) => {
          if (t === null) return t;
          if (t <= 1) {
            clearInterval(timer);
            // Handle auto-submit locally outside the setter if possible
            // Using a timeout prevents React warning during reducer execution
            setTimeout(() => {
              if (currentDataJustLoaded) {
                 setTimeout(() => handleSubmit(true), 3500);
              } else {
                 handleSubmit(true);
              }
            }, 0);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  // ─── WebSocket & WebRTC Room Connection ───────────────────────
  useEffect(() => {
    if (!data) return;

    const examIdNum = parseInt(examId || '0');
    const attemptIdNum = parseInt(attemptId || '0');
    if (!examIdNum || !attemptIdNum) return;

    useExamSocketStore.getState().logEvent('exam_start', {
      examName: data.exam.name || data.exam.title,
      totalQuestions: data.questions.total,
    });

    useExamSocketStore.getState().onDisconnect(() => {
      setWsDisconnected(true);
      setIsBlurred(true);
      setBlurReason('Mất kết nối mạng hoặc máy chủ giám sát. Đang kết nối lại...');
    });

    useExamSocketStore.getState().onReconnect(() => {
      setWsDisconnected(false);
      setIsBlurred(false);
      setBlurReason('');
    });

    useExamSocketStore.getState().onViolation((event: {
      violationId?: number;
      type?: string;
      severity?: string;
      userId?: number;
      attemptId?: number;
      userName?: string | null;
    }) => {
      if (!event || event.attemptId !== attemptIdNum || event.userId !== currentUserId) return;

      const vType = event.type || "violation";
      const labels: Record<string, string> = {
        prohibited_object: "Hệ thống phát hiện vật thể bị cấm trong khung hình camera.",
        face_verification_failed: "Cảnh báo: xác thực khuôn mặt không đạt.",
      };
      const message = labels[vType] || `Giám sát ghi nhận vi phạm (${vType}).`;

      setViolations((prev) => [
        ...prev,
        { type: vType, timestamp: Date.now(), message, fromServer: true },
      ]);

      const critical =
        event.severity === "critical" ||
        vType === "prohibited_object" ||
        vType === "face_verification_failed";
      if (critical) {
        toast.error(message);
        if (!(DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE)) {
          setIsBlurred(true);
          setBlurReason(message);
        }
      }
    });

    if (cameraStream) {
      webrtcService.init({
        examId: examIdNum,
        localStream: cameraStream,
      });
    }

    // ─── LiveKit: connect to SFU (once) ──────────────────
    (async () => {
      try {
        const connected = await livekitPublisher.connect({
          examId: examIdNum,
          attemptId: attemptIdNum,
          onConnectionChange: (state) => {
            console.log('[ExamTake] LiveKit state:', state);
            if (state === 'connected') setIsLiveKitConnected(true);
            else if (state === 'disconnected') setIsLiveKitConnected(false);
          },
          onError: (err) => {
            console.warn('[ExamTake] LiveKit error:', err);
            toast.error(err);
          },
        });

        if (connected) {
          setIsLiveKitConnected(true);
          console.log('[ExamTake] LiveKit connected, waiting for stream effects to publish tracks');
        }
      } catch (err) {
        console.warn('[ExamTake] LiveKit connect failed:', err);
      }
    })();

    const handleSignal = (e: CustomEvent) => {
      const signal = e.detail;
      if (signal.signalType === 'stop-exam') {
        toast.error(
          "Bài thi đã bị đình chỉ",
          signal.data?.reason || "Giám thị đã buộc dừng bài thi của bạn."
        );
        livekitPublisher.disconnect();
        if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
        void (async () => {
          await exitExamFullscreen();
          navigate(`/exams/${examIdNum}`, { replace: true });
        })();
      }
    };
    window.addEventListener('webrtc-signal', handleSignal as EventListener);

    // Server-side face verification lock/unlock
    const handleFaceLock = (e: CustomEvent) => {
      const { locked, reason } = e.detail || {};
      if (locked) {
        useProctorStore.getState().setFaceAuthLockedMsg(
          reason === 'wrong_face'
            ? 'Khuôn mặt không khớp! Bài thi bị tạm khóa cho đến khi xác minh lại danh tính.'
            : 'Xác thực khuôn mặt thất bại. Vui lòng ngồi đúng vị trí camera.'
        );
      } else {
        useProctorStore.getState().setFaceAuthLockedMsg('');
      }
    };
    window.addEventListener('face-lock', handleFaceLock as EventListener);

    // Polling fallback: check attempt status every 30s
    const statusPollId = setInterval(async () => {
      try {
        const res = await api.get(`/student/exams/${examIdNum}/attempt/${attemptIdNum}/status`);
        if (res.data?.submitted_at) {
          toast.error("Bài thi đã bị đình chỉ bởi giám thị.");
          livekitPublisher.disconnect();
          await exitExamFullscreen();
          navigate(`/exams/${examIdNum}`, { replace: true });
        }
      } catch {
        // Silently fail, will retry next interval
      }
    }, 30000);

    return () => {
      webrtcService.destroy();
      livekitPublisher.disconnect();
      window.removeEventListener('webrtc-signal', handleSignal as EventListener);
      window.removeEventListener('face-lock', handleFaceLock as EventListener);
      clearInterval(statusPollId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.exam?.id]);

  // ─── LiveKit: desktop publishes webcam + mic; phone relay stays on `-mobile` only (cam 2). ──
  useEffect(() => {
    if (cameraStream && isLiveKitConnected) {
      livekitPublisher
        .publishCamera(cameraStream, {
          includeVideo: !mobileRelayOnly,
          includeAudio: true,
        })
        .catch((err) => console.warn("[ExamTake] Failed to publish camera to LiveKit:", err));
    }
  }, [cameraStream, isLiveKitConnected, mobileRelayOnly]);

  // ─── LiveKit: publish screen when sharing starts and connected ──
  useEffect(() => {
    if (isScreenSharing && screenStreamRef.current && isLiveKitConnected) {
      livekitPublisher.publishScreen(screenStreamRef.current).catch(err =>
        console.warn('[ExamTake] Failed to publish screen to LiveKit:', err)
      );
    }
  }, [isScreenSharing, isLiveKitConnected]);

  const dismissBlur = async () => {
    // Activate cooldown to prevent violation cascade during fullscreen transition
    dismissCooldownRef.current = true;

    try {
      // Use Electron's native fullscreen if available, otherwise browser API
      if (window.electronAPI?.setFullScreen) {
        window.electronAPI.setFullScreen(true);
      } else if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen request can fail — still allow dismissing the blur
    }

    setIsBlurred(false);
    setBlurReason("");

    // Release cooldown after 2s (enough time for fullscreen + focus events to settle)
    setTimeout(() => {
      dismissCooldownRef.current = false;
    }, 2000);
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
    useExamSocketStore.getState().logEvent('answer_selected', { questionId, optionId });
    saveAnswer(questionId, optionId);
  };

  const handleEssayChange = (questionId: number, content: string) => {
    const answer: Answer = { question_id: questionId, answer_content: content };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    useExamSocketStore.getState().logEvent('essay_typed', { questionId, length: content.length });
    saveAnswer(questionId, null, content);
  };

  const handleShortAnswerChange = (questionId: number, content: string) => {
    const answer: Answer = { question_id: questionId, answer_content: content };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    saveAnswer(questionId, null, content);
  };

  const handleTrueFalseSelect = (questionId: number, value: boolean) => {
    const content = value ? "true" : "false";
    const answer: Answer = { question_id: questionId, answer_content: content };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    saveAnswer(questionId, null, content);
  };

  const handleFillBlankChange = (questionId: number, slots: string[]) => {
    const json = JSON.stringify(slots);
    const answer: Answer = { question_id: questionId, answer_content: json };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    saveAnswer(questionId, null, json);
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
      const unanswered = allIds.filter((id) => !isLeafAnswered(answers.get(id))).length;
      const message =
        unanswered > 0
          ? t("exam.confirmSubmitUnanswered", { n: unanswered })
          : t("exam.confirmSubmit");
      const ok = await confirm({
        title: t("exam.confirmSubmitTitle"),
        description: message,
        confirmLabel: t("exam.confirmSubmitAction"),
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

      stopScreenCapture();

      await exitExamFullscreen();

      if (window.electronAPI?.saveExamLog) {
        try {
          await window.electronAPI.saveExamLog(examId || "unknown", violations, keyLogs);
        } catch (e) {
          console.error("Failed to save exam log", e);
        }
      }

      livekitPublisher.disconnect();

      await api.post(`/student/exams/${examId}/submit/${attemptId}`);
      toast.success(auto ? "Bài thi đã tự động nộp (hết giờ)" : "Nộp bài thành công!");
      const backExamId = data?.exam?.id ?? examId;
      navigate(`/exams/${backExamId}`, { replace: true });
    } catch (err: any) {
      if (err?.response?.status === 400 && err?.response?.data?.message === "Bài thi đã được nộp.") {
        livekitPublisher.disconnect();
        await exitExamFullscreen();
        toast.success(auto ? "Bài thi đã tự động nộp (hết giờ)" : "Bài thi đã được nộp từ trước!");
        const backExamId = data?.exam?.id ?? examId;
        navigate(`/exams/${backExamId}`, { replace: true });
        return;
      }
      toast.error("Không thể nộp bài thi");
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">{t("exam.loadingExam")}</p>
        </div>
      </div>
    );
  }

  const answeredCount = allIds.filter((id) => isLeafAnswered(answers.get(id))).length;
  const progressPercent = allIds.length > 0 ? (answeredCount / allIds.length) * 100 : 0;

  return (
    <div
      className="relative flex h-screen select-none flex-col overflow-hidden bg-background"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <ExamTopNav
        examTitle={data.exam.name ?? data.exam.title ?? ""}
        formatTime={formatTime}
        progressPercent={progressPercent}
            answeredCount={answeredCount}
            totalQuestions={allIds.length || totalQuestions}
        allIds={allIds}
        answers={answers}
        flagged={flagged}
        globalIdx={globalIdx}
        changingPage={changingPage}
        onGoToQuestion={handleGoToQuestion}
        violationsCount={violations.length}
        submitting={submitting}
        onSubmit={() => handleSubmit()}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {config?.requireCamera !== false &&
          (cameraStream ? <WebcamPopup ref={webcamPopupRef} stream={cameraStream} /> : null)}

        <div className="relative z-0 flex min-h-0 flex-1 flex-col bg-muted/10">
          <ExamOverlay
            showLockOverlay={showLockOverlay && config?.requireCamera !== false}
            isBlurred={isBlurred}
            hardwareLock={hardwareLock}
            monitorWarning={effectiveWarning}
            blurReason={blurReason}
            violationsCount={violations.length}
            devBypassLock={devBypassLock}
            onSetDevBypassLock={setDevBypassLock}
            onDismissBlur={dismissBlur}
            onClearHardwareLock={clearHardwareLock}
          />

          <ExamMainContent
            currentQuestion={currentQuestion}
            globalIdx={globalIdx}
            totalQuestions={totalQuestions}
            changingPage={changingPage}
            flagged={flagged}
            onToggleFlag={handleToggleFlag}
            onSelectOption={handleSelectOption}
            onEssayChange={handleEssayChange}
            onShortAnswerChange={handleShortAnswerChange}
            onTrueFalseSelect={handleTrueFalseSelect}
            onFillBlankChange={handleFillBlankChange}
            answers={answers}
            isBlurred={isBlurred}
            monitorWarning={effectiveWarning}
            onGoToQuestion={handleGoToQuestion}
          />
        </div>
      </div>

      <ExamStatusBar
        violationsCount={violations.length}
        screenCount={screenCount}
        requireCamera={config?.requireCamera !== false}
        detectBannedApps={config?.detectBannedApps === true}
        strictMode={config?.level === "strict"}
        bannedApps={bannedApps}
        isScreenSharing={isScreenSharing}
        onChatToggle={!submitting ? () => { setChatOpen(o => !o); setChatUnread(0); } : undefined}
        unreadCount={chatUnread}
      />

      {!submitting && (
        <AttemptChatbox
          examId={parseInt(examId || '0')}
          attemptId={parseInt(attemptId || '0')}
          currentUserId={currentUserId}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onNewMessage={() => { if (!chatOpen) setChatUnread(c => c + 1); }}
        />
      )}
    </div>
  );
}
