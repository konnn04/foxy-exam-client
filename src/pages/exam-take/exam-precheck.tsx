import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { CameraCheck } from "@/components/exam/camera-check";
import { CameraFaceAuthCheck } from "@/components/exam/camera-face-auth-check";
import { CameraOrientationCheck } from "@/components/exam/camera-orientation-check";
import { EnvironmentCheck } from "@/components/exam/environment-check";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import type { ExamTrackingConfig, ExamData } from "@/types/exam";
import { useToastCustom } from "@/hooks/use-toast-custom";

export interface ExamPrecheckProps {
  examId: string;
  attemptId: string;
  onComplete: (
    cameraStream: MediaStream | null,
    screenStream: MediaStream | null,
    config: ExamTrackingConfig,
    proctorConfig: any
  ) => void;
}

export function ExamPrecheck({
  examId,
  attemptId,
  onComplete,
}: ExamPrecheckProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();

  const [wizardPhase, setWizardPhase] = useState<number>(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [config, setConfig] = useState<ExamTrackingConfig | null>(null);
  const [proctorConfig, setProctorConfig] = useState<any>(null);
  const [configError, setConfigError] = useState("");

  const startScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Thiết bị không hỗ trợ chia sẻ màn hình.");
      return null;
    }

    try {
      const fps = proctorConfig?.client_stream?.screen?.fps || 5;
      const height = proctorConfig?.client_stream?.screen?.height || 1080;

      const displayOptions = {
        video: {
          displaySurface: "monitor" as const,
          frameRate: { ideal: fps, max: fps },
          height: { ideal: height, max: height },
        },
        audio: false,
        systemAudio: "exclude" as const,
        surfaceSwitching: "exclude" as const,
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
      const videoTrack = stream.getVideoTracks()[0];
      const settings = (videoTrack?.getSettings?.() ?? {}) as MediaTrackSettings & { displaySurface?: string };

      if (!DEVELOPMENT_MODE.ENABLED && settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        toast.error("Chỉ được phép chia sẻ toàn màn hình để bắt đầu thi.");
        return null;
      }

      if (videoTrack?.applyConstraints) {
        videoTrack.applyConstraints({ frameRate: fps }).catch(() => {});
      }

      return stream;
    } catch (e) {
      console.error("[ScreenRecorder] Failed to start screen capture", e);
      toast.error("Bạn cần cấp quyền chia sẻ màn hình để vào phòng thi.");
      return null;
    }
  }, [proctorConfig, toast]);

  useEffect(() => {
    if (wizardPhase !== 0) return;

    (async () => {
      try {
        const res = await api.get(`/student/exams/${examId}/take/${attemptId}?page=1`);
        const d: ExamData = res.data;

        let pConfig = null;
        try {
          const pRes = await api.get(`/student/exams/${examId}/proctor/config`);
          pConfig = pRes.data;
          setProctorConfig(pRes.data);
        } catch (e) {
          console.warn("Failed to fetch proctor config", e);
        }

        const remoteConfig = d.config || { level: "none", requireApp: false, requireCamera: false };
        setConfig(remoteConfig);

        const isElectron = window.electronAPI?.isElectron === true;

        if (remoteConfig.level === "strict" || remoteConfig.requireApp) {
          if (!isElectron) {
            setConfigError("Bài thi này yêu cầu sử dụng Ứng dụng Giám sát trên Máy tính (App). Bạn không thể thi trên Trình duyệt Web.");
            return;
          }

          if (window.electronAPI?.getSystemInfo) {
            const sysInfo = await window.electronAPI.getSystemInfo();
            const isWin10Plus = sysInfo.platform === "win32" && parseFloat(sysInfo.release) >= 10.0;
            const isMac = sysInfo.platform === "darwin";
            const isLinuxX11 = sysInfo.platform === "linux" && sysInfo.sessionType.toLowerCase() === "x11";

            if (!isWin10Plus && !isMac && !isLinuxX11) {
              setConfigError(`Hệ điều hành không được hỗ trợ (${sysInfo.platform} ${sysInfo.release} ${sysInfo.sessionType}). Yêu cầu Windows 10+, MacOS hoặc Linux X11.`);
              return;
            }
          }
        }

        if (remoteConfig.level === "none" && !remoteConfig.requireCamera && !remoteConfig.detectBannedApps && !remoteConfig.requireFaceAuth) {
           onComplete(null, null, remoteConfig, pConfig);
        } else {
          setWizardPhase(1);
        }
      } catch (err) {
        console.error("Lỗi lấy cấu hình bài thi:", err);
        setConfigError("Không thể tải cấu hình bài thi. Vui lòng thử lại.");
      }
    })();
  }, [wizardPhase, examId, attemptId, onComplete]);

  const handleCameraConfirm = (stream: MediaStream) => {
    setCameraStream(stream);

    if (config?.level === "none" && !config.detectBannedApps && !config.requireFaceAuth) {
      onComplete(stream, null, config as ExamTrackingConfig, proctorConfig);
    } else {
      setWizardPhase(2);
    }
  };

  const handleEnvironmentSuccess = useCallback(async () => {
    const screenStream = await startScreenCapture();
    if (!screenStream) return;
    onComplete(cameraStream, screenStream, config as ExamTrackingConfig, proctorConfig);
  }, [startScreenCapture, cameraStream, config, proctorConfig, onComplete]);

  if (configError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-destructive mb-2">Không đủ điều kiện truy cập</h2>
        <p className="text-muted-foreground text-center max-w-md">{configError}</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          Quay lại Bảng điều khiển
        </Button>
      </div>
    );
  }

  if (wizardPhase === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
        <p className="text-muted-foreground">Đang lấy cấu hình bài thi...</p>
      </div>
    );
  }

  if (wizardPhase === 1) {
    return <CameraCheck clientConfig={proctorConfig?.client_stream?.camera} onConfirm={handleCameraConfirm} onSkip={() => navigate("/dashboard")} />;
  }
  
  if (wizardPhase === 2 && cameraStream) {
    return <CameraFaceAuthCheck examId={examId as string} stream={cameraStream} onSuccess={() => setWizardPhase(3)} onCancel={() => navigate("/dashboard")} />;
  }

  if (wizardPhase === 3 && cameraStream) {
    return <CameraOrientationCheck stream={cameraStream} onSuccess={() => setWizardPhase(4)} onCancel={() => navigate("/dashboard")} />;
  }

  if (wizardPhase === 4) {
    return <EnvironmentCheck config={config} stream={cameraStream} onSuccess={handleEnvironmentSuccess} onCancel={() => navigate("/dashboard")} />;
  }

  return null;
}
