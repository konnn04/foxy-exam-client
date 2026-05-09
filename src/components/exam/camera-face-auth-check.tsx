import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, RefreshCw, Camera, ArrowLeft, ArrowRight } from "lucide-react";
import { DEVELOPMENT_MODE } from "@/config";
import { acquireFaceLandmarker, extractPitchYaw, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";

interface FaceAuthCheckProps {
  examId: string;
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

type AuthPhase = "init" | "straight" | "left" | "right" | "verifying" | "done" | "failed";

export function CameraFaceAuthCheck({ examId, stream, onSuccess, onCancel }: FaceAuthCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<AuthPhase>("init");
  const [angleIdx, setAngleIdx] = useState(0); // 0=straight, 1=left, 2=right
  const phaseRef = useRef(phase);
  const angleRef = useRef(0);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(0);
  const holdStartRef = useRef(0);
  const capturedRef = useRef<string[]>([]);

  const ANGLE_LABELS = ["Nhìn thẳng", "Quay trái", "Quay phải"];
  const HOLD_MS = 600;

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Init: load MediaPipe and start loop ───────────────────────────
  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});

    (async () => {
      try {
        faceLandmarkerRef.current = await acquireFaceLandmarker({ blendshapes: true });
        if (!active) return;
        setPhase("straight");
        holdStartRef.current = performance.now();
        requestRef.current = requestAnimationFrame(processFrame);
      } catch {
        if (active) setPhase("failed");
      }
    })();

    return () => {
      active = false;
      cancelAnimationFrame(requestRef.current);
      faceLandmarkerRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, [stream]);

  // ── Frame loop ────────────────────────────────────────────────────
  const processFrame = () => {
    const video = videoRef.current;
    const lm = faceLandmarkerRef.current;
    if (!video || !lm) return;
    if (["verifying", "done", "failed"].includes(phaseRef.current)) return;

    // Throttle ML inference to reduce CPU usage (5fps max is enough for yaw gating).
    const now = performance.now();
    const MIN_FRAME_INTERVAL_MS = 200;
    if (now - lastInferAtRef.current < MIN_FRAME_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (video.videoWidth > 0 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      lastInferAtRef.current = now;
      const r = lm.detectForVideo(video, performance.now());

      if (r.facialTransformationMatrixes?.length) {
        const { yaw } = extractPitchYaw(r.facialTransformationMatrixes[0].data);
        const held = performance.now() - holdStartRef.current;
        const curAngle = angleRef.current;

        const good = (
          (curAngle === 0 && Math.abs(yaw) < 12) ||
          (curAngle === 1 && yaw < -10) ||
          (curAngle === 2 && yaw > 10)
        );

        if (good && held > HOLD_MS) {
          captureAndAdvance();
        } else if (!good) {
          holdStartRef.current = performance.now();
        }
      }
    }
    requestRef.current = requestAnimationFrame(processFrame);
  };

  // ── Capture + advance angle ────────────────────────────────────────
  const captureAndAdvance = () => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Brightness check
    const img = ctx.getImageData(0, 0, 160, 90).data;
    let lum = 0;
    for (let i = 0; i < img.length; i += 4) lum += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    if (lum / (160 * 90) < 25) return; // too dark, retry

    capturedRef.current.push(canvas.toDataURL("image/jpeg", 0.9));

    const next = angleRef.current + 1;
    if (next >= 3) {
      setAngleIdx(3);
      setPhase("verifying");
      verifyIdentity();
    } else {
      angleRef.current = next;
      setAngleIdx(next);
      holdStartRef.current = performance.now();
    }
  };

  // ── Verify ─────────────────────────────────────────────────────────
  const verifyIdentity = async () => {
    try {
      if (capturedRef.current.length < 3) throw new Error("Chưa đủ ảnh");
      const results = await Promise.all(
        capturedRef.current.map(async (b64) => {
          const fd = new FormData();
          fd.append("image", b64.replace(/^data:image\/[a-z]+;base64,/, ""));
          return (await api.post(API_ENDPOINTS.EXAM_VERIFY_IDENTITY(examId), fd)).data.match === true;
        })
      );
      if (results.every((m) => m)) {
        setPhase("done");
        setTimeout(onSuccess, 800);
      } else {
        toast.error("Khuôn mặt không khớp. Vui lòng thử lại!");
        setPhase("failed");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Lỗi xác minh");
      setPhase("failed");
    }
  };

  const retry = () => {
    capturedRef.current = [];
    angleRef.current = 0;
    setAngleIdx(0);
    setPhase("straight");
    holdStartRef.current = performance.now();
    requestRef.current = requestAnimationFrame(processFrame);
  };

  return (
    <div className="flex flex-col items-center gap-5 max-w-lg mx-auto py-2">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera preview */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border-2 border-border">
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Overlay: phase indicator */}
        {phase === "init" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm text-white/80">Đang tải mô hình xác minh...</p>
          </div>
        )}

        {phase === "verifying" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm text-white/80">Đang xác minh với hệ thống...</p>
          </div>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-sm gap-2">
            <Check className="h-12 w-12 text-white drop-shadow" />
            <p className="font-bold text-white text-lg drop-shadow">Xác minh thành công</p>
          </div>
        )}

        {/* Angle guide */}
        {["straight", "left", "right"].includes(phase) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 h-52 border-2 border-primary/60 rounded-[40%]" />
            {phase === "left" && (
              <div className="absolute left-4 flex items-center gap-1 text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full">
                <ArrowLeft className="h-4 w-4" /> TRÁI
              </div>
            )}
            {phase === "right" && (
              <div className="absolute right-4 flex items-center gap-1 text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full">
                PHẢI <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress: 3 angles */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            {phase === "done" ? "Hoàn tất" : phase === "failed" ? "Thất bại" : "Chụp 3 góc khuôn mặt"}
          </span>
          <span>{angleIdx}/3</span>
        </div>
        <Progress value={(angleIdx / 3) * 100} className="h-2" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {ANGLE_LABELS.map((l, i) => (
            <span key={l} className={i < angleIdx ? "text-emerald-600 font-medium" : ""}>
              {i < angleIdx ? "✓" : i + 1}. {l}
            </span>
          ))}
        </div>
      </div>

      {/* Status text */}
      {phase === "failed" && (
        <div className="w-full flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>Xác minh không thành công. Đảm bảo đủ sáng và không có người khác trong khung hình.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 w-full">
        {onCancel && phase !== "done" && (
          <Button variant="outline" onClick={onCancel} disabled={phase === "verifying"}>
            Hủy
          </Button>
        )}
        {phase === "failed" ? (
          <Button onClick={retry} className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" />Thử lại
          </Button>
        ) : phase === "done" ? (
          <Button disabled className="flex-1">Đang chuyển tiếp...</Button>
        ) : (
          <Button disabled className="flex-1">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {phase === "init" ? "Đang khởi tạo..." : "Đang chụp..."}
          </Button>
        )}
        {DEVELOPMENT_MODE.ENABLED && phase !== "done" && (
          <Button
            variant="outline"
            size="sm"
            className="border-dashed border-amber-500 text-amber-600 text-xs"
            onClick={onSuccess}
          >
            DEV skip
          </Button>
        )}
      </div>
    </div>
  );
}
