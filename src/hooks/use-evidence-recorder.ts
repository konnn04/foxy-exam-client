import { useCallback, useRef } from "react";
import { proctorService } from "@/services/proctor.service";

interface EvidenceRecorderOptions {
  examId: string;
  attemptId: string;
  enabled: boolean;
}

/**
 * Lightweight violation reporter (V4 - Full Server-Side Evidence)
 * 
 * Architecture (2026-03 v4):
 * - Zero-Trust Client: Client only reports that a violation occurred.
 * - NO Canvas rendering, NO snapshots taken on client side.
 * - Server handles all evidence gathering (instant TrackEgress snapshots + video queue).
 */
export function useEvidenceRecorder(options: EvidenceRecorderOptions) {
  const { examId, attemptId, enabled } = options;

  const queueRef = useRef<Array<{ type: string; message: string; metadata?: Record<string, unknown> }>>([]);
  const processingRef = useRef(false);

  /** Process the violation queue one-by-one */
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

        // Gửi báo cáo rỗng ảnh (Server tự chụp qua TrackEgress)
        await proctorService.reportViolation(examId, payload);
      } catch (e) {
        console.error("[EvidenceRecorder] Failed to report violation:", e);
      }
    }

    processingRef.current = false;
  }, [examId, attemptId]);

  const reportViolation = useCallback(
    (violationType: string, message: string, metadata?: Record<string, unknown>) => {
      if (!enabled) return;

      queueRef.current.push({ type: violationType, message, metadata });
      processQueue();
    },
    [enabled, processQueue]
  );

  return { reportViolation };
}
