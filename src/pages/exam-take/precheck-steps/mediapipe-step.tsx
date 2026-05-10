import { useState, useEffect, useRef } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { acquireFaceLandmarker, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import { captureRendererException } from "@/lib/capture-renderer-exception";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const MODEL_LOAD_TIMEOUT_MS = 120_000;
const VIDEO_READY_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      resolve();
      return;
    }
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("video_timeout"));
    }, timeoutMs);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    onReady();
  });
}

export function MediaPipeStep({
  stream,
  onDone,
  onBack,
}: {
  stream: MediaStream;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"init" | "testing" | "done" | "error">("init");
  const [progress, setProgress] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const landRef = useRef<FaceLandmarker | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastInferAtRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    let active = true;

    const stopLoop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    (async () => {
      setStatus("init");
      setProgress(0);
      setErrorMessage("");
      landRef.current = null;

      const video = videoRef.current;
      if (!video) {
        if (active) {
          const err = new Error("MediaPipeStep: video ref missing");
          captureRendererException(err, {
            tags: { mediapipe_precheck: "video_ref" },
            extra: { streamActive: stream.active, trackCount: stream.getTracks().length },
          });
          setStatus("error");
          setErrorMessage(t("precheck.modelLoadVideoMissing"));
        }
        return;
      }

      try {
        await waitForVideoDimensions(video, VIDEO_READY_TIMEOUT_MS);
      } catch {
        if (!active) return;
        const err = new Error("MediaPipeStep: video dimensions timeout");
        captureRendererException(err, {
          tags: { mediapipe_precheck: "video_dimensions" },
          extra: {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
            onLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
          },
        });
        setStatus("error");
        setErrorMessage(t("precheck.modelLoadVideoTimeout"));
        return;
      }

      if (!active) return;

      try {
        landRef.current = await withTimeout(
          acquireFaceLandmarker({ blendshapes: true }),
          MODEL_LOAD_TIMEOUT_MS,
          "model_timeout",
        );
      } catch (err) {
        console.error("[MediaPipeStep] Face landmarker load failed:", err);
        if (!active) return;
        captureRendererException(err instanceof Error ? err : new Error(String(err)), {
          tags: { mediapipe_precheck: "face_landmarker_load" },
          extra: {
            kind: err instanceof Error && err.message === "model_timeout" ? "timeout" : "rejected",
            onLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          },
        });
        setStatus("error");
        const msg = err instanceof Error && err.message === "model_timeout"
          ? t("precheck.modelLoadTimeout")
          : t("precheck.modelLoadFailed");
        setErrorMessage(msg);
        return;
      }

      if (!active) return;
      setStatus("testing");

      const start = performance.now();
      let lastTime = -1;

      const loop = () => {
        if (!active || !landRef.current) return;
        const v = videoRef.current;
        if (!v || v.videoWidth <= 0) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        const elapsed = performance.now() - start;
        setProgress(Math.min((elapsed / 3000) * 100, 100));

        const now = performance.now();
        const MIN_FRAME_INTERVAL_MS = 200;
        const canInfer = now - lastInferAtRef.current >= MIN_FRAME_INTERVAL_MS;

        if (v.currentTime !== lastTime && v.videoWidth > 0) {
          lastTime = v.currentTime;
          if (canInfer) {
            lastInferAtRef.current = now;
            try {
              const r = landRef.current.detectForVideo(v, now);
              setFaceCount(r.faceLandmarks?.length ?? 0);
            } catch (inferErr) {
              console.error("[MediaPipeStep] detectForVideo:", inferErr);
              if (active) {
                stopLoop();
                captureRendererException(
                  inferErr instanceof Error ? inferErr : new Error(String(inferErr)),
                  { tags: { mediapipe_precheck: "detect_for_video" } },
                );
                setStatus("error");
                setErrorMessage(t("precheck.modelInferenceFailed"));
              }
              return;
            }
          }
        }

        if (elapsed >= 3000) {
          setStatus("done");
          window.setTimeout(() => {
            if (active) onDoneRef.current();
          }, 600);
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      active = false;
      stopLoop();
      landRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on retry / stream change
  }, [attempt, stream]);

  return (
    <div className="max-w-xl mx-auto space-y-5 text-center">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-80" />
        {faceCount > 0 && status === "testing" && (
          <Badge className="absolute top-2 right-2 bg-emerald-600 text-[10px]">
            {t("precheck.faces", { count: faceCount })}
          </Badge>
        )}
      </div>

      {status === "error" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div>
        <h3 className="font-semibold">
          {status === "init" && t("precheck.initializingAI")}
          {status === "testing" && t("precheck.testingCamera")}
          {status === "done" && t("precheck.cameraStable")}
          {status === "error" && t("precheck.modelLoadErrorTitle")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {status === "init" && t("precheck.downloadingModel")}
          {status === "testing" && t("precheck.keepStill")}
          {status === "done" && t("precheck.readyNextStep")}
          {status === "error" && t("precheck.modelLoadErrorHint")}
        </p>
      </div>

      <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {status === "error" && (
          <Button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t("precheck.retry")}
          </Button>
        )}
        {status === "error" && (
          <Button type="button" variant="outline" onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
      </div>
    </div>
  );
}
