import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CameraFaceAuthCheck } from "@/components/exam/camera-face-auth-check";
import { MobileCameraSetup } from "@/components/exam/mobile-camera-setup";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import type { ExamTrackingConfig, ExamData, WizardStep } from "@/types/exam";
import { PRECHECK_STEPS } from "@/constants/exam";

import { useToastCustom } from "@/hooks/use-toast-custom";
import { livekitPublisher } from "@/lib/livekit-publisher";
import {
  Shield, Check, ChevronRight, Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// ── Types ──────────────────────────────────────────────────────────────────

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

function usesCamera(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireCamera || c.requireFaceAuth || c.monitorGaze || c.detectBannedObjects;
}
function usesScreen(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireScreenShare || c.detectBannedApps;
}
function needsLiveKit(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireCamera || c.requireMic || c.requireScreenShare
    || c.requireDualCamera || c.monitorGaze || c.detectBannedObjects || c.detectBannedApps;
}
function StepIndicator({ current, done }: { current: WizardStep; done: Set<WizardStep> }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      {PRECHECK_STEPS.map((s, i) => {
        const isDone = done.has(s.key);
        const isCurrent = s.key === current;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
              ${isCurrent ? "bg-primary text-primary-foreground shadow" : ""}
              ${isDone && !isCurrent ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : ""}
              ${!isDone && !isCurrent ? "bg-muted text-muted-foreground" : ""}
            `}>
              {isDone ? <Check className="h-3 w-3" /> : <span className="text-[10px] w-3 text-center">{i + 1}</span>}
              <span className="hidden sm:inline">{t(s.label)}</span>
            </div>
            {i < PRECHECK_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Step: Loading ───────────────────────────────────────────────────────────

function LoadingStep() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{t("precheck.loadingConfigDesc")}</p>
    </div>
  );
}

import { InfoStep } from "./precheck-steps/info-step";
import { CameraMicStep } from "./precheck-steps/camera-mic-step";
import { MediaPipeStep } from "./precheck-steps/mediapipe-step";
import { LivenessStep } from "./precheck-steps/liveness-step";
import { EnvironmentStep } from "./precheck-steps/environment-step";

// ── Main Wizard ─────────────────────────────────────────────────────────────

export function ExamPrecheck({ examId, attemptId, onComplete }: ExamPrecheckProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();
  const [step, setStep] = useState<WizardStep>("loading");
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [config, setConfig] = useState<ExamTrackingConfig | null>(null);
  const [proctorConfig, setProctorConfig] = useState<any>(null);
  const [configError, setConfigError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [phoneAsPrimary, setPhoneAsPrimary] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<WizardStep>>(new Set(["loading"]));
  const [isJoiningSupervisor, setIsJoiningSupervisor] = useState(false);
  const { t } = useTranslation();

  // ── Load config (early check) ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [examRes, proctorRes] = await Promise.allSettled([
          api.get(`${API_ENDPOINTS.EXAM_TAKE(examId, attemptId)}?page=1`),
          api.get(API_ENDPOINTS.EXAM_PROCTOR_CONFIG(examId)),
        ]);

        const d: ExamData = examRes.status === "fulfilled" ? examRes.value.data : null;
        if (!d) { setConfigError(t("precheck.loadDataError")); return; }
        setExamData(d);

        if (proctorRes.status === "fulfilled") setProctorConfig(proctorRes.value.data);

        const cfg = d.config || { level: "none" };
        setConfig(cfg);

        // ── Early checks ───────────────────────────────────────────
        const isElectron = window.electronAPI?.isElectron === true;

        if ((cfg.level === "strict" || cfg.requireApp) && !isElectron) {
          setConfigError(t("precheck.appRequiredError"));
          return;
        }

        if ((cfg.level === "strict" || cfg.requireApp) && isElectron && window.electronAPI?.getSystemInfo) {
          const sys = await window.electronAPI.getSystemInfo();
          const ok = (sys.platform === "win32" && parseFloat(sys.release) >= 10)
            || sys.platform === "darwin"
            || (sys.platform === "linux" && sys.sessionType?.toLowerCase() === "x11");
          if (!ok) {
            setConfigError(t("precheck.osNotSupportedError", { platform: sys.platform }));
            return;
          }
        }

        // Skip camera steps if not needed
        if (!usesCamera(cfg) && !usesScreen(cfg)) {
          completeAfterSupervisorReady(null, null, cfg);
          return;
        }

        setStep("info");
      } catch {
        setConfigError(t("precheck.configLoadError"));
      }
    })();
  }, [examId, attemptId, t]);

  // ── Supervisor connection ──────────────────────────────────────────
  const completeAfterSupervisorReady = useCallback(async (
    camStream: MediaStream | null,
    screenStream: MediaStream | null,
    cfg: ExamTrackingConfig,
  ) => {
    const phoneOnly = phoneAsPrimary && !cfg.requireDualCamera;
    if (!needsLiveKit(cfg)) {
      onComplete(camStream, screenStream, cfg, proctorConfig, { mobileRelayOnly: phoneOnly });
      return;
    }
    setIsJoiningSupervisor(true);
    try {
      const ok = await livekitPublisher.ensureConnected({
        examId: Number(examId),
        attemptId: Number(attemptId),
        onError: (msg) => toast.error(msg),
      });
      if (!ok) {
        toast.error(t("precheck.aiConnectError"));
        return;
      }
      onComplete(camStream, screenStream, cfg, proctorConfig, { mobileRelayOnly: phoneOnly });
    } finally {
      setIsJoiningSupervisor(false);
    }
  }, [examId, attemptId, onComplete, proctorConfig, toast, phoneAsPrimary]);

  // ── Screen capture ─────────────────────────────────────────────────
  const startScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getDisplayMedia) return null;
    try {
      const fps = proctorConfig?.client_stream?.screen?.fps || 5;
      const height = proctorConfig?.client_stream?.screen?.height || 1080;

      if (window.electronAPI?.getScreenSourceId) {
        const displayInfo = await window.electronAPI.getDisplayId?.();
        for (let i = 0; i < 3; i++) {
          const sourceId = await window.electronAPI.getScreenSourceId(displayInfo?.id);
          if (sourceId) {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxFrameRate: fps } } as any,
              });
            } catch { /* fall through */ }
          }
          await new Promise((r) => setTimeout(r, 180));
        }
      }

      return await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: { ideal: fps }, height: { ideal: height } },
        audio: false,
      } as any);
    } catch {
      toast.error(t("precheck.screenSharePermissionError"));
      return null;
    }
  }, [proctorConfig, toast]);

  // ── Step navigation ────────────────────────────────────────────────
  const markDone = (s: WizardStep) => setDoneSteps((prev) => new Set([...prev, s]));

  const skipIfNotNeeded = (targetStep: WizardStep, cfg: ExamTrackingConfig) => {
    if (targetStep === "camera" && !usesCamera(cfg)) return "info";
    if (targetStep === "mediapipe" && !usesCamera(cfg)) return "camera";
    if (targetStep === "faceauth" && !cfg.requireFaceAuth) return "mediapipe";
    if (targetStep === "dual_camera" && !cfg.requireDualCamera) return "environment";
    return targetStep;
  };

  // ── Visible steps (must be before any conditional returns) ──────
  const visibleSteps = useMemo(() => {
    if (!config) return PRECHECK_STEPS;
    return PRECHECK_STEPS.filter((s) => {
      if (s.key === "camera" || s.key === "mediapipe") return usesCamera(config);
      if (s.key === "faceauth") return config.requireFaceAuth;
      if (s.key === "dual_camera") return config.requireDualCamera;
      return true;
    });
  }, [config]);

  // ── Render ──────────────────────────────────────────────────────────
  if (configError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
        <Shield className="mb-4 h-16 w-16 text-destructive" />
        <h2 className="mb-2 text-xl font-bold text-destructive">{t("precheck.notEligible")}</h2>
        <p className="max-w-md text-center text-muted-foreground">{configError}</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          {t("precheck.backToHome")}
        </Button>
      </div>
    );
  }

  if (isJoiningSupervisor) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("precheck.connectingSupervisor")}</p>
      </div>
    );
  }

  if (step === "loading") return <div className="flex h-screen items-center justify-center"><LoadingStep /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold">{examData?.exam?.name ?? examData?.exam?.title ?? t("precheck.examTitleDefault")}</h1>
            <p className="text-[11px] text-muted-foreground">{t("precheck.environmentCheckDesc")}</p>
          </div>
          <StepIndicator current={step} done={doneSteps} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-2xl">
          {step === "info" && config && examData && (
            <InfoStep
              examData={examData}
              config={config}
              proctorConfig={proctorConfig}
              onContinue={() => {
                markDone("info");
                setStep(skipIfNotNeeded("camera", config));
              }}
              onBack={() => navigate("/dashboard")}
            />
          )}

          {step === "camera" && config && (
            <CameraMicStep
              config={config}
              examId={examId}
              attemptId={attemptId}
              onModeChange={setPhoneAsPrimary}
              onConfirm={(stream) => {
                setCameraStream(stream);
                markDone("camera");
                setStep(skipIfNotNeeded("mediapipe", config));
              }}
              onBack={() => setStep("info")}
            />
          )}

          {step === "mediapipe" && cameraStream && (
            <MediaPipeStep
              stream={cameraStream}
              onDone={() => {
                markDone("mediapipe");
                setStep(skipIfNotNeeded("faceauth", config!));
              }}
              onBack={() => setStep("camera")}
            />
          )}

          {step === "faceauth" && cameraStream && (
            <CameraFaceAuthCheck
              examId={examId}
              stream={cameraStream}
              onSuccess={() => {
                markDone("faceauth");
                setStep("liveness");
              }}
              onCancel={() => navigate("/dashboard")}
            />
          )}

          {step === "liveness" && cameraStream && (
            <LivenessStep
              stream={cameraStream}
              onDone={() => {
                markDone("liveness");
                setStep(skipIfNotNeeded("dual_camera", config!));
              }}
              onBack={() => setStep(skipIfNotNeeded("faceauth", config!))}
            />
          )}

          {step === "dual_camera" && config && examId && attemptId && (
            <MobileCameraSetup
              examId={examId}
              attemptId={attemptId}
              laptopStream={cameraStream}
              onSuccess={() => {
                markDone("dual_camera");
                setStep("environment");
              }}
              onBack={() => setStep("liveness")}
              onSkip={() => {
                markDone("dual_camera");
                setStep("environment");
              }}
            />
          )}

          {step === "environment" && config && (
            <EnvironmentStep
              config={config}
              stream={cameraStream}
              onSuccess={async () => {
                markDone("environment");
                const needsScreen = usesScreen(config);
                if (needsScreen) {
                  const screenStream = await startScreenCapture();
                  if (!screenStream) return;
                  await completeAfterSupervisorReady(cameraStream, screenStream, config);
                } else {
                  await completeAfterSupervisorReady(cameraStream, null, config);
                }
              }}
              onBack={() => setStep("liveness")}
            />
          )}
        </div>
      </main>

      {/* ── DEV MODE: jump steps (hidden in production) ─────────── */}
      {DEVELOPMENT_MODE.ENABLED && (
        <div className="fixed bottom-3 right-3 z-50 bg-background border rounded-lg p-2 shadow-lg">
          <p className="text-[9px] text-muted-foreground mb-1.5 uppercase tracking-wider text-center font-bold bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 rounded px-1.5 py-0.5">
            ⚠ DEV MODE
          </p>
          <div className="flex gap-1">
            {visibleSteps.map((s) => (
              <Badge
                key={s.key}
                variant={step === s.key ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setStep(s.key as WizardStep)}
              >
                {t(s.label)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
