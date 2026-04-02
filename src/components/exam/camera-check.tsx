import { useEffect, useRef, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Video, VideoOff, CheckCircle, AlertTriangle, Mic, Smartphone } from "lucide-react";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import api from "@/lib/api";
import { livekitPublisher } from "@/lib/livekit-publisher";

/** Virtual device: phone publishes via LiveKit `-mobile` identity; not a system videoinput. */
const MOBILE_QR_DEVICE_ID = "__exam_mobile_qr__";

interface CameraCheckProps {
  examId: string;
  attemptId: string;
  onConfirm: (stream: MediaStream) => void;
  /** Phone publishes as `-mobile`; desktop subscribes and passes the same MediaStream pipeline as a local webcam. */
  onMobileRelayReady?: (stream: MediaStream) => void;
  onSkip?: () => void;
  clientConfig?: any;
}

export function CameraCheck({
  examId,
  attemptId,
  onConfirm,
  onMobileRelayReady,
  onSkip,
  clientConfig,
}: CameraCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [volume, setVolume] = useState(0);
  const rafRef = useRef<number>(0);
  /** Avoid re-calling issueQr while staying on the same «phone» selection (e.g. after a failed attempt). */
  const prevCameraSelectionRef = useRef<string>("");

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [pollingRelay, setPollingRelay] = useState(false);
  /** After relay_ack: subscribing LiveKit remote track + optional mic merge. */
  const [qrBinding, setQrBinding] = useState(false);
  /** Phone video (+ optional laptop mic) — shown in preview until user confirms. */
  const [relayPreviewStream, setRelayPreviewStream] = useState<MediaStream | null>(null);

  const resetQrSession = useCallback(() => {
    setQrUrl(null);
    setQrError(null);
    setPollingRelay(false);
    setQrBinding(false);
    setQrLoading(false);
    setRelayPreviewStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((t) => t.stop());
      }
      return null;
    });
  }, []);

  const issueQrAndPoll = useCallback(async () => {
    if (!onMobileRelayReady) return;
    setQrLoading(true);
    setQrError(null);
    try {
      const examIdNum = parseInt(examId, 10);
      if (Number.isNaN(examIdNum)) {
        setQrError("Mã bài thi không hợp lệ.");
        return;
      }
      const ok = await livekitPublisher.ensureConnected(
        {
          examId: examIdNum,
          onError: (msg) => setQrError(msg),
        },
        { requireSupervisorAgent: false },
      );
      if (!ok) {
        setQrError((prev) => prev ?? "Không kết nối được máy chủ giám sát (LiveKit).");
        return;
      }
      const res = await api.post(`/student/exams/${examId}/take/${attemptId}/mobile-camera-token`);
      const url = res.data?.url as string | undefined;
      if (!url) {
        setQrError("Không tạo được liên kết. Thử lại sau.");
        return;
      }
      setQrUrl(url);
      setPollingRelay(true);
    } catch {
      setQrError("Không tạo được mã QR. Kiểm tra mạng hoặc đăng nhập.");
    } finally {
      setQrLoading(false);
    }
  }, [examId, attemptId, onMobileRelayReady]);

  const onVideoDeviceChange = useCallback(
    (value: string) => {
      resetQrSession();
      setSelectedVideoId(value);
    },
    [resetQrSession],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();

        const vDevices = allDevices.filter((d) => d.kind === "videoinput");
        if (cancelled) return;
        setVideoDevices(vDevices);
        if (vDevices.length > 0) {
          setSelectedVideoId(vDevices[0].deviceId);
        } else if (onMobileRelayReady) {
          setSelectedVideoId(MOBILE_QR_DEVICE_ID);
        }

        const aDevices = allDevices.filter((d) => d.kind === "audioinput");
        setAudioDevices(aDevices);
        if (aDevices.length > 0) setSelectedAudioId(aDevices[0].deviceId);
      } catch {
        if (!cancelled) {
          setVideoDevices([]);
          if (onMobileRelayReady) {
            setSelectedVideoId(MOBILE_QR_DEVICE_ID);
          }
          setError(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onMobileRelayReady]);

  useEffect(() => {
    if (!selectedVideoId || selectedVideoId === MOBILE_QR_DEVICE_ID) {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraReady(false);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraReady(false);
      setError(null);

      try {
        const fps = clientConfig?.fps || 10;
        const height = clientConfig?.height || 720;

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: selectedVideoId },
            height: { ideal: height, max: height },
            frameRate: { ideal: fps, max: fps },
          },
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : false,
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(newStream);
        setCameraReady(true);
      } catch {
        if (!cancelled) {
          setError("Không thể mở camera đã chọn. Vui lòng thử camera khác.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, selectedAudioId, clientConfig]);

  useEffect(() => {
    if (selectedVideoId === MOBILE_QR_DEVICE_ID) {
      return;
    }
    setRelayPreviewStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((t) => t.stop());
      }
      return null;
    });
  }, [selectedVideoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    const toShow = relayPreviewStream ?? stream;
    el.srcObject = toShow;
    if (toShow) {
      void el.play().catch(() => {});
    }
  }, [relayPreviewStream, stream]);

  /** First time user lands on «Điện thoại (QR)» (or no webcam default) → create QR once per selection. */
  useEffect(() => {
    if (selectedVideoId !== MOBILE_QR_DEVICE_ID || !onMobileRelayReady) {
      prevCameraSelectionRef.current = selectedVideoId;
      return;
    }
    const wasAlreadyMobile = prevCameraSelectionRef.current === MOBILE_QR_DEVICE_ID;
    prevCameraSelectionRef.current = selectedVideoId;
    if (wasAlreadyMobile) {
      return;
    }
    void issueQrAndPoll();
  }, [selectedVideoId, onMobileRelayReady, issueQrAndPoll]);

  useEffect(() => {
    const audioSource = relayPreviewStream ?? stream;
    if (!audioSource || audioSource.getAudioTracks().length === 0) {
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(audioSource);

      analyser.fftSize = 256;
      microphone.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        setVolume((sum / bufferLength) / 2.5);
        rafRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        audioContext.close().catch(() => {});
      };
    } catch (e) {
      console.error("Audio visualizer error", e);
    }
  }, [stream, relayPreviewStream]);

  useEffect(() => {
    if (!pollingRelay || !onMobileRelayReady) return;
    let cancelled = false;

    const handleRelayAck = async () => {
      setQrBinding(true);
      setQrError(null);
      try {
        const examIdNum = parseInt(examId, 10);
        if (Number.isNaN(examIdNum)) {
          throw new Error("Invalid exam id");
        }
        const ok = await livekitPublisher.ensureConnected(
          {
            examId: examIdNum,
            onError: (msg) => setQrError(msg),
          },
          { requireSupervisorAgent: false },
        );
        if (!ok) {
          setQrError((prev) => prev ?? "Không kết nối được máy chủ giám sát (LiveKit).");
          return;
        }
        const mobileStream = await livekitPublisher.waitForMobileRelayCameraMediaStream(120_000);
        if (!mobileStream) {
          setQrError(
            "Không nhận được hình từ điện thoại. Đảm bảo đã chạm «Bắt đầu» trên điện thoại và thử quét mã mới.",
          );
          return;
        }
        let final = mobileStream;
        if (selectedAudioId) {
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: selectedAudioId } },
              video: false,
            });
            final = new MediaStream([
              ...mobileStream.getVideoTracks(),
              ...audioOnly.getAudioTracks(),
            ]);
          } catch {
            setQrError(
              "Cảnh báo: đã nhận hình từ điện thoại nhưng không mở được micro trên máy tính — tiếp tục chỉ với video.",
            );
            final = mobileStream;
          }
        }
        if (!cancelled) {
          setRelayPreviewStream(final);
        }
      } catch (e) {
        if (!cancelled) {
          setQrError(e instanceof Error ? e.message : "Lỗi khi nhận luồng từ điện thoại.");
        }
      } finally {
        if (!cancelled) {
          setQrBinding(false);
          setPollingRelay(false);
        }
      }
    };

    const t = window.setInterval(async () => {
      try {
        const res = await api.get(
          `/student/exams/${examId}/take/${attemptId}/mobile-camera-relay-status`,
        );
        if (cancelled) return;
        if (res.data?.relay_ack) {
          clearInterval(t);
          await handleRelayAck();
        }
      } catch {
        /* retry */
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollingRelay, examId, attemptId, onMobileRelayReady, selectedAudioId]);

  const exitMobileToWebcam = useCallback(() => {
    resetQrSession();
    if (videoDevices.length > 0) {
      setSelectedVideoId(videoDevices[0].deviceId);
    }
  }, [resetQrSession, videoDevices]);

  const handleConfirm = () => {
    if (selectedVideoId === MOBILE_QR_DEVICE_ID && relayPreviewStream && onMobileRelayReady) {
      onMobileRelayReady(relayPreviewStream);
      return;
    }
    if (stream) {
      onConfirm(stream);
    }
  };

  const previewHasVideo = Boolean(stream) || Boolean(relayPreviewStream);
  const canConfirmWebcam = selectedVideoId !== MOBILE_QR_DEVICE_ID && cameraReady;
  const canConfirmMobile = selectedVideoId === MOBILE_QR_DEVICE_ID && relayPreviewStream !== null;
  const canConfirm = canConfirmWebcam || canConfirmMobile;

  const showQrActiveOnPreview =
    selectedVideoId === MOBILE_QR_DEVICE_ID &&
    Boolean(onMobileRelayReady) &&
    (qrUrl !== null || qrLoading) &&
    !relayPreviewStream;
  const qrFlowBusy = pollingRelay || qrBinding;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 relative z-50">
      <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
        <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)", zIndex: 1 }}
            />
            {!previewHasVideo && !error && !showQrActiveOnPreview && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60" style={{ zIndex: 10 }}>
                <VideoOff className="h-12 w-12" />
              </div>
            )}
            {showQrActiveOnPreview && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 px-4 text-center text-xs text-white/90"
                style={{ zIndex: 10 }}
              >
                <Smartphone className="h-10 w-10 text-primary" />
                <span>Quét mã QR ở cột bên phải bằng điện thoại</span>
              </div>
            )}
            {selectedVideoId === MOBILE_QR_DEVICE_ID && qrFlowBusy && !relayPreviewStream && (
              <div
                className="absolute bottom-2 left-2 right-2 rounded-md bg-black/70 px-2 py-1.5 text-center text-[11px] text-white/90"
                style={{ zIndex: 10 }}
              >
                Đang chờ điện thoại kết nối…
              </div>
            )}
            {relayPreviewStream && selectedVideoId === MOBILE_QR_DEVICE_ID && (
              <div
                className="absolute bottom-2 left-2 right-2 rounded-md bg-black/70 px-2 py-1.5 text-center text-[11px] text-white/90"
                style={{ zIndex: 10 }}
              >
                Xem trước hình từ điện thoại — ổn thì bấm «Xác nhận & Bắt đầu» bên phải.
              </div>
            )}
            {(cameraReady || relayPreviewStream) && (
              <div className="absolute top-2 right-2" style={{ zIndex: 10 }}>
                <CheckCircle className="h-6 w-6 text-green-500 drop-shadow-lg" />
              </div>
            )}
          </div>
        </div>

        <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Video className="h-6 w-6 text-primary" />
                Bước 1: Kiểm tra phần mềm & cứng
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Chọn nguồn hình trong «Camera» (webcam máy hoặc mục điện thoại quét QR). Mic chọn riêng bên dưới. Các bước xác thực mặt / góc máy / môi trường giữ nguyên.
              </p>
            </div>

            {(videoDevices.length > 0 || onMobileRelayReady) && (
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Video className="w-4 h-4" /> Camera
                  </label>
                  <Select value={selectedVideoId} onValueChange={onVideoDeviceChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {videoDevices.map((device, idx) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${idx + 1}`}
                        </SelectItem>
                      ))}
                      {onMobileRelayReady && (
                        <SelectItem value={MOBILE_QR_DEVICE_ID}>
                          <span className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4 shrink-0" />
                            Điện thoại (quét QR)
                          </span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedVideoId === MOBILE_QR_DEVICE_ID && onMobileRelayReady && (
                    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 space-y-2">
                      {qrLoading && (
                        <p className="text-[11px] text-muted-foreground">Đang tạo mã QR…</p>
                      )}
                      {qrUrl && (
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 rounded bg-white p-1">
                            <QRCodeSVG value={qrUrl} size={104} level="M" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-[11px]"
                              onClick={exitMobileToWebcam}
                            >
                              Hủy — chọn lại webcam
                            </Button>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              Quét mã, chạm «Bắt đầu» trên điện thoại (giữ ngang).
                            </p>
                            {(pollingRelay || qrBinding) && !relayPreviewStream && (
                              <p className="text-[10px] text-primary animate-pulse">
                                {qrBinding ? "Đang lấy luồng từ điện thoại…" : "Đang chờ điện thoại…"}
                              </p>
                            )}
                            {relayPreviewStream && (
                              <p className="text-[10px] text-muted-foreground">
                                Đang xem trước bên trái — hài lòng thì xác nhận.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {qrError && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-destructive">{qrError}</p>
                          {!qrLoading && !qrUrl && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => void issueQrAndPoll()}
                            >
                              Thử tạo mã lại
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {audioDevices.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Mic className="w-4 h-4" /> Microphone
                    </label>
                    <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn mic" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioDevices.map((device, idx) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Mic ${idx + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {selectedVideoId === MOBILE_QR_DEVICE_ID && qrUrl && DEVELOPMENT_MODE.ENABLED && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-left">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Debug — link
                </p>
                <code className="block break-all text-[10px] text-foreground">{qrUrl}</code>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 border-t pt-4">
            {onSkip && (
              <Button variant="outline" className="flex-1" onClick={onSkip}>
                Bỏ qua
              </Button>
            )}
            {DEVELOPMENT_MODE.ENABLED && (
              <Button
                variant="outline"
                className="flex-1 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={() => {
                  if (navigator.mediaDevices) {
                    const canvas = document.createElement("canvas");
                    const ms = canvas.captureStream();
                    onConfirm(ms);
                  }
                }}
              >
                [Dev] Bỏ qua
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!canConfirm || qrFlowBusy}
              onClick={handleConfirm}
            >
              {qrFlowBusy && !relayPreviewStream ? (
                "Đang chờ luồng điện thoại…"
              ) : canConfirm ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Xác nhận & Bắt đầu
                </>
              ) : selectedVideoId === MOBILE_QR_DEVICE_ID ? (
                "Xem trước camera trước khi xác nhận"
              ) : (
                "Đang chờ camera..."
              )}
            </Button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 flex items-center px-4 gap-3 border-t border-white/10 z-50">
          <Mic className={`w-5 h-5 ${volume > 5 ? "text-green-400" : "text-gray-400"}`} />
          <Progress value={Math.min(100, volume)} className="h-2 flex-1 [&>div]:bg-green-500 bg-gray-700" />
        </div>
      </Card>
    </div>
  );
}
