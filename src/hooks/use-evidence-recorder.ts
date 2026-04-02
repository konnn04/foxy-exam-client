import { useCallback, useEffect, useRef } from "react";
import { ATTACH_CLIENT_VIOLATION_SNAPSHOTS } from "@/config/security.config";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { proctorService } from "@/services/proctor.service";

interface EvidenceRecorderOptions {
  examId: string;
  attemptId: string;
  enabled: boolean;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  /** Override global ATTACH_CLIENT_VIOLATION_SNAPSHOTS when set */
  attachSnapshots?: boolean;
}

function captureFromVideo(video: HTMLVideoElement | null): string | null {
  if (!video || video.videoWidth === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/**
 * Violation reporter: optional client-side snapshots only when ATTACH_CLIENT_VIOLATION_SNAPSHOTS is true.
 * Otherwise POST metadata only; exam-sys + supervisor-agent attach cam/screen from LiveKit.
 */
export function useEvidenceRecorder(options: EvidenceRecorderOptions) {
  const { examId, attemptId, enabled, cameraStream, screenStream, attachSnapshots } = options;
  const wantSnapshots = attachSnapshots ?? ATTACH_CLIENT_VIOLATION_SNAPSHOTS;

  const queueRef = useRef<Array<{ type: string; message: string; metadata?: Record<string, unknown> }>>([]);
  const processingRef = useRef(false);

  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!wantSnapshots || !cameraStream) {
      if (camVideoRef.current) {
        camVideoRef.current.pause();
        camVideoRef.current.srcObject = null;
      }
      camVideoRef.current = null;
      return;
    }
    const v = document.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.srcObject = cameraStream;
    camVideoRef.current = v;
    return () => {
      v.pause();
      v.srcObject = null;
      camVideoRef.current = null;
    };
  }, [cameraStream, wantSnapshots]);

  useEffect(() => {
    if (!wantSnapshots || !screenStream) {
      if (screenVideoRef.current) {
        screenVideoRef.current.pause();
        screenVideoRef.current.srcObject = null;
      }
      screenVideoRef.current = null;
      return;
    }
    const v = document.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.srcObject = screenStream;
    screenVideoRef.current = v;
    return () => {
      v.pause();
      v.srcObject = null;
      screenVideoRef.current = null;
    };
  }, [screenStream, wantSnapshots]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;

      try {
        const payload: Record<string, any> = {
          attempt_id: attemptId,
          type: item.type,
          timestamp: new Date().toISOString(),
          metadata: { ...item.metadata, message: item.message },
        };

        if (wantSnapshots) {
          const snapshotCam = captureFromVideo(camVideoRef.current);
          const snapshotScreen = captureFromVideo(screenVideoRef.current);
          if (snapshotCam) payload.snapshot_cam = snapshotCam;
          if (snapshotScreen) payload.snapshot_screen = snapshotScreen;
        }

        const res = await proctorService.reportViolation(examId, payload);
        const violationId = res.data?.violation_id as number | undefined;
        if (violationId != null && !wantSnapshots) {
          void livekitPublisher.requestAgentSnapshots(violationId, Number(examId), Number(attemptId));
        }
      } catch (e) {
        console.error("[EvidenceRecorder] Failed to report violation:", e);
      }
    }

    processingRef.current = false;
  }, [examId, attemptId, wantSnapshots]);

  const reportViolation = useCallback(
    (violationType: string, message: string, metadata?: Record<string, unknown>) => {
      if (!enabled) return;
      queueRef.current.push({ type: violationType, message, metadata });
      processQueue();
    },
    [enabled, processQueue],
  );

  return { reportViolation };
}
