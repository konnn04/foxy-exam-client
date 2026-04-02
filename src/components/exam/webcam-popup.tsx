import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Minimize2, ScanFace } from "lucide-react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import { extractPitchYaw } from "@/lib/mediapipe-service";
import { DEVELOPMENT_MODE, WEBCAM_POPUP_DIMENSIONS } from "@/config";

function initialBottomLeftPosition() {
  if (typeof window === "undefined") return { x: 16, y: 100 };
  const h = WEBCAM_POPUP_DIMENSIONS.NORMAL.HEIGHT_PX;
  const statusBarReserve = 40;
  return {
    x: 16,
    y: Math.max(16, window.innerHeight - h - statusBarReserve),
  };
}

export interface WebcamPopupHandle {
  drawFrame: (results: FaceLandmarkerResult | null) => void;
}

interface WebcamPopupProps {
  stream: MediaStream | null;
}

export const WebcamPopup = forwardRef<WebcamPopupHandle, WebcamPopupProps>(({ stream }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const devStatsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const latestLandmarksRef = useRef<any[] | null>(null);
  
  const [minimized, setMinimized] = useState(false);
  const [showMesh, setShowMesh] = useState(true);
  const [position, setPosition] = useState(initialBottomLeftPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (videoRef.current && stream && !minimized) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, minimized]);

  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current || minimized) return;
      const rect = containerRef.current.getBoundingClientRect();
      const h = rect.height;
      const statusBarReserve = 40;
      setPosition((p) => ({
        x: Math.min(p.x, Math.max(0, window.innerWidth - rect.width - 8)),
        y: Math.min(p.y, Math.max(8, window.innerHeight - h - statusBarReserve)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDragging(true);
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const cw = containerRef.current.offsetWidth;
      const ch = containerRef.current.offsetHeight;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - cw, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - ch, e.clientY - dragOffset.current.y)),
      });
    };

    const handleMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  // Face crop upload is handled by useFaceMonitor hook in exam-session.tsx

  useImperativeHandle(ref, () => ({
    drawFrame: (results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
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
        latestLandmarksRef.current = results.faceLandmarks;
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

  const isStreaming = !!stream;

  return (
    <div
      ref={containerRef}
      className="fixed z-[1200] rounded-xl overflow-hidden shadow-2xl border-2 border-primary/20 bg-card ring-1 ring-black/5 dark:ring-white/10"
      style={{
        left: position.x,
        top: position.y,
        width: minimized
          ? WEBCAM_POPUP_DIMENSIONS.MINIMIZED.WIDTH_PX
          : WEBCAM_POPUP_DIMENSIONS.NORMAL.WIDTH_PX,
        height: minimized
          ? WEBCAM_POPUP_DIMENSIONS.MINIMIZED.HEIGHT_PX
          : WEBCAM_POPUP_DIMENSIONS.NORMAL.HEIGHT_PX,
        cursor: dragging ? "grabbing" : "grab",
        transition: dragging ? "none" : "width 0.2s, height 0.2s",
      }}
      onMouseDown={handleMouseDown}
    >
      {!minimized && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover bg-black"
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
          <div className="absolute top-1 right-1 flex gap-1 z-10">
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
          <div className="absolute bottom-1 left-1 z-10">
            <div
              className={`h-2 w-2 rounded-full ${isStreaming ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            />
          </div>
        </>
      )}
      {minimized && (
        <div
          className="w-full h-full flex items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(false);
          }}
        >
          {isStreaming ? (
            <Video className="h-5 w-5 text-green-500" />
          ) : (
            <VideoOff className="h-5 w-5 text-red-500" />
          )}
        </div>
      )}
    </div>
  );
});
