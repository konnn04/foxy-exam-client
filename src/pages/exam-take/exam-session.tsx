import { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { useExamSocketStore, useExamSocket } from "@/hooks/use-exam-socket";
import { webrtcService } from "@/lib/webrtc-service";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { telemetryPublisher } from "@/lib/telemetry-publisher";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { ExamMainContent, ExamOverlay, ExamTopNav, ExamStatusBar, KeyboardLogBar } from "@/components/exam/exam-take-sections";
import { ExamCameraWidget, ExamCameraWidgetHandle } from "@/components/exam/exam-camera-widget";
import { useFaceMonitor } from "@/hooks/use-face-monitor";
import { useExamLockdown } from "@/hooks/use-exam-lockdown";
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
import { DualCameraSpotCheckOverlay } from "@/components/exam/dual-camera-spot-check-overlay";

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

  const webcamPopupRef = useRef<ExamCameraWidgetHandle>(null);
  const [mobileStream, setMobileStream] = useState<MediaStream | null>(null);

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
  const wsReconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsDisconnectedRef = useRef(false);
  const blurReasonRef = useRef("");
  
  const screenStreamRef = useRef<MediaStream | null>(initialScreenStream);
  const dismissCooldownRef = useRef(false); // suppress events during dismiss
  const WS_DISCONNECT_BLUR_MSG = t("exam.wsDisconnectBlur");

  useEffect(() => {
    blurReasonRef.current = blurReason;
  }, [blurReason]);

  // ─── Telemetry lifecycle ─────────────────────────────────
  useEffect(() => {
    telemetryPublisher.start(examId, attemptId);
    return () => {
      telemetryPublisher.stop();
    };
  }, [examId, attemptId]);

  const { hardwareLock, bannedApps, screenCount, keyLogs, clearHardwareLock } = useExamLockdown({
    wizardPhase: 5,
    config,
    examId,
    submitting,
    setIsBlurred,
    setBlurReason,
  });

  // Audio monitoring for speech detection during exam
  const { speechDetected: _speechDetected, isRecording: _isRecordingAudio, clipCount: _audioClipCount } = useAudioMonitor({
    stream: cameraStream,
    enabled: !submitting && Boolean(cameraStream) && config?.requireMic === true,
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
    Boolean(cameraStream) && config?.requireCamera !== false && config?.monitorGaze === true,
    handleFrameRender,
    examId,
    attemptId,
    uploadFramesToServer,
    config?.requireMic === true,
  );

  const lastToastWarningRef = useRef("");

  useEffect(() => {
    if (monitorWarning && monitorWarning !== "Đang đồng bộ luồng theo dõi AI chống gian lận...") {
      if (lastToastWarningRef.current !== monitorWarning) {
        // Face warnings now go via telemetry (face_gaze events in use-face-monitor)
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
  // Only server-side faceAuthLockedMsg triggers the hard lock overlay;
  // client-side monitorWarning is shown as a toast, not a lock.
  const showLockOverlay = faceAuthLockedMsg !== "" && !devBypassLock && !(DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE);

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
            telemetryPublisher.send("screen_share_stopped", {});
          }
        };
      }
    }

    return () => {
      stopScreenCapture();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  // Track mouse leaving the window (throttled to once every 5s)
  const lastCursorLeftRef = useRef(0);
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
        const now = Date.now();
        if (now - lastCursorLeftRef.current < 5000) return; // throttle 5s
        lastCursorLeftRef.current = now;
        telemetryPublisher.send('cursor_left', { x: e.clientX, y: e.clientY });
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(
          `${API_ENDPOINTS.EXAM_TAKE(examId, attemptId)}?page=1`
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
        toast.error(t("exam.loadExamError"));
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [examId, attemptId, navigate, toast]);

  const fetchPage = async (page: number, targetGlobalIdx: number) => {
    setChangingPage(true);
    try {
      const res = await api.get(`${API_ENDPOINTS.EXAM_TAKE(examId, attemptId)}?page=${page}`);
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
      toast.error(t("exam.loadPageError"));
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

    const unsubDisconnect = useExamSocketStore.getState().onDisconnect(() => {
      setWsDisconnected(true);
      wsDisconnectedRef.current = true;
      // Avoid lock flapping on short websocket blips.
      if (wsReconnectGraceTimerRef.current) return;
      wsReconnectGraceTimerRef.current = setTimeout(() => {
        wsReconnectGraceTimerRef.current = null;
        if (!wsDisconnectedRef.current) return;
        setIsBlurred(true);
        setBlurReason(WS_DISCONNECT_BLUR_MSG);
      }, 5000);
    });

    const unsubReconnect = useExamSocketStore.getState().onReconnect(() => {
      setWsDisconnected(false);
      wsDisconnectedRef.current = false;
      if (wsReconnectGraceTimerRef.current) {
        clearTimeout(wsReconnectGraceTimerRef.current);
        wsReconnectGraceTimerRef.current = null;
      }
      // Do not clear other lock reasons (fullscreen, banned app, etc.).
      if (blurReasonRef.current === WS_DISCONNECT_BLUR_MSG) {
        setIsBlurred(false);
        setBlurReason("");
      }
    });

    const unsubViolation = useExamSocketStore.getState().onViolation((event: {
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
        prohibited_object: t("exam.violationProhibitedObject"),
        face_verification_failed: t("exam.violationFaceFailed"),
      };
      const message = labels[vType] || t("exam.violationGeneric", { type: vType });

      startTransition(() => {
        setViolations((prev) => [
          ...prev,
          { type: vType, timestamp: Date.now(), message, fromServer: true },
        ]);
      });

      const critical =
        event.severity === "critical" ||
        vType === "prohibited_object" ||
        vType === "face_verification_failed";
      if (critical) {
        queueMicrotask(() => toast.error(message));
        if (!(DEVELOPMENT_MODE.ENABLED && NO_LOCKSCREEN_WHEN_DEV_MODE)) {
          startTransition(() => {
            setIsBlurred(true);
            setBlurReason(message);
          });
        }
      }
    });

    if (cameraStream) {
      webrtcService.init({
        examId: examIdNum,
        localStream: cameraStream,
      });
    }

    const requiresLiveKit =
      config?.level === "strict" ||
      config?.requireCamera === true ||
      config?.requireMic === true ||
      config?.requireScreenShare === true ||
      config?.requireDualCamera === true ||
      config?.monitorGaze === true ||
      config?.detectBannedObjects === true ||
      config?.detectBannedApps === true;

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
        } else if (requiresLiveKit) {
          toast.error(t("exam.liveKitConnectError"));
          await exitExamFullscreen();
          navigate(`/exams/${examIdNum}`, { replace: true });
        }
      } catch (err) {
        console.warn('[ExamTake] LiveKit connect failed:', err);
        if (requiresLiveKit) {
          toast.error(t("exam.liveKitConnectError"));
          await exitExamFullscreen();
          navigate(`/exams/${examIdNum}`, { replace: true });
        }
      }
    })();

    const handleSignal = (e: CustomEvent) => {
      const signal = e.detail;
      if (signal.signalType === 'stop-exam') {
        toast.error(
          t("exam.examSuspended"),
          signal.data?.reason || t("exam.examSuspendedReason")
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
            ? t("exam.faceAuthLockedWrongFace")
            : t("exam.faceAuthLockedFailed")
        );
      } else {
        useProctorStore.getState().setFaceAuthLockedMsg('');
        useProctorStore.getState().setMonitorWarning('');
      }
    };
    window.addEventListener('face-lock', handleFaceLock as EventListener);

    // const statusPollId = setInterval(async () => {
    //   try {
    //     const res = await api.get(API_ENDPOINTS.EXAM_TAKE_STATUS(examIdNum, attemptIdNum));
    //     if (res.data?.submitted_at) {
    //       toast.error(t("exam.examSuspendedByProctor"));
    //       livekitPublisher.disconnect();
    //       await exitExamFullscreen();
    //       navigate(`/exams/${examIdNum}`, { replace: true });
    //     }
    //   } catch {
    //   }
    // }, 30000);

    return () => {
      if (wsReconnectGraceTimerRef.current) {
        clearTimeout(wsReconnectGraceTimerRef.current);
        wsReconnectGraceTimerRef.current = null;
      }
      unsubDisconnect();
      unsubReconnect();
      unsubViolation();
      webrtcService.destroy();
      livekitPublisher.disconnect();
      window.removeEventListener('webrtc-signal', handleSignal as EventListener);
      window.removeEventListener('face-lock', handleFaceLock as EventListener);
      // clearInterval(statusPollId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.exam?.id]);

  // ─── LiveKit: desktop publishes webcam + mic; phone relay stays on `-mobile` only (cam 2). ──
  const cameraRetryRef = useRef(0);
  useEffect(() => {
    if (!cameraStream || !isLiveKitConnected) return;
    let cancelled = false;

    const tryPublish = async () => {
      const pubs = await livekitPublisher.publishCamera(cameraStream, {
        includeVideo: !mobileRelayOnly,
        includeAudio: config?.requireMic === true,
      });
      if (cancelled) return;
      // Retry if no tracks were published (e.g. room not ready yet)
      if (pubs.length === 0 && cameraRetryRef.current < 3) {
        cameraRetryRef.current++;
        console.warn(`[ExamTake] Camera publish returned 0 tracks, retry ${cameraRetryRef.current}/3`);
        setTimeout(() => { if (!cancelled) tryPublish(); }, 2000);
      } else if (pubs.length === 0) {
        console.error("[ExamTake] Camera publish failed after 3 retries");
      } else {
        cameraRetryRef.current = 0;
      }
    };

    tryPublish().catch((err) => console.warn("[ExamTake] Failed to publish camera to LiveKit:", err));
    return () => { cancelled = true; };
  }, [cameraStream, isLiveKitConnected, mobileRelayOnly, config?.requireMic]);

  // ─── LiveKit: publish screen when sharing starts and connected ──
  const screenRetryRef = useRef(0);
  useEffect(() => {
    if (config?.requireScreenShare !== true || !isScreenSharing || !screenStreamRef.current || !isLiveKitConnected) return;
    let cancelled = false;

    const tryPublish = async () => {
      const pubs = await livekitPublisher.publishScreen(screenStreamRef.current!);
      if (cancelled) return;
      if (pubs.length === 0 && screenRetryRef.current < 3) {
        screenRetryRef.current++;
        console.warn(`[ExamTake] Screen publish returned 0 tracks, retry ${screenRetryRef.current}/3`);
        setTimeout(() => { if (!cancelled) tryPublish(); }, 2000);
      } else if (pubs.length === 0) {
        console.error("[ExamTake] Screen publish failed after 3 retries");
      } else {
        screenRetryRef.current = 0;
      }
    };

    tryPublish().catch(err => console.warn('[ExamTake] Failed to publish screen to LiveKit:', err));
    return () => { cancelled = true; };
  }, [isScreenSharing, isLiveKitConnected, config?.requireScreenShare]);

  // ─── LiveKit: get mobile relay stream if dual-cam ──
  useEffect(() => {
    if (config?.requireDualCamera === true && isLiveKitConnected && !mobileRelayOnly) {
      let active = true;
      livekitPublisher.waitForMobileRelayCameraMediaStream(120_000).then(stream => {
        if (active && stream) setMobileStream(stream);
      }).catch(err => console.warn("[ExamTake] Failed to wait for mobile relay camera:", err));
      return () => { active = false; };
    }
  }, [isLiveKitConnected, config?.requireDualCamera, mobileRelayOnly]);

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
            API_ENDPOINTS.EXAM_SAVE_ANSWER(examId, attemptId),
            {
              question_id: questionId,
              answer_id: answerId ?? null,
              answer_content: answerContent ?? null,
            }
          );
        } catch {
          toast.error(t("exam.saveAnswerError"));
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
    useExamSocketStore.getState().logEvent('text_typed', { questionId, length: content.length });
    saveAnswer(questionId, null, content);
  };

  const handleTrueFalseSelect = (questionId: number, value: boolean) => {
    const content = value ? "true" : "false";
    const answer: Answer = { question_id: questionId, answer_content: content };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    useExamSocketStore.getState().logEvent('answer_selected', { questionId, optionValue: content });
    saveAnswer(questionId, null, content);
  };

  const handleFillBlankChange = (questionId: number, slots: string[]) => {
    const json = JSON.stringify(slots);
    const answer: Answer = { question_id: questionId, answer_content: json };
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    useExamSocketStore.getState().logEvent('text_typed', { questionId, slotsCount: slots.length });
    saveAnswer(questionId, null, json);
  };

  const handleToggleFlag = async (questionId: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    useExamSocketStore.getState().logEvent('flag_toggled', { questionId });
    try {
      await api.post(
        API_ENDPOINTS.EXAM_FLAG_ANSWER(examId, attemptId),
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
    useExamSocketStore.getState().logEvent('exam_submit', { auto });
    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => {
          t.stop();
        });
      }

      stopScreenCapture();

      await exitExamFullscreen();

      if (window.electronAPI?.getSystemMetrics) {
        try {
          const metrics = await window.electronAPI.getSystemMetrics();
          telemetryPublisher.emit("perf_metrics", {
            ...metrics,
            fps: 0,
            summary: true,
            scope: "exam_end",
          });
        } catch { /* best-effort */ }
      }
      if (window.electronAPI?.getProcessList) {
        try {
          const processes = await window.electronAPI.getProcessList();
          telemetryPublisher.emit("process_snapshot", {
            action: "final",
            scope: "exam_end",
            processes: (processes || []).map((p: any) => ({ name: p.name, pid: p.pid })),
          });
        } catch { /* best-effort */ }
      }
      telemetryPublisher.flush();

      if (window.electronAPI?.saveExamLog) {
        try {
          await window.electronAPI.saveExamLog(examId || "unknown", violations, keyLogs);
        } catch (e) {
          console.error("Failed to save exam log", e);
        }
      }

      livekitPublisher.disconnect();

      await api.post(API_ENDPOINTS.EXAM_SUBMIT(examId, attemptId));
      toast.success(auto ? t("exam.autoSubmitted") : t("exam.submitSuccess"));
      const backExamId = data?.exam?.id ?? examId;
      navigate(`/exams/${backExamId}`, { replace: true });
    } catch (err: any) {
      if (err?.response?.status === 400 && err?.response?.data?.message === "Bài thi đã được nộp.") {
        livekitPublisher.disconnect();
        await exitExamFullscreen();
        toast.success(auto ? t("exam.autoSubmitted") : t("exam.alreadySubmitted"));
        const backExamId = data?.exam?.id ?? examId;
        navigate(`/exams/${backExamId}`, { replace: true });
        return;
      }
      toast.error(t("exam.submitError"));
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
        {config?.requireCamera !== false && (
          <ExamCameraWidget
            ref={webcamPopupRef}
            primaryStream={cameraStream}
            secondaryStream={mobileStream}
            requireDualCamera={config?.requireDualCamera === true}
          />
        )}

        {/* Dual camera random spot check overlay */}
        {!submitting && (
          <DualCameraSpotCheckOverlay
            examId={examId}
            attemptId={attemptId}
            enabled={config?.requireDualCamera === true}
          />
        )}

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

      <KeyboardLogBar />

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
