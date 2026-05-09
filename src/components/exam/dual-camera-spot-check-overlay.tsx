import { useEffect, useRef, useState, useCallback } from "react";
import { Smartphone, Timer, CheckCircle, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";

interface SpotCheckOverlayProps {
  examId: string;
  attemptId: string;
  enabled: boolean;
  minIntervalSec?: number;
  maxIntervalSec?: number;
  timeoutSec?: number;
}

type Phase = "idle" | "active" | "success" | "failed";

export function DualCameraSpotCheckOverlay({
  enabled,
  timeoutSec = 10,
}: SpotCheckOverlayProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(timeoutSec);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    if (!enabled) return;

    const handleStart = () => {
      setPhase("active");
      phaseRef.current = "active";
      setCountdown(timeoutSec);
    };

    const handleDoneEvent = () => {
      if (phaseRef.current === "active") {
        setPhase("success");
        phaseRef.current = "success";
        setTimeout(() => {
          setPhase("idle");
          phaseRef.current = "idle";
        }, 3000);
      }
    };

    window.addEventListener("exam:mobile_face_check", handleStart);
    window.addEventListener("exam:mobile_face_check_done", handleDoneEvent);

    return () => {
      window.removeEventListener("exam:mobile_face_check", handleStart);
      window.removeEventListener("exam:mobile_face_check_done", handleDoneEvent);
    };
  }, [enabled, timeoutSec]);

  useEffect(() => {
    if (phase !== "active") return;

    const intervalId = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [phase]);

  const handleTimeout = useCallback(async () => {
    setPhase("failed");
    phaseRef.current = "failed";

    setTimeout(() => {
      setPhase("idle");
      phaseRef.current = "idle";
    }, 3000);
  }, []);

  const handleDone = useCallback(async () => {
    setPhase("success");
    phaseRef.current = "success";

    setTimeout(() => {
      setPhase("idle");
      phaseRef.current = "idle";
    }, 2000);
  }, []);

  if (phase === "idle" || !enabled) return null;

  const progressPct = phase === "active" ? ((timeoutSec - countdown) / timeoutSec) * 100 : 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card rounded-2xl shadow-2xl border-2 border-primary/30 p-6 w-full max-w-md mx-4 space-y-4">
        {phase === "active" && (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-full p-3 animate-pulse">
                <Smartphone className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">{t("spotCheck.title")}</h3>
                <p className="text-sm text-muted-foreground">{t("spotCheck.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-3xl font-mono font-bold text-primary">
              <Timer className="h-6 w-6" />
              <span>{countdown}s</span>
            </div>

            <Progress value={progressPct} className="h-2 [&>div]:bg-primary [&>div]:transition-all" />

            <p className="text-xs text-muted-foreground text-center">
              {t("spotCheck.instructions")}
            </p>

            <button
              onClick={handleDone}
              className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-medium hover:bg-primary/90 transition-colors"
            >
              {t("spotCheck.done")}
            </button>
          </>
        )}

        {phase === "success" && (
          <div className="text-center space-y-3 py-4">
            <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-bold text-emerald-600">{t("spotCheck.success")}</h3>
          </div>
        )}

        {phase === "failed" && (
          <div className="text-center space-y-3 py-4">
            <AlertTriangle className="h-14 w-14 text-destructive mx-auto" />
            <h3 className="text-lg font-bold text-destructive">{t("spotCheck.failed")}</h3>
            <p className="text-sm text-muted-foreground">{t("spotCheck.failedDesc")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
