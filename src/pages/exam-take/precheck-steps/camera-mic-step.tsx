import { useState, useCallback, useEffect, useRef } from "react";
// ── Step: Camera & Mic ─────────────────────────────────────────────────────
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMERA_CAPTURE_MAX_FPS } from "@/config/detection.config";
import type { ExamTrackingConfig } from "@/types/exam";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { livekitPublisher } from "@/lib/livekit-publisher";
import { Camera, Mic, Video, Smartphone, QrCode, Check, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CameraMicStep({
  config, examId, attemptId, onConfirm, onBack, onModeChange,
}: {
  config: ExamTrackingConfig;
  examId: string;
  attemptId: string;
  onConfirm: (stream: MediaStream) => void;
  onBack: () => void;
  onModeChange?: (isPhone: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [resolution, setResolution] = useState("");
  const [fps, setFps] = useState(0);
  const [cameraMode, setCameraMode] = useState<"laptop" | "phone">("laptop");
  const [qrUrl, setQrUrl] = useState("");

  const rafRef = useRef<number>(0);
  const needsMic = config.requireMic || config.level === "strict";
  const toast = useToastCustom();
  const { t } = useTranslation();
  const [phoneWaiting, setPhoneWaiting] = useState(false);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const enumerate = useCallback(async () => {
    setError(null);
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((d) => d.kind === "videoinput");
      const audios = all.filter((d) => d.kind === "audioinput");
      setVideoDevices(vids);
      setAudioDevices(audios);
      setSelectedVideoId((prev) => prev || (vids[0]?.deviceId ?? ""));
      setSelectedAudioId((prev) => prev || (audios[0]?.deviceId ?? ""));
    } catch {
      setError(t("precheck.deviceAccessError"));
    }
  }, [t]);

  // Auto-enumerate devices on mount
  useEffect(() => {
    enumerate();
  }, [enumerate]);

  useEffect(() => {
    onModeChange?.(cameraMode === "phone");
  }, [cameraMode, onModeChange]);

  useEffect(() => {
    if (config.requireDualCamera && cameraMode !== "laptop") {
      setCameraMode("laptop");
    }
  }, [config.requireDualCamera, cameraMode]);

  // ── Stop laptop stream when switching to phone mode ──
  useEffect(() => {
    if (cameraMode === "phone" && stream) {
      // When switching to phone mode, stop the laptop camera stream
      // so it doesn't stay active in the background.
      // Only stop if this is a local (laptop) camera stream, not a phone relay stream.
      const tracks = stream.getVideoTracks();
      const isLocalCamera = tracks.some((t) => t.readyState === "live" && t.label !== "");
      if (isLocalCamera && !stream.id.startsWith("mobile")) {
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);
        setResolution("");
        setFps(0);
      }
    }
  }, [cameraMode]);

  // ── Phone camera: issue QR token & connect LiveKit early ──
  const startPhoneCamera = useCallback(async () => {
    setIsGeneratingQr(true);
    try {
      // 1. Connect to LiveKit room early (skip supervisor-agent wait) so
      //    the phone participant's track can be received via
      //    waitForMobileRelayCameraMediaStream().
      const lkOk = await livekitPublisher.ensureConnected(
        {
          examId: Number(examId),
          attemptId: Number(attemptId),
          onError: (msg) => console.warn("[CameraMicStep] LiveKit early connect error:", msg),
        },
        { requireSupervisorAgent: false },
      );
      if (!lkOk) {
        toast.error(t("precheck.liveKitConnectError"));
        return;
      }
      console.log("[CameraMicStep] LiveKit connected early for phone relay");

      // 2. Request the QR token from the server.
      const res = await api.post(API_ENDPOINTS.MOBILE_CAMERA_TOKEN(examId, attemptId));
      setQrUrl(res.data.url);

      setPhoneWaiting(true);
    } catch {
      toast.error(t("precheck.qrGenerateError"));
    } finally {
      setIsGeneratingQr(false);
    }
  }, [toast, examId, attemptId, t]);

  // ── Phone camera: poll relay status ──
  useEffect(() => {
    if (!phoneWaiting) return;

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await api.get(
          API_ENDPOINTS.MOBILE_CAMERA_RELAY_STATUS(examId, attemptId),
        );
        if (cancelled) return;

        console.log("[CameraMicStep] poll #" + attempts + " relay_ack:", res.data?.relay_ack);

        if (res.data?.relay_ack) {
          // Log LiveKit state for diagnosis
          const lkRoom = (livekitPublisher as any).room;
          console.log("[CameraMicStep] relay_ack confirmed! LiveKit:", {
            roomState: lkRoom?.state,
            roomName: lkRoom?.name,
            localIdentity: lkRoom?.localParticipant?.identity,
            remoteCount: lkRoom?.remoteParticipants?.size,
          });

          try {
            const ms = await livekitPublisher.waitForMobileRelayCameraMediaStream(60_000);
            if (cancelled) return;
            if (ms) {
              console.log("[CameraMicStep] ✅ Got mobile stream!");
              setPhoneWaiting(false);
              setStream((prev) => {
                if (prev) prev.getTracks().forEach((t) => t.stop());
                return ms;
              });
              setResolution("Mobile");
              setFps(15);
              return; // success
            } else {
              console.warn("[CameraMicStep] waitForMobileRelay returned null (timeout)");
              setPhoneWaiting(false);
              toast.error(t("precheck.phoneStreamEmptyError"));
            }
          } catch (err) {
            console.warn("[CameraMicStep] waitForMobileRelay error:", err);
            setPhoneWaiting(false);
            toast.error(t("precheck.phoneStreamReceiveError"));
          }
          return; // stop polling
        }

        // relay_ack not yet → schedule next poll
        if (attempts >= 120) {
          setPhoneWaiting(false);
          toast.error(t("precheck.phoneTimeoutError"));
          return;
        }
        if (!cancelled) timeoutId = setTimeout(poll, 2000);
      } catch {
        if (attempts >= 120) {
          setPhoneWaiting(false);
          toast.error(t("precheck.phoneTimeoutError"));
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
  }, [phoneWaiting, examId, attemptId, toast, t]);

  // Start selected laptop camera (only when in laptop mode)
  useEffect(() => {
    if (cameraMode !== "laptop" || !selectedVideoId) return;
    // Don't reopen laptop camera if we already have a stream from phone mode
    // that hasn't been cleaned up yet

    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedVideoId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: CAMERA_CAPTURE_MAX_FPS, max: CAMERA_CAPTURE_MAX_FPS },
          },
          audio: needsMic && selectedAudioId ? { deviceId: { exact: selectedAudioId } } : false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);

        const vt = s.getVideoTracks()[0];
        const settings = vt?.getSettings?.();
        if (settings) {
          setResolution(`${settings.width}x${settings.height}`);
          setFps(Math.round(settings.frameRate ?? 0));
        }
      } catch {
        if (!cancelled) setError(t("precheck.cameraOpenError"));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedVideoId, selectedAudioId, needsMic, cameraMode, t]);

  // Video preview
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Volume meter
  useEffect(() => {
    if (!stream || !needsMic || cameraMode === "phone") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(buf);
        setVolume(buf.reduce((a, b) => a + b, 0) / buf.length / 2.5);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      return () => { cancelAnimationFrame(rafRef.current); ctx.close().catch(() => {}); };
    } catch { /* ignore */ }
  }, [stream, needsMic, cameraMode]);

  const canProceed = !!stream;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Camera preview */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertTriangle className="h-10 w-10" />
            <p className="text-sm px-4 text-center">{error}</p>
          </div>
        ) : stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : phoneWaiting ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm">{t("precheck.waitingPhone")}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Video className="h-10 w-10 opacity-40" />
            <p className="text-sm">{t("precheck.selectCameraToStart")}</p>
          </div>
        )}
        {resolution && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] bg-black/60 text-white border-0">
            {resolution} · {fps}fps
          </Badge>
        )}
      </div>

      {!config.requireDualCamera && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={cameraMode === "laptop" ? "default" : "outline"}
            size="sm"
            onClick={() => setCameraMode("laptop")}
          >
            <Camera className="h-3.5 w-3.5 mr-1" />{t("precheck.laptopCamera")}
          </Button>
          <Button
            variant={cameraMode === "phone" ? "default" : "outline"}
            size="sm"
            onClick={() => setCameraMode("phone")}
          >
            <Smartphone className="h-3.5 w-3.5 mr-1" />{t("precheck.phoneCamera")}
          </Button>
        </div>
      )}
      {config.requireDualCamera && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center">
          <p className="text-sm font-medium text-primary flex items-center justify-center gap-2">
            <Camera className="h-4 w-4" />
            {t("precheck.dualCameraSetupNote", "Thiết lập camera laptop trước. Camera điện thoại sẽ được thiết lập ở bước sau.")}
          </p>
        </div>
      )}

      {/* Laptop camera mode */}
      {cameraMode === "laptop" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Camera className="h-3 w-3" />{t("precheck.camera")}
              </label>
              <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("precheck.selectCamera")} />
                </SelectTrigger>
                <SelectContent>
                  {videoDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Mic className="h-3 w-3" />{needsMic ? t("precheck.micRequired") : t("precheck.microphone")}
              </label>
              <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("precheck.selectMic")} />
                </SelectTrigger>
                <SelectContent>
                  {audioDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsMic && (
            <div className="flex items-center gap-2">
              <Mic className={`h-4 w-4 ${volume > 5 ? "text-emerald-500" : "text-muted-foreground"}`} />
              <Progress value={Math.min(volume * 10, 100)} className="h-1.5 flex-1" />
            </div>
          )}
        </>
      )}

      {/* Phone camera mode */}
      {cameraMode === "phone" && (
        <Card className="p-4 space-y-3 border-primary/30">
          {!qrUrl ? (
            <div className="text-center space-y-3">
              <Smartphone className="h-8 w-8 text-primary mx-auto" />
              <div>
                <p className="font-medium">{t("precheck.usePhoneAsCamera")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("precheck.phoneCameraDesc")}
                </p>
              </div>
              <Button disabled={isGeneratingQr} onClick={() => startPhoneCamera()}>
                {isGeneratingQr ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
                {isGeneratingQr ? t("mobileCameraSetup.generatingQr") : t("precheck.getQrCode")}
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="bg-white p-2 rounded-xl inline-block border">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                  alt="QR"
                  className="w-40 h-40"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("precheck.scanQrDesc")}
              </p>
              {phoneWaiting && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t("precheck.waitingConnect")}</span>
                </div>
              )}
              {stream && cameraMode === "phone" && (
                <Badge variant="default" className="bg-emerald-600">
                  <Check className="h-3 w-3 mr-1" />{t("precheck.connected")}
                </Badge>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between pt-1">
        {cameraMode === "laptop" ? (
          <Button variant="ghost" size="sm" onClick={enumerate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />{t("precheck.refreshDevices")}
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />{t("common.back")}</Button>
          <Button disabled={!canProceed} onClick={() => stream && onConfirm(stream)}>
            {t("common.continue")}<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step: MediaPipe Warmup ──────────────────────────────────────────────────

