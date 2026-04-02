import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { CameraCheck } from "@/components/exam/camera-check";
import { CameraFaceAuthCheck } from "@/components/exam/camera-face-auth-check";
import { CameraOrientationCheck } from "@/components/exam/camera-orientation-check";
import { EnvironmentCheck } from "@/components/exam/environment-check";
import { ProctoringConfigSummary } from "@/components/exam/proctoring-config-summary";
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
    proctorConfig: any,
    opts?: { mobileRelayOnly?: boolean },
  ) => void;
}

/**
 * Phases: 0 load → 1 cấu hình giám sát (đọc + xác nhận) → 2 camera → 3 face → 4 hướng → 5 môi trường + màn hình.
 */
export function ExamPrecheck({
  examId,
  attemptId,
  onComplete,
}: ExamPrecheckProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();
  const { t } = useTranslation();

  const [wizardPhase, setWizardPhase] = useState<number>(0);
  const [skipMediaPrecheck, setSkipMediaPrecheck] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mobileRelayOnly, setMobileRelayOnly] = useState(false);
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

        try {
          const pRes = await api.get(`/student/exams/${examId}/proctor/config`);
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

        const light =
          remoteConfig.level === "none" &&
          !remoteConfig.requireCamera &&
          !remoteConfig.detectBannedApps &&
          !remoteConfig.requireFaceAuth;

        setSkipMediaPrecheck(light);
        setWizardPhase(1);
      } catch (err) {
        console.error("Lỗi lấy cấu hình bài thi:", err);
        setConfigError("Không thể tải cấu hình bài thi. Vui lòng thử lại.");
      }
    })();
  }, [wizardPhase, examId, attemptId]);

  const handleConfigReviewContinue = useCallback(() => {
    if (!config) return;
    if (skipMediaPrecheck) {
      onComplete(null, null, config, proctorConfig, { mobileRelayOnly: false });
      return;
    }
    setWizardPhase(2);
  }, [config, proctorConfig, onComplete, skipMediaPrecheck]);

  const handleCameraConfirm = (stream: MediaStream) => {
    setMobileRelayOnly(false);
    setCameraStream(stream);

    if (config?.level === "none" && !config.detectBannedApps && !config.requireFaceAuth) {
      onComplete(stream, null, config as ExamTrackingConfig, proctorConfig, { mobileRelayOnly: false });
    } else {
      setWizardPhase(3);
    }
  };

  const handleMobileRelayReady = useCallback(
    (stream: MediaStream) => {
      setCameraStream(stream);
      setMobileRelayOnly(true);

      if (config?.level === "none" && !config.detectBannedApps && !config.requireFaceAuth) {
        onComplete(stream, null, config as ExamTrackingConfig, proctorConfig, { mobileRelayOnly: true });
      } else {
        setWizardPhase(3);
      }
    },
    [config, onComplete, proctorConfig],
  );

  const handleEnvironmentSuccess = useCallback(async () => {
    const screenStream = await startScreenCapture();
    if (!screenStream) return;
    onComplete(cameraStream, screenStream, config as ExamTrackingConfig, proctorConfig, {
      mobileRelayOnly,
    });
  }, [startScreenCapture, cameraStream, config, proctorConfig, onComplete, mobileRelayOnly]);

  if (configError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
        <ShieldAlert className="mb-4 h-16 w-16 text-destructive" />
        <h2 className="mb-2 text-xl font-bold text-destructive">{t("precheck.accessDenied")}</h2>
        <p className="max-w-md text-center text-muted-foreground">{configError}</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          {t("precheck.backDashboard")}
        </Button>
      </div>
    );
  }

  if (wizardPhase === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">{t("precheck.loadingConfig")}</p>
      </div>
    );
  }

  if (wizardPhase === 1 && config) {
    return (
      <ProctoringConfigSummary
        config={config}
        proctorConfig={proctorConfig}
        onContinue={handleConfigReviewContinue}
        continueLabel={skipMediaPrecheck ? t("precheck.startExam") : t("precheck.continueChecks")}
      />
    );
  }

  if (wizardPhase === 2) {
    return (
      <CameraCheck
        examId={examId}
        attemptId={attemptId}
        clientConfig={proctorConfig?.client_stream?.camera}
        onConfirm={handleCameraConfirm}
        onMobileRelayReady={handleMobileRelayReady}
        onSkip={() => navigate("/dashboard")}
      />
    );
  }

  if (wizardPhase === 3 && cameraStream) {
    return (
      <CameraFaceAuthCheck
        examId={examId as string}
        stream={cameraStream}
        onSuccess={() => setWizardPhase(4)}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

  if (wizardPhase === 4 && cameraStream) {
    return (
      <CameraOrientationCheck
        stream={cameraStream}
        onSuccess={() => setWizardPhase(5)}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

  if (wizardPhase === 5) {
    return (
      <EnvironmentCheck
        config={config}
        stream={cameraStream}
        onSuccess={handleEnvironmentSuccess}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

  return null;
}
