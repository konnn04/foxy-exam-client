import { useEffect, useRef, useState, useCallback } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createFaceLandmarker, extractPitchYaw } from "@/lib/mediapipe-service";
import {
  FACE_BOUNDARIES,
  MONITORING_THRESHOLDS,
  EYE_CONTACT,
  FACE_MONITOR_TIMING,
} from "@/config";
import api from "@/lib/api";
import { useProctorStore } from "@/stores/use-proctor-store";

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
  verificationIntervalSeconds?: number
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const nullFrameCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  const eyeLookAwayStartTimeRef = useRef(0);

  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !stream) return;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    videoRef.current = video;

    return () => {
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

        let newWarning = "";
        if (!isGoodDistance) {
          newWarning = "Bạn đang ở quá gần màn hình. Hãy ngồi xa ra một chút.";
        } else if (!isCentered) {
          newWarning = "Khuôn mặt của bạn đang lệch khỏi trung tâm camera.";
        } else if (!isLooking) {
          newWarning = "Vui lòng duy trì hướng nhìn thẳng vào bài thi.";
        } else if (eyeLookAway) {
          newWarning = "Mắt bạn đang nhìn lệch với bài thi quá nhiều.";
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

  // Periodic Face Verification (3-strike logic)
  useEffect(() => {
    if (!active || !examId || !verificationIntervalSeconds || verificationIntervalSeconds <= 0) return;

    let isActive = true;
    let timerId: ReturnType<typeof setTimeout>;
    let failsCount = 0;
    let currentlyLocked = false;

    const runVerification = async () => {
      if (!isActive || !videoRef.current) return;
      const video = videoRef.current;
      
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      
      let isMatch = false;
      let apiCalled = false;
      
      if (ctx && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL("image/jpeg", 0.8);
        const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
        const formData = new FormData();
        formData.append("image", base64Data);
        
        try {
          const res = await api.post(`/student/exams/${examId}/verify-identity`, formData);
          isMatch = res.data.match === true;
          apiCalled = true;
        } catch (err) {
          console.error("Periodic face verification error:", err);
          isMatch = false;
        }
      }

      if (!isActive) return;

      if (isMatch) {
         // Success
         failsCount = 0;
         if (currentlyLocked) {
             currentlyLocked = false;
             useProctorStore.getState().setFaceAuthLockedMsg("");
         }
         timerId = setTimeout(runVerification, verificationIntervalSeconds * 1000);
      } else {
         // Failure
         if (apiCalled) {
             failsCount++;
         }
         
         if (failsCount >= 3 && !currentlyLocked) {
             currentlyLocked = true;
             useProctorStore.getState().setFaceAuthLockedMsg("Khuôn mặt không hợp lệ hoặc không có người. Vui lòng đưa đúng khuôn mặt vào camera.");
             // Lock screen will log violation in the exam-take effect instead, or we can add it here.
         }
         
         // Retry faster if failing or locked
         const nextDelay = (failsCount > 0 || currentlyLocked) ? 2000 : (verificationIntervalSeconds * 1000);
         timerId = setTimeout(runVerification, nextDelay);
      }
    };

    // Initial start
    timerId = setTimeout(runVerification, verificationIntervalSeconds * 1000);

    return () => {
      isActive = false;
      clearTimeout(timerId);
    };
  }, [active, examId, verificationIntervalSeconds]);

  return { isLoaded, error };
}
