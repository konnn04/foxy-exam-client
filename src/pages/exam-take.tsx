import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useExamSocketStore } from "@/hooks/use-exam-socket";
import type { ExamTrackingConfig } from "@/types/exam";
import { collectDeviceInfo, generateFingerprint } from "@/lib/device-fingerprint";
import { ExamPrecheck } from "./exam-take/exam-precheck";
import { ExamSession } from "./exam-take/exam-session";
import { useElectronIpcExamSession } from "@/hooks/use-electron-ipc-exam-session";
import { useElectronExamStrictWindow } from "@/hooks/use-electron-exam-strict-window";
import { livekitPublisher } from "@/lib/livekit-publisher";

function examUsesCameraForPrecheck(c: ExamTrackingConfig): boolean {
  return (
    c.level === "strict" ||
    Boolean(c.requireCamera) ||
    Boolean(c.requireFaceAuth) ||
    Boolean(c.monitorGaze) ||
    c.detectBannedObjects === true ||
    c.requireDualCamera === true
  );
}

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

  /** Electron: IPC gates for privileged handlers; must register before strict window (cleanup order). */
  useElectronIpcExamSession();
  /** Electron: strict window only on this route (precheck + exam); cleanup restores normal maximized window. */
  useElectronExamStrictWindow();

  const handlePrecheckComplete = useCallback(
    async (
      camStream: MediaStream | null,
      scrStream: MediaStream | null,
      config: ExamTrackingConfig,
      _proctorConfig: any,
      opts?: { mobileRelayOnly?: boolean; skipBegin?: boolean },
    ) => {
      setCameraStream(camStream);
      setScreenStream(scrStream);
      setExamConfig(config);
      setMobileRelayOnly(opts?.mobileRelayOnly ?? false);

      try {
        if (examId && attemptId && !opts?.skipBegin) {
          const streamSignals = {
            has_desktop_video:
              !examUsesCameraForPrecheck(config) ||
              livekitPublisher.hasAliveLocalCameraVideo(camStream),
            has_screen_share:
              !(config.level === "strict" || config.requireScreenShare === true) ||
              Boolean(
                scrStream?.getVideoTracks?.().some((t) => t.readyState === "live"),
              ),
            has_mobile_video:
              config.requireDualCamera !== true ||
              livekitPublisher.hasActiveMobileRelayVideo(),
          };

          let beginBody: Record<string, unknown> = { ...streamSignals };

          if (config.lockDevice && config.device_lock_secret) {
            const deviceInfo = await collectDeviceInfo();
            const fp = await generateFingerprint(deviceInfo, config.device_lock_secret);
            beginBody = {
              ...beginBody,
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
            API_ENDPOINTS.EXAM_TAKE_BEGIN(examId, attemptId),
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
        if (e?.response?.data?.error === "face_identity_required") {
          toast.error(
            e?.response?.data?.message
            || "Vui lòng hoàn tất xác thực khuôn mặt (3 góc) trước khi bắt đầu làm bài.",
          );
          return;
        }
        const err = e?.response?.data?.error as string | undefined;
        const msg = e?.response?.data?.message as string | undefined;
        if (err === "precheck_signals_required" || err === "desktop_camera_not_ready" || err === "screen_share_not_ready" || err === "mobile_camera_not_ready" || err === "mobile_relay_not_ack") {
          toast.error(msg || "Chưa đủ điều kiện camera / màn hình. Vui lòng hoàn tất bước kiểm tra rồi thử lại.");
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
