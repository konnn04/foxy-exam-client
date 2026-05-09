import { useState, useEffect, useRef } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { acquireFaceLandmarker, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import { Progress } from "@/components/ui/progress";
import { Badge } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MediaPipeStep({
  stream, onDone, onBack: _onBack,
}: {
  stream: MediaStream;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"init" | "testing" | "done">("init");
  const [progress, setProgress] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const landRef = useRef<FaceLandmarker | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastInferAtRef = useRef(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        landRef.current = await acquireFaceLandmarker({ blendshapes: true });
        if (!active) return;
        setStatus("testing");

        const video = videoRef.current!;
        const start = performance.now();
        let lastTime = -1;

        const loop = () => {
          if (!active || !landRef.current) return;
          const elapsed = performance.now() - start;
          setProgress(Math.min((elapsed / 3000) * 100, 100));

          const now = performance.now();
          const MIN_FRAME_INTERVAL_MS = 200; // ~5fps to reduce CPU usage
          const canInfer = (now - lastInferAtRef.current) >= MIN_FRAME_INTERVAL_MS;

          if (video.currentTime !== lastTime && video.videoWidth > 0) {
            lastTime = video.currentTime;
            if (canInfer) {
              lastInferAtRef.current = now;
              const r = landRef.current.detectForVideo(video, now);
              setFaceCount(r.faceLandmarks?.length ?? 0);
            }
          }

          if (elapsed >= 3000) {
            setStatus("done");
            setTimeout(() => onDoneRef.current(), 600);
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch {
        if (active) setStatus("done");
      }
    })();
    return () => {
      active = false;
      landRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, []); // stable: onDoneRef used instead

  return (
    <div className="max-w-xl mx-auto space-y-5 text-center">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-80" />
        {faceCount > 0 && (
          <Badge className="absolute top-2 right-2 bg-emerald-600 text-[10px]">
            {t("precheck.faces", { count: faceCount })}
          </Badge>
        )}
      </div>

      <div>
        <h3 className="font-semibold">
          {status === "init" && t("precheck.initializingAI")}
          {status === "testing" && t("precheck.testingCamera")}
          {status === "done" && t("precheck.cameraStable")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {status === "init" && t("precheck.downloadingModel")}
          {status === "testing" && t("precheck.keepStill")}
          {status === "done" && t("precheck.readyNextStep")}
        </p>
      </div>

      <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />
    </div>
  );
}

// ── Step: Liveness (flash test) ──────────────────────────────────────────────

