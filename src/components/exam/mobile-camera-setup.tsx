import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CameraMobileLivenessCheck } from "@/components/exam/camera-mobile-liveness-check";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { useToastCustom } from "@/hooks/use-toast-custom";
import {
  QrCode, Smartphone, CheckCircle, Loader2, AlertTriangle,
  RefreshCw, ChevronRight, ChevronLeft, Wifi, Camera,
  Monitor, Eye,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type Phase = "angle_guide" | "generate_qr" | "wait_phone" | "liveness" | "done" | "failed";

interface MobileCameraSetupProps {
  examId: string;
  attemptId: string;
  laptopStream?: MediaStream | null;
  onSuccess: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

export function MobileCameraSetup({
  examId, attemptId, laptopStream, onSuccess, onBack, onSkip,
}: MobileCameraSetupProps) {
  const toast = useToastCustom();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("angle_guide");
  const [qrUrl, setQrUrl] = useState("");
  const [mobileStream, setMobileStream] = useState<MediaStream | null>(null);
  const laptopVideoRef = useRef<HTMLVideoElement>(null);

  // Attach laptop camera preview
  useEffect(() => {
    if (laptopVideoRef.current && laptopStream) {
      laptopVideoRef.current.srcObject = laptopStream;
      laptopVideoRef.current.play().catch(() => {});
    }
  }, [laptopStream, phase]);

  // ── Generate QR token ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "generate_qr") return;
    let cancelled = false;
    (async () => {
      try {
        const lkOk = await livekitPublisher.ensureConnected(
          {
            examId: Number(examId),
            attemptId: Number(attemptId),
            onError: (msg) => console.warn("[MobileCameraSetup] LiveKit connect error:", msg),
          },
          { requireSupervisorAgent: false },
        );
        if (!lkOk) {
          toast.error(t("precheck.liveKitConnectError"));
          setPhase("failed");
          return;
        }

        const res = await api.post(
          API_ENDPOINTS.MOBILE_CAMERA_TOKEN(examId, attemptId)
        );
        if (cancelled) return;
        setQrUrl(res.data.url);
        setPhase("wait_phone");
      } catch (e) {
        if (!cancelled) {
          toast.error(t("precheck.qrGenerateError"));
          setPhase("failed");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [phase, examId, attemptId, t, toast]);

  // ── Poll phone relay status ───────────────────────────────────────
  useEffect(() => {
    if (phase !== "wait_phone") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await api.get(
          API_ENDPOINTS.MOBILE_CAMERA_RELAY_STATUS(examId, attemptId),
        );
        if (cancelled) return;

        console.log("[MobileCameraSetup] poll #" + attempts + " relay_ack:", res.data?.relay_ack);

        if (res.data?.relay_ack) {
          // Log LiveKit room state for diagnosis
          const lkRoom = (livekitPublisher as any).room;
          console.log("[MobileCameraSetup] relay_ack confirmed! LiveKit room state:", {
            roomState: lkRoom?.state,
            roomName: lkRoom?.name,
            localIdentity: lkRoom?.localParticipant?.identity,
            remoteParticipants: Array.from(lkRoom?.remoteParticipants?.values?.() ?? []).map(
              (p: any) => ({
                identity: p.identity,
                tracks: Array.from(p.trackPublications?.values?.() ?? []).map((t: any) => ({
                  sid: t.trackSid,
                  source: t.source,
                  kind: t.kind,
                  subscribed: t.isSubscribed,
                  hasTrack: !!t.track,
                })),
              })
            ),
          });
          console.log("[MobileCameraSetup] Waiting for mobile media stream (60s)…");
          try {
            const ms = await livekitPublisher.waitForMobileRelayCameraMediaStream(60_000);
            if (cancelled) return;
            if (ms) {
              console.log("[MobileCameraSetup] ✅ Got mobile stream!");
              setMobileStream(ms);
              setPhase("liveness");
            } else {
              console.warn("[MobileCameraSetup] waitForMobileRelay returned null (timeout)");
              setPhase("failed");
              toast.error(t("precheck.phoneStreamEmptyError"));
            }
          } catch (e) {
            console.error("[MobileCameraSetup] Error waiting for media stream:", e);
            if (!cancelled) {
              setPhase("failed");
              toast.error(t("precheck.phoneStreamReceiveError"));
            }
          }
          return; 
        }

        if (attempts >= maxAttempts) {
          setPhase("failed");
          toast.error(t("precheck.phoneTimeoutError"));
          return;
        }
        if (!cancelled) timeoutId = setTimeout(poll, 2000);
      } catch {
        if (attempts >= maxAttempts) {
          setPhase("failed");
          return;
        }
        if (!cancelled) timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [phase, examId, attemptId, t, toast]);

  // ── Liveness complete ─────────────────────────────────────────────
  const handleLivenessSuccess = () => {
    setPhase("done");
    setTimeout(onSuccess, 800);
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ── Angle Guide Phase ── */}
      {phase === "angle_guide" && (
        <>
          {/* Laptop camera preview (if available) */}
          {laptopStream && (
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
              <video ref={laptopVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
                <Camera className="w-3 h-3 mr-1" /> {t("precheck.laptopCamera")}
              </Badge>
            </div>
          )}

          <Card className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="flex justify-center gap-2">
                <Smartphone className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-lg font-bold">{t("mobileCameraSetup.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("mobileCameraSetup.guide")}
              </p>
            </div>

            {/* Layout guide illustration */}
            <div className="bg-accent/30 rounded-xl p-4 space-y-3">
              {/* Visual layout diagram */}
              <div className="flex items-center justify-center gap-4 py-3 px-6 bg-background rounded-lg border">
                <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  <Monitor className="h-8 w-8 text-primary" />
                  <span className="font-medium">Laptop</span>
                </div>
                <div className="flex-1 border-t-2 border-dashed border-primary/40 relative">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] bg-background px-1 text-primary font-bold">
                    {t("mobileCameraSetup.sameFrame")}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-8 w-8 text-primary" />
                  <span className="font-medium">{t("mobileCameraSetup.person")}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-full p-2 shrink-0 mt-0.5">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("mobileCameraSetup.angleGuideTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("mobileCameraSetup.angleGuideDesc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-full p-2 shrink-0 mt-0.5">
                  <Monitor className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("mobileCameraSetup.viewGuideTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("mobileCameraSetup.viewGuideDesc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-full p-2 shrink-0 mt-0.5">
                  <Wifi className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("mobileCameraSetup.wifiGuideTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("mobileCameraSetup.wifiGuideDesc")}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={onBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />{t("common.back")}
              </Button>
              <Button onClick={() => setPhase("generate_qr")}>
                {t("mobileCameraSetup.readyGetQr")}<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* ── QR Code Phase ── */}
      {phase === "generate_qr" && (
        <>
          {laptopStream && (
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
              <video ref={laptopVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
                <Camera className="w-3 h-3 mr-1" /> {t("precheck.laptopCamera")}
              </Badge>
            </div>
          )}
          <Card className="p-6 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="font-medium">{t("mobileCameraSetup.generatingQr")}</p>
          </Card>
        </>
      )}

      {/* ── Wait Phone Phase ── */}
      {phase === "wait_phone" && (
        <>
          {/* Split view: laptop cam + QR code side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Laptop camera preview */}
            {laptopStream && (
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
                <video ref={laptopVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
                  <Camera className="w-3 h-3 mr-1" /> {t("precheck.laptopCamera")}
                </Badge>
              </div>
            )}

            {/* QR Code card */}
            <Card className="p-4 flex flex-col items-center justify-center space-y-3">
              <QrCode className="h-8 w-8 text-primary" />
              <h3 className="text-base font-bold">{t("mobileCameraSetup.scanQrTitle")}</h3>
              <p className="text-xs text-muted-foreground text-center">
                {t("mobileCameraSetup.scanQrSubtitle")}
              </p>

              {qrUrl ? (
                <div className="bg-white p-3 rounded-xl border-2 border-primary/30 shadow-lg">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                    alt="QR Code"
                    className="w-40 h-40"
                  />
                </div>
              ) : (
                <div className="w-40 h-40 bg-muted rounded-xl flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                <span>{t("precheck.waitingPhone")}</span>
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>

              <Progress value={undefined} className="h-1 w-full" />
            </Card>
          </div>
        </>
      )}

      {/* ── Liveness Phase ── */}
      {phase === "liveness" && mobileStream && (
        <CameraMobileLivenessCheck
          stream={mobileStream}
          laptopStream={laptopStream ?? undefined}
          onSuccess={handleLivenessSuccess}
          onCancel={onBack}
        />
      )}

      {/* ── Done Phase ── */}
      {phase === "done" && (
        <Card className="p-6 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold text-emerald-600">{t("mobileCameraSetup.phoneReadyTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("mobileCameraSetup.movingToNextStep")}</p>
        </Card>
      )}

      {/* ── Failed Phase ── */}
      {phase === "failed" && (
        <Card className="p-6 space-y-4 text-center border-destructive/50">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h3 className="text-lg font-bold text-destructive">{t("mobileCameraSetup.connectFailedTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("mobileCameraSetup.connectFailedDesc")}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />{t("common.back")}
            </Button>
            <Button onClick={() => { setPhase("generate_qr"); }}>
              <RefreshCw className="h-4 w-4 mr-1" />{t("mobileCameraSetup.retry")}
            </Button>
            {onSkip && (
              <Button variant="outline" onClick={onSkip}>
                {t("mobileCameraSetup.skip")}<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
