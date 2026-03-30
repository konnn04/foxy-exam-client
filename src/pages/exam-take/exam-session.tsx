import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useExamSocketStore, useExamSocket } from "@/hooks/use-exam-socket";
import { webrtcService } from "@/lib/webrtc-service";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { ExamMainContent, ExamOverlay, ExamSidebar, ExamStatusBar } from "@/components/exam/exam-take-sections";
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

export interface ExamSessionProps {
  examId: string;
  attemptId: string;
  cameraStream: MediaStream | null;
  initialScreenStream: MediaStream | null;
  config: ExamTrackingConfig;
}

export function ExamSession({
  examId,
  attemptId,
  cameraStream,
  initialScreenStream,
  config,
}: ExamSessionProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();
  const { confirm } = useAlertDialog();

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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataJustLoadedRef = useRef(true);

  const [violations, setViolations] = useState<Violation[]>([]);
  const [isBlurred, setIsBlurred] = useState(false);
  const [blurReason, setBlurReason] = useState("");
  const [devBypassLock, setDevBypassLock] = useState(false);
  const [, setWsDisconnected] = useState(false);
  
  // Zustand read: face monitor warnings are piped directly here (causes minimal re-renders when warning changes)
  const monitorWarning = useProctorStore((s) => s.monitorWarning);

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

  // Evidence recorder: reports violations to server without sending images (V4)
  const { reportViolation } = useEvidenceRecorder({
    examId,
    attemptId,
    enabled: !submitting,
  });

  // When a violation is added, also report it with video evidence
  const prevViolationsLenRef = useRef(0);
  useEffect(() => {
    if (violations.length > prevViolationsLenRef.current) {
      const latest = violations[violations.length - 1];
      reportViolation(latest.type, latest.message);
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
    enabled: !submitting,
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

  useFaceMonitor(
    cameraStream,
    true,
    handleFrameRender,
    examId,
    config?.face_verification_interval_seconds
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

  useEffect(() => {
    if (!monitorWarning && devBypassLock) {
      setDevBypassLock(false);
    }
  }, [monitorWarning, devBypassLock]);

  const showLockOverlay = monitorWarning !== "" && !devBypassLock && !(DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE);

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

    useExamSocketStore.getState().onViolation((_v: any) => {
      // Violations are received in real-time via the presence channel
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
          onConnectionChange: (state) => {
            console.log('[ExamTake] LiveKit state:', state);
            if (state === 'connected') setIsLiveKitConnected(true);
            else if (state === 'disconnected') setIsLiveKitConnected(false);
          },
          onError: (err) => {
            console.warn('[ExamTake] LiveKit error:', err);
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
        // Instant 0-latency stop
        if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
        if (window.electronAPI?.setFullScreen) window.electronAPI.setFullScreen(false);
        else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        navigate(`/exams/${examIdNum}`, { replace: true });
      }
    };
    window.addEventListener('webrtc-signal', handleSignal as EventListener);

    // Polling fallback: check attempt status every 30s
    const statusPollId = setInterval(async () => {
      try {
        const res = await api.get(`/student/exams/${examIdNum}/attempt/${attemptIdNum}/status`);
        if (res.data?.submitted_at) {
          toast.error("Bài thi đã bị đình chỉ bởi giám thị.");
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
      clearInterval(statusPollId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.exam?.id]);

  // ─── LiveKit: publish camera when stream becomes available ──
  useEffect(() => {
    if (cameraStream && isLiveKitConnected) {
      livekitPublisher.publishCamera(cameraStream).catch(err =>
        console.warn('[ExamTake] Failed to publish camera to LiveKit:', err)
      );
    }
  }, [cameraStream, isLiveKitConnected]);

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

      stopScreenCapture();

      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      if (window.electronAPI?.setAlwaysOnTop) {
        window.electronAPI.setAlwaysOnTop(false);
      }

      if (window.electronAPI?.saveExamLog) {
        try {
          await window.electronAPI.saveExamLog(examId || "unknown", violations, keyLogs);
        } catch (e) {
          console.error("Failed to save exam log", e);
        }
      }

      await api.post(`/student/exams/${examId}/submit/${attemptId}`);
      toast.success(auto ? "Bài thi đã tự động nộp (hết giờ)" : "Nộp bài thành công!");
      navigate(`/exams/${examId}`, { replace: true });
    } catch (err: any) {
      if (err?.response?.status === 400 && err?.response?.data?.message === "Bài thi đã được nộp.") {
        toast.success(auto ? "Bài thi đã tự động nộp (hết giờ)" : "Bài thi đã được nộp từ trước!");
        navigate(`/exams/${examId}`, { replace: true });
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
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Đang tải bài thi...</p>
        </div>
      </div>
    );
  }

  const answeredCount = Math.min(answers.size, totalQuestions);
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div
      className="flex flex-col h-screen bg-background select-none relative overflow-hidden"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div className="flex flex-1 overflow-hidden w-full relative">
        {config?.requireCamera !== false && (
          <WebcamPopup ref={webcamPopupRef} stream={cameraStream} />
        )}

        <ExamSidebar
          formatTime={formatTime}
          progressPercent={progressPercent}
          answeredCount={answeredCount}
          totalQuestions={totalQuestions}
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

        <div className="flex-1 flex flex-col relative overflow-hidden bg-muted/20">
          <ExamOverlay
            showLockOverlay={showLockOverlay && config?.requireCamera !== false}
            isBlurred={isBlurred}
            hardwareLock={hardwareLock}
            monitorWarning={monitorWarning}
            blurReason={blurReason}
            violationsCount={violations.length}
            devBypassLock={devBypassLock}
            onSetDevBypassLock={setDevBypassLock}
            onDismissBlur={dismissBlur}
            onClearHardwareLock={clearHardwareLock}
          />

          <ExamMainContent
            data={data}
            currentQuestion={currentQuestion}
            globalIdx={globalIdx}
            totalQuestions={totalQuestions}
            changingPage={changingPage}
            flagged={flagged}
            onToggleFlag={handleToggleFlag}
            onSelectOption={handleSelectOption}
            onEssayChange={handleEssayChange}
            answers={answers}
            isBlurred={isBlurred}
            monitorWarning={monitorWarning}
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
