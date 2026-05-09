import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Minimize2, Maximize2, ScanFace } from "lucide-react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import { extractPitchYaw } from "@/lib/mediapipe-service";
import { DEVELOPMENT_MODE, EXAM_SESSION_BOTTOM_CHROME_PX } from "@/config";

export interface ExamCameraWidgetHandle {
  drawFrame: (results: FaceLandmarkerResult | null) => void;
}

interface ExamCameraWidgetProps {
  primaryStream: MediaStream | null;
  secondaryStream?: MediaStream | null; // Mobile camera
  requireDualCamera?: boolean;
}

export const ExamCameraWidget = forwardRef<ExamCameraWidgetHandle, ExamCameraWidgetProps>(({ primaryStream, secondaryStream, requireDualCamera }, ref) => {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const devStatsRef = useRef<HTMLDivElement>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  
  const [minimized, setMinimized] = useState(false);
  const [showMesh, setShowMesh] = useState(false);

  useEffect(() => {
    if (primaryVideoRef.current && primaryStream && !minimized) {
      primaryVideoRef.current.srcObject = primaryStream;
    }
  }, [primaryStream, minimized]);

  useEffect(() => {
    if (secondaryVideoRef.current && secondaryStream && !minimized) {
      secondaryVideoRef.current.srcObject = secondaryStream;
    }
  }, [secondaryStream, minimized]);

  useImperativeHandle(ref, () => ({
    drawFrame: (results) => {
      if (!canvasRef.current || !primaryVideoRef.current) return;
      const canvas = canvasRef.current;
      const video = primaryVideoRef.current;
      const ctx = canvas.getContext("2d");
      
      if (!ctx || video.videoWidth === 0) return;
      
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!drawingUtilsRef.current) {
        drawingUtilsRef.current = new DrawingUtils(ctx);
      }

      let pitch = 0, yaw = 0, eyeMax = 0;

      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        if (showMesh) {
           for (const lm of results.faceLandmarks) {
             drawingUtilsRef.current.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 0.5 });
           }
        }
        if (results.facialTransformationMatrixes) {
           const angles = extractPitchYaw(results.facialTransformationMatrixes[0].data);
           pitch = angles.pitch;
           yaw = angles.yaw;
        }
        if (results.faceBlendshapes) {
           for (const shape of results.faceBlendshapes[0].categories) {
             if (shape.categoryName.startsWith("eyeLook")) {
               eyeMax = Math.max(eyeMax, shape.score);
             }
           }
        }
      }

      if (devStatsRef.current && DEVELOPMENT_MODE.ENABLED) {
         if (results?.faceLandmarks?.length) {
            devStatsRef.current.innerText = `P:${pitch.toFixed(0)}° Y:${yaw.toFixed(0)}° Eye:${eyeMax.toFixed(2)}`;
         } else {
            devStatsRef.current.innerText = "No Face";
         }
      }
    }
  }));

  const isPrimaryStreaming = !!primaryStream;
  const isSecondaryStreaming = !!secondaryStream;

  return (
    <div
      className={`fixed z-[1200] rounded-xl overflow-hidden shadow-2xl border-2 border-primary/20 bg-card ring-1 ring-black/5 dark:ring-white/10 transition-all duration-300 ease-in-out ${minimized ? "w-16 h-16" : "w-64"}`}
      style={{
        left: "16px",
        bottom: `${EXAM_SESSION_BOTTOM_CHROME_PX + 16}px`,
      }}
    >
      {!minimized ? (
        <div className="flex flex-col relative w-full h-full bg-black">
          {/* Action Bar */}
          <div className="absolute top-1 right-1 flex gap-1 z-20">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-black/50 hover:bg-black/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                setShowMesh(!showMesh);
              }}
              title="Bật/tắt lưới mặt"
            >
              <ScanFace className={`h-3 w-3 ${showMesh ? "text-green-400" : "text-gray-400"}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-black/50 hover:bg-black/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                setMinimized(true);
              }}
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Primary Camera */}
          <div className="relative aspect-video w-full bg-zinc-900">
            <video
              ref={primaryVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ transform: "scaleX(-1)" }}
            />
            {DEVELOPMENT_MODE.ENABLED && (
              <div ref={devStatsRef} className="absolute top-1 left-1 bg-black/70 text-green-400 text-[10px] font-mono px-1 rounded pointer-events-none z-10" />
            )}
            {!isPrimaryStreaming && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950">
                <VideoOff className="h-6 w-6 mb-2 text-red-500" />
                <span className="text-xs">Cam chính (Chưa kết nối)</span>
              </div>
            )}
            <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white z-10">Cam chính</div>
          </div>

          {/* Secondary Camera */}
          {requireDualCamera && (
            <div className="relative aspect-video w-full bg-zinc-900 border-t border-zinc-800">
              <video
                ref={secondaryVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              {!isSecondaryStreaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950">
                  <VideoOff className="h-6 w-6 mb-2 text-yellow-500" />
                  <span className="text-xs">Cam phụ (Chưa kết nối)</span>
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white z-10">Cam phụ</div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center cursor-pointer bg-card hover:bg-muted transition-colors"
          onClick={() => setMinimized(false)}
        >
          {isPrimaryStreaming && (!requireDualCamera || isSecondaryStreaming) ? (
            <Video className="h-6 w-6 text-green-500" />
          ) : (
            <VideoOff className="h-6 w-6 text-red-500" />
          )}
        </div>
      )}
    </div>
  );
});
