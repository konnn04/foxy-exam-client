import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FaceLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { Loader2, CheckCircle, ShieldCheck, AlertCircle } from "lucide-react";
import { createFaceLandmarker, extractPitchYaw } from "@/lib/mediapipe-service";
import {
  TARGET_INTERVAL_MS,
  NOSE_X_MIN, NOSE_X_MAX,
  NOSE_Y_MIN, NOSE_Y_MAX,
  ORIENTATION_PITCH_THRESHOLD,
  ORIENTATION_YAW_THRESHOLD,
  LOOKING_CONFIRM_FRAMES,
  NOT_LOOKING_CONFIRM_FRAMES,
  EYE_LOOK_THRESHOLD,
} from "@/config/mediapipe-config";

interface CameraOrientationCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function CameraOrientationCheck({ stream, onSuccess, onCancel }: CameraOrientationCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const lookingCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLookingAtCamera, setIsLookingAtCamera] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const faceLandmarker = await createFaceLandmarker({ blendshapes: true });
        if (active) {
          faceLandmarkerRef.current = faceLandmarker;
          setIsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load MediaPipe:", err);
        if (active) setLoadError("Không thể tải mô hình AI. Vui lòng kiểm tra kết nối mạng.");
      }
    })();
    return () => {
      active = false;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, isLoaded]);

  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current || isDone) return;
    
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    let looking = false;
    let debugPitch = 0, debugYaw = 0;

    const now = performance.now();
    if (now - lastProcessTimeRef.current < TARGET_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    lastProcessTimeRef.current = now;

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const drawingUtils = new DrawingUtils(ctx);
          
          for (const lm of results.faceLandmarks) {
            drawingUtils.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 0.5 });
          }

          const landmarks = results.faceLandmarks[0];
          const noseTip = landmarks[1];
          
          const noseXOk = noseTip.x >= NOSE_X_MIN && noseTip.x <= NOSE_X_MAX;
          const noseYOk = noseTip.y >= NOSE_Y_MIN && noseTip.y <= NOSE_Y_MAX;
          
          let matrixOk = true;
          if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
            const angles = extractPitchYaw(results.facialTransformationMatrixes[0].data);
            debugPitch = angles.pitch;
            debugYaw = angles.yaw;
            matrixOk = Math.abs(debugPitch) < ORIENTATION_PITCH_THRESHOLD && Math.abs(debugYaw) < ORIENTATION_YAW_THRESHOLD;
          }

          let eyeOk = true;
          if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            const shapes = results.faceBlendshapes[0].categories;
            let maxEyeDev = 0;
            for (const shape of shapes) {
              if (shape.categoryName.startsWith("eyeLook")) {
                maxEyeDev = Math.max(maxEyeDev, shape.score);
              }
            }
            eyeOk = maxEyeDev <= EYE_LOOK_THRESHOLD;
          }

          looking = noseXOk && noseYOk && matrixOk && eyeOk;
        }
      }
      
      if (debugRef.current) {
         debugRef.current.innerText = `faces:${results.faceLandmarks?.length || 0} P:${debugPitch.toFixed(0)}° Y:${debugYaw.toFixed(0)}° look:${looking}`;
      }
    }

    // Smoothing logic
    if (looking) {
      lookingCounterRef.current = Math.min(lookingCounterRef.current + 1, LOOKING_CONFIRM_FRAMES + 1);
      if (lookingCounterRef.current >= LOOKING_CONFIRM_FRAMES) {
        setIsLookingAtCamera(true);
      }
    } else {
      lookingCounterRef.current = Math.max(lookingCounterRef.current - 1, -(NOT_LOOKING_CONFIRM_FRAMES + 1));
      if (lookingCounterRef.current <= -NOT_LOOKING_CONFIRM_FRAMES) {
        setIsLookingAtCamera(false);
      }
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [isDone]);

  // Start loop when loaded
  useEffect(() => {
    if (isLoaded) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isLoaded, predictWebcam]);

  // Progress logic
  useEffect(() => {
    if (isDone) return;
    let timer: ReturnType<typeof setInterval>;
    if (isLookingAtCamera) {
      timer = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            setIsDone(true);
            return 100;
          }
          return p + 2.5;
        });
      }, 100);
    } else {
      timer = setInterval(() => {
        setProgress(p => Math.max(0, p - 5));
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isLookingAtCamera, isDone]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-background/90 p-4 relative z-50">
      <Card className="w-full max-w-4xl shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Left side: Camera & Feedback — video is ALWAYS rendered */}
        <div className="md:w-1/2 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900">
            {/* Debug info overlay */}
            <div ref={debugRef} className="absolute top-1 left-1 z-[60] bg-black/80 text-green-400 text-[10px] p-1 font-mono rounded max-w-full truncate" />
            
            {/* Video — always mounted so ref is always available */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)", zIndex: 1 }}
            />
            
            {/* Canvas for mesh overlay */}
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ transform: "scaleX(-1)", zIndex: 2 }}
            />
            
            {/* Loading overlay on top of the video */}
            {!isLoaded && (
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center text-white"
                style={{ zIndex: 30, backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                {loadError ? (
                  <>
                    <AlertCircle className="h-10 w-10 text-destructive" />
                    <p className="text-sm text-center px-4 mt-2">{loadError}</p>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium mt-2">Đang tải mô hình AI...</p>
                    <p className="text-xs text-white/60">Camera đang chạy phía dưới</p>
                  </>
                )}
              </div>
            )}

            {/* Warning overlay (not looking) */}
            {isLoaded && !isLookingAtCamera && !isDone && (
              <div 
                className="absolute inset-0 border-4 border-red-500 flex flex-col items-center justify-center text-white p-4"
                style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", zIndex: 20 }}
              >
                <AlertCircle className="h-10 w-10 mb-2 drop-shadow-md text-red-500" />
                <p className="font-bold text-center drop-shadow-md bg-black/60 px-4 py-2 rounded-lg">
                  Cảnh báo: Vi phạm hướng mặt/mắt (Vui lòng nhìn thẳng)
                </p>
              </div>
            )}
            
            {/* Done overlay */}
            {isDone && (
              <div 
                className="absolute inset-0 border-4 border-green-500 flex flex-col items-center justify-center text-white pb-6"
                style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", zIndex: 20 }}
              >
                <CheckCircle className="h-12 w-12 text-green-500 bg-white rounded-full mb-2 shadow-xl" />
                <p className="font-bold drop-shadow-md bg-black/60 px-4 py-1 rounded-lg">Chuẩn hóa hoàn tất</p>
              </div>
            )}
          </div>

          {!isDone && (
            <div className="w-full mt-6 space-y-2">
              <div className="flex justify-between text-xs text-white/70 px-1">
                <span>{isLoaded ? "Duy trì nhìn thẳng" : "Đang tải AI..."}</span>
                <span>{Math.floor(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          )}
        </div>

        {/* Right side: Exam Rules and Instructions */}
        <div className="md:w-1/2 p-6 flex flex-col justify-between bg-card relative">
          
          {/* Blur Overlay if not looking */}
          {(!isLookingAtCamera || !isLoaded) && !isDone && (
            <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/50 flex flex-col items-center justify-center p-6 text-center">
              <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="font-bold text-lg mb-2">Vui lòng nhìn thẳng vào camera</h3>
              <p className="text-sm text-muted-foreground">
                Nội quy bài thi sẽ hiển thị khi hệ thống xác nhận tư thế của bạn hợp lệ. Giữ nguyên tỷ lệ khuôn mặt và nhìn thẳng vào giữa màn hình.
              </p>
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <CardTitle className="text-xl">Bước 3: Nội quy & Chuẩn hóa</CardTitle>
            </div>
            
            <div className="space-y-4 text-sm">
              <p className="font-medium text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                Lưu ý: Camera và AI sẽ giám sát liên tục trong quá trình làm bài. Hành vi gian lận sẽ được hệ thống ghi nhận.
              </p>
              
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li><strong className="text-foreground">Tư thế:</strong> Luôn giữ khuôn mặt ở giữa khung hình. Không dí sát mặt vào màn hình (kích thước mặt {"<"} 50% khung hình).</li>
                <li><strong className="text-foreground">Hướng nhìn và Mắt:</strong> Mắt và mặt phải nhìn thẳng vào bài thi, không quay lảng tránh hoặc đảo mắt lệch góc quá lớn.</li>
                <li><strong className="text-foreground">Rời khỏi vị trí:</strong> Không được rời khỏi camera.</li>
                <li><strong className="text-foreground">App thứ 3:</strong> Không mở tab khác, không thu nhỏ trình duyệt, mọi hành vi sẽ bị đánh dấu Vi Phạm.</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t">
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isDone}>
                Hủy
              </Button>
            )}
            <Button 
              className="flex-1" 
              onClick={onSuccess} 
              disabled={!isDone}
            >
              {isDone ? "Vào phòng thi" : "Đang chuẩn hóa tư thế..."}
            </Button>
          </div>
        </div>

      </Card>
    </div>
  );
}
