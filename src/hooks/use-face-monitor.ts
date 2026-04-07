import { useEffect, useRef, useState, useCallback } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createFaceLandmarker, extractPitchYaw } from "@/lib/mediapipe-service";
import {
  FACE_BOUNDARIES,
  MONITORING_THRESHOLDS,
  EYE_CONTACT,
  FACE_MONITOR_TIMING,
  MOUTH_DETECTION,
  FACE_EVENT_LOG,
} from "@/config";
import api from "@/lib/api";
import { useProctorStore } from "@/stores/use-proctor-store";
import { telemetryPublisher } from "@/lib/telemetry-publisher";

export interface FaceStatus {
  isLooking: boolean;
  isCentered: boolean;
  isGoodDistance: boolean;
  pitch: number;
  yaw: number;
  faceWidth: number;
  faceHeight: number;
  centerX: number;
  centerY: number;
  eyeLookAway: boolean;
}

export function useFaceMonitor(
  stream: MediaStream | null, 
  active: boolean,
  onFrameRender?: (results: FaceLandmarkerResult | null) => void,
  examId?: string,
  attemptId?: string,
  enableFaceCrop?: boolean,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const nullFrameCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  const eyeLookAwayStartTimeRef = useRef(0);
  const faceWarmupStartedAtRef = useRef(0);
  const focusStateRef = useRef<"focused" | "lost">("focused");
  const focusLostAtRef = useRef(0);
  const focusLostReasonsRef = useRef<string[]>([]);
  const pendingFocusLostAtRef = useRef(0);
  const pendingFocusRestoreAtRef = useRef(0);

  // Mouth movement (talking) detection refs
  const mouthOpenHistoryRef = useRef<number[]>([]);
  const mouthTalkingStartRef = useRef(0);
  const lastMouthLogRef = useRef(0);

  // Face event logging cooldown refs (prevent spamming)
  const lastFaceEventLogRef = useRef<Record<string, number>>({});

  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !stream) return;
    faceWarmupStartedAtRef.current = performance.now();
    focusStateRef.current = "focused";
    focusLostAtRef.current = 0;
    focusLostReasonsRef.current = [];
    pendingFocusLostAtRef.current = 0;
    pendingFocusRestoreAtRef.current = 0;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    videoRef.current = video;

    return () => {
      faceWarmupStartedAtRef.current = 0;
      focusStateRef.current = "focused";
      focusLostAtRef.current = 0;
      focusLostReasonsRef.current = [];
      pendingFocusLostAtRef.current = 0;
      pendingFocusRestoreAtRef.current = 0;
      video.pause();
      video.srcObject = null;
      videoRef.current = null;
    };
  }, [stream, active]);

  useEffect(() => {
    if (!active) return;
    
    let isMounted = true;
    (async () => {
      try {
        const faceLandmarker = await createFaceLandmarker({ blendshapes: true });
        if (isMounted) {
          faceLandmarkerRef.current = faceLandmarker;
          setIsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load FaceLandmarker for monitor:", err);
        if (isMounted) setError("Lỗi tải AI giám sát");
      }
    })();

    return () => {
      isMounted = false;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, [active]);

  const processFrame = useCallback(() => {
    if (!active || !videoRef.current || !faceLandmarkerRef.current) return;
    const video = videoRef.current;

    const now = performance.now();
    lastProcessTimeRef.current = now;
    const faceWarmupMs = 10_000;
    const inFaceWarmup =
      faceWarmupStartedAtRef.current > 0 &&
      now - faceWarmupStartedAtRef.current < faceWarmupMs;

    if (video.videoWidth > 0 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of landmarks) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }

        const faceHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const isCentered = Math.abs(centerX - 0.5) <= FACE_BOUNDARIES.MAX_CENTER_OFFSET && Math.abs(centerY - 0.5) <= FACE_BOUNDARIES.MAX_CENTER_OFFSET;
        const isGoodDistance = faceHeight <= FACE_BOUNDARIES.MAX_HEIGHT;

        let isLooking = false;
        let pitchDeg = 0;
        let yawDeg = 0;

        if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
          const angles = extractPitchYaw(results.facialTransformationMatrixes[0].data);
          pitchDeg = angles.pitch;
          yawDeg = angles.yaw;
          isLooking = Math.abs(pitchDeg) < MONITORING_THRESHOLDS.PITCH_THRESHOLD && Math.abs(yawDeg) < MONITORING_THRESHOLDS.YAW_THRESHOLD;
        }

        let eyeLookAway = false;
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const shapes = results.faceBlendshapes[0].categories;
          
          let maxEyeDev = 0;
          for (const shape of shapes) {
            if (shape.categoryName.startsWith("eyeLook")) {
              maxEyeDev = Math.max(maxEyeDev, shape.score);
            }
          }
          
          const isDeviated = maxEyeDev > EYE_CONTACT.LOOK_THRESHOLD;
          if (isDeviated) {
            if (eyeLookAwayStartTimeRef.current === 0) {
              eyeLookAwayStartTimeRef.current = now;
              eyeLookAway = false;
            } else if (now - eyeLookAwayStartTimeRef.current < FACE_MONITOR_TIMING.EYE_LOOKAWAY_DEBOUNCE_MS) {
              eyeLookAway = false;
            } else {
              eyeLookAway = true;
            }
          } else {
            eyeLookAwayStartTimeRef.current = 0;
            eyeLookAway = false;
          }
        }

        // ─── Mouth movement / talking detection ─────────────────────
        let mouthTalking = false;
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const shapes = results.faceBlendshapes[0].categories;
          let jawOpen = 0;
          for (const shape of shapes) {
            if (shape.categoryName === "jawOpen") { jawOpen = shape.score; break; }
          }

          const history = mouthOpenHistoryRef.current;
          history.push(jawOpen);
          if (history.length > MOUTH_DETECTION.HISTORY_FRAMES) history.shift();

          if (jawOpen > MOUTH_DETECTION.JAW_OPEN_THRESHOLD && history.length >= 5) {
            const mean = history.reduce((a, b) => a + b, 0) / history.length;
            const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;

            const sustainedOpen = jawOpen > (MOUTH_DETECTION.JAW_OPEN_THRESHOLD + 0.08);
            if (variance > MOUTH_DETECTION.VARIANCE_THRESHOLD || sustainedOpen) {
              if (mouthTalkingStartRef.current === 0) {
                mouthTalkingStartRef.current = now;
              } else if (now - mouthTalkingStartRef.current > MOUTH_DETECTION.SUSTAINED_MS) {
                mouthTalking = true;
                if (now - lastMouthLogRef.current > MOUTH_DETECTION.LOG_COOLDOWN_MS) {
                  lastMouthLogRef.current = now;
                  telemetryPublisher.emit("mouth_movement", {
                    jawOpen: +jawOpen.toFixed(3),
                    variance: +variance.toFixed(5),
                    sustainedOpen,
                  });
                }
              }
            } else {
              mouthTalkingStartRef.current = 0;
            }
          } else {
            mouthTalkingStartRef.current = 0;
          }
        }

        // ─── Log face monitoring events via telemetry ─────────────
        const logFaceEvent = (eventType: string, data?: Record<string, any>) => {
          if (inFaceWarmup) return;
          const last = lastFaceEventLogRef.current[eventType] ?? 0;
          if (now - last > FACE_EVENT_LOG.COOLDOWN_MS) {
            lastFaceEventLogRef.current[eventType] = now;
            telemetryPublisher.emit(eventType, data);
          }
        };

        // Edge-only gaze telemetry to avoid flooding timeline:
        // emit only when attention state changes (lost/restored), not per-frame/per-second.
        if (!inFaceWarmup) {
          const FOCUS_LOST_DEBOUNCE_MS = 1500;
          const FOCUS_RESTORED_DEBOUNCE_MS = 1500;
          const reasons: string[] = [];
          if (!isLooking) reasons.push("not_looking");
          if (eyeLookAway) reasons.push("eye_away");
          const isFocusLost = reasons.length > 0;

          if (isFocusLost) {
            pendingFocusRestoreAtRef.current = 0;
            if (focusStateRef.current !== "lost") {
              if (pendingFocusLostAtRef.current === 0) {
                pendingFocusLostAtRef.current = now;
              } else if (now - pendingFocusLostAtRef.current >= FOCUS_LOST_DEBOUNCE_MS) {
                focusStateRef.current = "lost";
                focusLostAtRef.current = now;
                focusLostReasonsRef.current = reasons;
                telemetryPublisher.emit("face_focus_lost", {
                  reasons,
                  pitch: pitchDeg,
                  yaw: yawDeg,
                  centered: isCentered,
                  goodDistance: isGoodDistance,
                });
                pendingFocusLostAtRef.current = 0;
              }
            }
          } else {
            pendingFocusLostAtRef.current = 0;
            if (focusStateRef.current === "lost") {
              if (pendingFocusRestoreAtRef.current === 0) {
                pendingFocusRestoreAtRef.current = now;
              } else if (now - pendingFocusRestoreAtRef.current >= FOCUS_RESTORED_DEBOUNCE_MS) {
                const lostMs = Math.max(0, now - focusLostAtRef.current);
                telemetryPublisher.emit("face_focus_restored", {
                  lostMs: Math.round(lostMs),
                  reasons: focusLostReasonsRef.current,
                });
                focusStateRef.current = "focused";
                focusLostAtRef.current = 0;
                focusLostReasonsRef.current = [];
                pendingFocusRestoreAtRef.current = 0;
              }
            }
          }
        }

        if (!isGoodDistance) logFaceEvent("face_too_close", { faceHeight: maxY - minY });
        if (!isCentered) logFaceEvent("face_not_centered", { centerX, centerY });
        if (mouthTalking) logFaceEvent("talking_detected", { method: "mouth_visual" });

        let newWarning = "";
        if (!isGoodDistance) {
          newWarning = "Bạn đang ở quá gần màn hình. Hãy ngồi xa ra một chút.";
        } else if (!isCentered) {
          newWarning = "Khuôn mặt của bạn đang lệch khỏi trung tâm camera.";
        } else if (!isLooking) {
          newWarning = "Vui lòng duy trì hướng nhìn thẳng vào bài thi.";
        } else if (eyeLookAway) {
          newWarning = "Mắt bạn đang nhìn lệch với bài thi quá nhiều.";
        } else if (mouthTalking) {
          newWarning = "Hệ thống phát hiện bạn đang nói chuyện.";
        }

        const currentWarning = useProctorStore.getState().monitorWarning;
        if (currentWarning !== newWarning && useProctorStore.getState().faceAuthLockedMsg === "") {
          useProctorStore.getState().setMonitorWarning(newWarning);
        }

        nullFrameCounterRef.current = 0;
        if (onFrameRender) onFrameRender(results);
      } else {
        if (onFrameRender) onFrameRender(null);
        nullFrameCounterRef.current++;
        if (nullFrameCounterRef.current >= MONITORING_THRESHOLDS.NULL_FACE_THRESHOLD) {
          const currentWarning = useProctorStore.getState().monitorWarning;
          if (currentWarning !== "Hệ thống không tìm thấy khuôn mặt của bạn." && useProctorStore.getState().faceAuthLockedMsg === "") {
            useProctorStore.getState().setMonitorWarning("Hệ thống không tìm thấy khuôn mặt của bạn.");

            if (!inFaceWarmup && focusStateRef.current !== "lost") {
              if (pendingFocusLostAtRef.current === 0) {
                pendingFocusLostAtRef.current = now;
              } else if (now - pendingFocusLostAtRef.current >= 1500) {
                focusStateRef.current = "lost";
                focusLostAtRef.current = now;
                focusLostReasonsRef.current = ["face_not_found"];
                telemetryPublisher.emit("face_focus_lost", {
                  reasons: ["face_not_found"],
                  nullFrames: nullFrameCounterRef.current,
                });
                pendingFocusLostAtRef.current = 0;
              }
            }

            const last = lastFaceEventLogRef.current["face_not_found"] ?? 0;
            if (!inFaceWarmup && now - last > FACE_EVENT_LOG.COOLDOWN_MS) {
              lastFaceEventLogRef.current["face_not_found"] = now;
              telemetryPublisher.emit("face_not_found", {
                nullFrames: nullFrameCounterRef.current,
              });
            }
          }
        }
      }
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, [active]);

  useEffect(() => {
    if (isLoaded && active) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [isLoaded, active, processFrame]);

  // Periodic face crop upload for server-side verification.
  // Server verifies async and sends lock/unlock via WebSocket (FaceLockEvent).
  useEffect(() => {
    if (!active || !examId || !attemptId || !enableFaceCrop) return;

    let isActive = true;
    let timerId: ReturnType<typeof setTimeout>;

    const captureAndUpload = async () => {
      if (!isActive || !videoRef.current) {
        timerId = setTimeout(captureAndUpload, 3000 + Math.random() * 2000);
        return;
      }

      const video = videoRef.current;
      if (video.videoWidth === 0) {
        timerId = setTimeout(captureAndUpload, 2000);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        timerId = setTimeout(captureAndUpload, 3000 + Math.random() * 2000);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL("image/jpeg", 0.7);

      let nextMs = 3000 + Math.random() * 2000;

      try {
        const res = await api.post(`/student/exams/${examId}/monitor/face-crop`, {
          attempt_id: attemptId,
          image: base64Image,
        });
        if (res.data?.next_interval_ms) {
          nextMs = res.data.next_interval_ms;
        }
      } catch {
        nextMs = 5000;
      }

      if (isActive) {
        timerId = setTimeout(captureAndUpload, nextMs);
      }
    };

    timerId = setTimeout(captureAndUpload, 3000 + Math.random() * 2000);

    return () => {
      isActive = false;
      clearTimeout(timerId);
    };
  }, [active, examId, attemptId, enableFaceCrop]);

  return { isLoaded, error };
}
