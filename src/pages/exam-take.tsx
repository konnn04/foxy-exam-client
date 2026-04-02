import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useExamSocketStore } from "@/hooks/use-exam-socket";
import type { ExamTrackingConfig } from "@/types/exam";
import { collectDeviceInfo, generateFingerprint } from "@/lib/device-fingerprint";
import { ExamPrecheck } from "./exam-take/exam-precheck";
import { ExamSession } from "./exam-take/exam-session";
import { useElectronExamStrictWindow } from "@/hooks/use-electron-exam-strict-window";

export default function ExamTakePage() {
  const { examId, attemptId } = useParams<{
    examId: string;
    attemptId: string;
  }>();
  
  const navigate = useNavigate();
  const toast = useToastCustom();

  const [phase, setPhase] = useState<"precheck" | "exam">("precheck");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [examConfig, setExamConfig] = useState<ExamTrackingConfig | null>(null);
  const [mobileRelayOnly, setMobileRelayOnly] = useState(false);

  /** Electron: strict window only on this route (precheck + exam); cleanup restores normal maximized window. */
  useElectronExamStrictWindow();

  const handlePrecheckComplete = useCallback(
    async (
      camStream: MediaStream | null,
      scrStream: MediaStream | null,
      config: ExamTrackingConfig,
      _proctorConfig: any,
      opts?: { mobileRelayOnly?: boolean },
    ) => {
      setCameraStream(camStream);
      setScreenStream(scrStream);
      setExamConfig(config);
      setMobileRelayOnly(opts?.mobileRelayOnly ?? false);

      try {
        if (examId && attemptId) {
          let beginBody: Record<string, unknown> = {};

          if (config.lockDevice && config.device_lock_secret) {
            const deviceInfo = await collectDeviceInfo();
            const fp = await generateFingerprint(deviceInfo, config.device_lock_secret);
            beginBody = {
              device_fingerprint: fp.fingerprint,
              device_info: fp.info,
              device_checksum: fp.checksum,
              device_timestamp: fp.timestamp,
            };
            // Store for ongoing verification during event flushes
            useExamSocketStore.getState().setDeviceLock({
              fingerprint: fp.fingerprint,
              checksum: fp.checksum,
              timestamp: fp.timestamp,
            });
          }

          const res = await api.post(
            `/student/exams/${examId}/take/${attemptId}/begin`,
            beginBody
          );

          if (res.data?.error === "device_changed") {
            toast.error("Thiết bị không khớp! Vui lòng sử dụng cùng thiết bị đã bắt đầu thi.");
            navigate("/dashboard");
            return;
          }
        }
        setPhase("exam");
      } catch (e: any) {
        if (e?.response?.data?.error === "device_changed") {
          toast.error("Thiết bị không khớp với phiên thi. Vui lòng sử dụng cùng thiết bị.");
          navigate("/dashboard");
          return;
        }
        console.error(e);
        toast.error("Không thể kết nối máy chủ để bắt đầu tính giờ làm bài.");
        navigate("/dashboard");
      }
    },
    [examId, attemptId, toast, navigate]
  );

  if (!examId || !attemptId) return null;

  if (phase === "precheck") {
    return (
      <ExamPrecheck 
        examId={examId} 
        attemptId={attemptId} 
        onComplete={handlePrecheckComplete} 
      />
    );
  }

  if (phase === "exam" && examConfig) {
    return (
      <ExamSession
        examId={examId}
        attemptId={attemptId}
        cameraStream={cameraStream}
        initialScreenStream={screenStream}
        config={examConfig}
        mobileRelayOnly={mobileRelayOnly}
      />
    );
  }

  return null;
}
