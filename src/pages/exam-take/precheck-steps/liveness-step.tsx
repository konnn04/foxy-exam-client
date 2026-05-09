import { useState, useRef, useEffect } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { acquireFaceLandmarker, releaseFaceLandmarker } from "@/lib/mediapipe-service";
// ── Step: Liveness (flash test) ──────────────────────────────────────────────
import { FLASH_SEQUENCE } from "@/constants/exam";
import { useTranslation } from "react-i18next";

export function LivenessStep({
  stream, onDone, onBack: _onBack,
}: {
  stream: MediaStream;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"face" | "flash" | "done">("face");
  const [flashIdx, setFlashIdx] = useState(-1);
  const [flashColor, setFlashColor] = useState("transparent");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastInferAtRef = useRef(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Phase 1: detect face
  useEffect(() => {
    if (phase !== "face") return;
    let active = true;
    let land: FaceLandmarker | null = null;
    (async () => {
      try {
        land = await acquireFaceLandmarker({ blendshapes: true });
        if (!active) return;
        let lastTime = -1;
        const loop = () => {
          if (!active || !land) return;
          const v = videoRef.current!;
          const now = performance.now();
          const MIN_FRAME_INTERVAL_MS = 200; // ~5fps is enough for face presence check
          const canInfer = (now - lastInferAtRef.current) >= MIN_FRAME_INTERVAL_MS;
          if (v.currentTime !== lastTime && v.videoWidth > 0) {
            lastTime = v.currentTime;
            if (canInfer) {
              lastInferAtRef.current = now;
              const r = land.detectForVideo(v, now);
              if (r.faceLandmarks?.length) {
                setPhase("flash");
                return;
              }
            }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch { /* ignore */ }
    })();
    return () => {
      active = false;
      land = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, [phase]);

  // Phase 2: flash sequence
  useEffect(() => {
    if (phase !== "flash") return;
    let active = true;
    let i = 0;
    const run = () => {
      if (!active) return;
      if (i >= FLASH_SEQUENCE.length) {
        setFlashColor("transparent");
        setFlashIdx(-1);
        setPhase("done");
        setTimeout(() => onDoneRef.current(), 600);
        return;
      }
      const f = FLASH_SEQUENCE[i];
      setFlashIdx(i);
      setFlashColor(f.color);
      i++;
      setTimeout(run, f.ms + 100);
    };
    run();
    return () => { active = false; };
  }, [phase]);

  return (
    <div className="max-w-xl mx-auto space-y-4 text-center">
      {/* Full-screen flash so camera receives strong ambient color change for spoof detection */}
      {phase === "flash" && flashColor !== "transparent" && (
        <div
          className="fixed inset-0 z-40 pointer-events-none transition-colors duration-75"
          style={{ backgroundColor: flashColor, opacity: 1 }}
        />
      )}

      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>

      <div>
        <h3 className="font-semibold">
          {phase === "face" && t("precheck.lookAtCamera")}
          {phase === "flash" && t("precheck.testingLiveness", { color: t(FLASH_SEQUENCE[flashIdx]?.label ?? "") })}
          {phase === "done" && t("precheck.livenessConfirmed")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {phase === "face" && t("precheck.faceInFrameDesc")}
          {phase === "flash" && t("precheck.keepStillFlashDesc")}
          {phase === "done" && t("precheck.movingNextStep")}
        </p>
      </div>
    </div>
  );
}

// ── Step: Environment ───────────────────────────────────────────────────────

