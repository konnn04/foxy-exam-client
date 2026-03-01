import { useEffect, useRef, useState, useCallback } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createFaceLandmarker, extractPitchYaw } from "@/lib/mediapipe-service";
import {
  TARGET_INTERVAL_MS,
  MAX_FACE_HEIGHT,
  MAX_CENTER_OFFSET,
  MONITOR_PITCH_THRESHOLD,
  MONITOR_YAW_THRESHOLD,
  NULL_FACE_THRESHOLD,
  EYE_LOOK_THRESHOLD,
} from "@/config/mediapipe-config";

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
  onFrameRender?: (results: FaceLandmarkerResult | null) => void
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const nullFrameCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  const eyeLookAwayStartTimeRef = useRef(0);

  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<FaceStatus | null>(null);
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
    if (now - lastProcessTimeRef.current < TARGET_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }
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

        const faceWidth = maxX - minX;
        const faceHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const isCentered = Math.abs(centerX - 0.5) <= MAX_CENTER_OFFSET && Math.abs(centerY - 0.5) <= MAX_CENTER_OFFSET;
        const isGoodDistance = faceHeight <= MAX_FACE_HEIGHT;

        let isLooking = false;
        let pitchDeg = 0;
        let yawDeg = 0;

        if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
          const angles = extractPitchYaw(results.facialTransformationMatrixes[0].data);
          pitchDeg = angles.pitch;
          yawDeg = angles.yaw;
          isLooking = Math.abs(pitchDeg) < MONITOR_PITCH_THRESHOLD && Math.abs(yawDeg) < MONITOR_YAW_THRESHOLD;
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
          
          const isDeviated = maxEyeDev > EYE_LOOK_THRESHOLD;
          if (isDeviated) {
            if (eyeLookAwayStartTimeRef.current === 0) {
              eyeLookAwayStartTimeRef.current = now;
              eyeLookAway = false;
            } else if (now - eyeLookAwayStartTimeRef.current < 500) {
              eyeLookAway = false;
            } else {
              eyeLookAway = true;
            }
          } else {
            eyeLookAwayStartTimeRef.current = 0;
            eyeLookAway = false;
          }
        }

        setStatus({
          isLooking,
          isCentered,
          isGoodDistance,
          pitch: pitchDeg,
          yaw: yawDeg,
          faceWidth,
          faceHeight,
          centerX,
          centerY,
          eyeLookAway
        });
        nullFrameCounterRef.current = 0;
        if (onFrameRender) onFrameRender(results);
      } else {
        if (onFrameRender) onFrameRender(null);
        nullFrameCounterRef.current++;
        if (nullFrameCounterRef.current >= NULL_FACE_THRESHOLD) {
          setStatus(null);
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

  return { isLoaded, status, error };
}
