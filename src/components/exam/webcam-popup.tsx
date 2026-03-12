import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Minimize2, ScanFace } from "lucide-react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import { extractPitchYaw } from "@/lib/mediapipe-service";
import { DEV_MODE } from "@/config/app";

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
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (videoRef.current && stream && !minimized) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, minimized]);

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
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.y)),
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

  // Periodic Face Cropping & Mock POST
  useEffect(() => {
    if (!stream) return;

    const interval = setInterval(() => {
      if (!latestLandmarksRef.current || !latestLandmarksRef.current.length) return;
      if (!videoRef.current) return;

      const video = videoRef.current;
      const landmarks = latestLandmarksRef.current[0]; // Get first face

      // Compute bounding box
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const point of landmarks) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      // Add padding (e.g., 20% around the face)
      const paddingX = (maxX - minX) * 0.2;
      const paddingY = (maxY - minY) * 0.2;

      minX = Math.max(0, minX - paddingX);
      minY = Math.max(0, minY - paddingY);
      maxX = Math.min(1, maxX + paddingX);
      maxY = Math.min(1, maxY + paddingY);

      const cropX = minX * video.videoWidth;
      const cropY = minY * video.videoHeight;
      const cropW = (maxX - minX) * video.videoWidth;
      const cropH = (maxY - minY) * video.videoHeight;

      if (cropW <= 0 || cropH <= 0) return;

      // Draw cropped face to offscreen canvas
      const offCanvas = document.createElement("canvas");
      offCanvas.width = cropW;
      offCanvas.height = cropH;
      const offCtx = offCanvas.getContext("2d");
      if (!offCtx) return;

      offCtx.drawImage(
        video,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      // Convert to Base64
      const base64Image = offCanvas.toDataURL("image/jpeg", 0.8);
      console.log(`[MOCK FACE AUTH] Cropped face (W:${cropW.toFixed(0)}, H:${cropH.toFixed(0)}). Sending POST...`, base64Image.substring(0, 50) + '...');
      // TODO: Replace with actual WEBRTC/API POST to server when ready
      
    }, 10000); // Trigger every 10 seconds

    return () => clearInterval(interval);
  }, [stream]);

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

      if (devStatsRef.current && DEV_MODE) {
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
      className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border border-border bg-card"
      style={{
        left: position.x,
        top: position.y,
        width: minimized ? 60 : 240,
        height: minimized ? 60 : 200,
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
          {DEV_MODE && (
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
