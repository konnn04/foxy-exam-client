import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FaceLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { Loader2, CheckCircle, ShieldCheck, AlertCircle, Mic, AlertTriangle } from "lucide-react";
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
import { DEVELOPMENT_MODE } from "@/config/security.config";

const FLASH_COLORS = ["#ff0000", "#00ff00", "#0000ff"]; 
const FLASH_DURATION_MS = 300; 
const BLANK_DURATION_MS = 200; 

interface CameraOrientationCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

type CheckPhase = 'loading' | 'orientation' | 'liveness_prep' | 'liveness_flashing' | 'liveness_analyzing' | 'done' | 'failed';

export function CameraOrientationCheck({ stream, onSuccess, onCancel }: CameraOrientationCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const audioRafRef = useRef<number>(0);
  const [volume, setVolume] = useState(0);
  const lookingCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  
  const [phase, setPhase] = useState<CheckPhase>('loading');
  const [loadError, setLoadError] = useState("");
  const [isLookingAtCamera, setIsLookingAtCamera] = useState(false);
  const [progress, setProgress] = useState(0);

  // Liveness States
  const [flashColor, setFlashColor] = useState<string>("transparent");
  const [resultMsg, setResultMsg] = useState("");

  const phaseRef = useRef<CheckPhase>('loading');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const faceLandmarker = await createFaceLandmarker({ blendshapes: true });
        if (active) {
          faceLandmarkerRef.current = faceLandmarker;
          setPhase('orientation');
        }
      } catch (err) {
        console.error("Failed to load MediaPipe:", err);
        if (active) {
          setPhase('loading');
          setLoadError("Không thể tải mô hình AI. Vui lòng kiểm tra kết nối mạng.");
        }
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
  }, [stream]);

  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;
    if (['done', 'liveness_flashing', 'liveness_analyzing'].includes(phaseRef.current)) return;
    
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
      if (ctx && phaseRef.current === 'orientation') {
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
      } else if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          // Just maintain looking = true if face detected during prep
          looking = true;
      }
      
      if (debugRef.current && phaseRef.current === 'orientation') {
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
  }, []);

  // Start loop when loaded
  useEffect(() => {
    if (phase === 'orientation') {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [phase, predictWebcam]);

  // Phase 1: Orientation Progress
  useEffect(() => {
    if (phase !== 'orientation') return;
    let timer: ReturnType<typeof setInterval>;
    if (isLookingAtCamera) {
      timer = setInterval(() => {
        setProgress(p => {
          if (p >= 50) {
            clearInterval(timer);
            setPhase('liveness_prep');
            return 50;
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
  }, [isLookingAtCamera, phase]);

  // Phase 2: Liveness Check Helper
  const captureFrameColor = useCallback(() => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    
    // We can use an off-screen canvas quickly
    const tCanvas = document.createElement("canvas");
    tCanvas.width = video.videoWidth;
    tCanvas.height = video.videoHeight;
    const ctx = tCanvas.getContext("2d");
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0, tCanvas.width, tCanvas.height);
    const imageData = ctx.getImageData(0, 0, tCanvas.width, tCanvas.height);
    
    let r = 0, g = 0, b = 0;
    const data = imageData.data;
    const pixelCount = data.length / 4;
    
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    
    return {
      r: r / pixelCount,
      g: g / pixelCount,
      b: b / pixelCount
    };
  }, []);

  // Phase 2: Liveness Check Execution
  const livenessStartedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  const runLivenessSequence = useCallback(async () => {
    if (livenessStartedRef.current) return;
    livenessStartedRef.current = true;

    try {
      if (!document.fullscreenElement && !DEVELOPMENT_MODE.ENABLED) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    if (unmountedRef.current) return;
    setResultMsg("Đang chuẩn bị kiểm tra ánh sáng...");
    await new Promise(r => setTimeout(r, 1500));
    if (unmountedRef.current) return;

    // We can evaluate current look status dynamically via ref to avoid stale closures
    const isCurrentlyLooking = lookingCounterRef.current >= LOOKING_CONFIRM_FRAMES;
    if (!isCurrentlyLooking) {
        setPhase('failed');
        setResultMsg("Bạn đã không nhìn thẳng. Vui lòng thử lại.");
        livenessStartedRef.current = false;
        return;
    }

    setPhase('liveness_flashing');
    setResultMsg("Vui lòng giữ nguyên khuôn mặt...");
    
    const baselines = [];
    for(let i=0; i<3; i++) {
        baselines.push(captureFrameColor());
        if (unmountedRef.current) return;
        await new Promise(r => setTimeout(r, 50));
    }

    const baseline = baselines.reduce((acc, curr) => {
      if (!acc) return { r: 0, g: 0, b: 0 };
      return {
        r: acc.r + (curr?.r || 0),
        g: acc.g + (curr?.g || 0),
        b: acc.b + (curr?.b || 0)
      };
    }, { r: 0, g: 0, b: 0 }) || { r: 0, g: 0, b: 0 };
    
    if (baseline.r > 0) {
      baseline.r /= baselines.length;
      baseline.g /= baselines.length;
      baseline.b /= baselines.length;
    }

    const flashResults = [];
    for (let i = 0; i < FLASH_COLORS.length; i++) {
      if (unmountedRef.current) return;
      setProgress(50 + ((i + 1) / FLASH_COLORS.length) * 50);
      setFlashColor(FLASH_COLORS[i]);
      
      await new Promise(r => setTimeout(r, FLASH_DURATION_MS));
      const frame = captureFrameColor();
      flashResults.push(frame);
      
      setFlashColor("transparent");
      await new Promise(r => setTimeout(r, BLANK_DURATION_MS));
    }
    
    if (unmountedRef.current) return;
    setProgress(100);
    setPhase('liveness_analyzing');
    setResultMsg("Đang phân tích dữ liệu...");
    
    await new Promise(r => setTimeout(r, 800));
    if (unmountedRef.current) return;
    
    let passed = false;
    if (flashResults.length === 3 && flashResults[0] && flashResults[1] && flashResults[2] && baseline) {
      const rDiff = flashResults[0].r - baseline.r;
      const gDiff = flashResults[1].g - baseline.g;
      const bDiff = flashResults[2].b - baseline.b;
      
      let score = 0;
      if (rDiff > 2) score++; 
      if (gDiff > 2) score++;
      if (bDiff > 2) score++;
      
      passed = score >= 1; 
    }

    if (passed) {
      setPhase('done');
      setResultMsg("Kiểm tra thành công! Hình ảnh từ camera là thật.");
      setTimeout(onSuccess, 1500);
    } else {
      setPhase('failed');
      setResultMsg("Không phát hiện phản xạ ánh sáng (Liveness failed). Vui lòng đảm bảo bạn đang ở môi trường đủ sáng và là người thật.");
      livenessStartedRef.current = false;
    }
  }, [captureFrameColor, onSuccess]);

  useEffect(() => {
    if (phase === 'liveness_prep') {
      runLivenessSequence();
    }
  }, [phase, runLivenessSequence]);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
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
        audioRafRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      return () => {
        if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
        audioContext.close().catch(() => {});
      };
    } catch (e) {
      console.error("Audio visualizer error", e);
    }
  }, [stream]);

  return (
    <>
      {phase === 'liveness_flashing' && (
        <div 
          className="fixed inset-0 z-[9999] pointer-events-none transition-colors duration-75"
          style={{ backgroundColor: flashColor }}
        />
      )}
      
      <div className="flex items-center justify-center min-h-screen bg-background/90 p-4 relative z-50">
        <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
          
          {/* Left side: Camera & Feedback — video is ALWAYS rendered */}
          <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
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
              {phase === 'orientation' && (
                <canvas 
                  ref={canvasRef} 
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ transform: "scaleX(-1)", zIndex: 2 }}
                />
              )}
              
              {/* Loading overlay on top of the video */}
              {phase === 'loading' && (
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
                      <p className="text-sm font-medium mt-2">Đang khởi động thuật toán Liveness...</p>
                    </>
                  )}
                </div>
              )}

              {['liveness_prep', 'liveness_flashing', 'liveness_analyzing'].includes(phase) && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4 text-center" style={{ zIndex: 30 }}>
                  {phase === "liveness_flashing" ? (
                    <div className="h-8 w-8 mb-4 rounded-full bg-white/20 animate-ping" />
                  ) : (
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  )}
                  <p className="font-semibold">{resultMsg}</p>
                </div>
              )}

              {/* Warning overlay (not looking) */}
              {phase === 'orientation' && !isLookingAtCamera && (
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
              {phase === 'done' && (
                <div 
                  className="absolute inset-0 border-4 border-green-500 flex flex-col items-center justify-center text-white pb-6"
                  style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", zIndex: 20 }}
                >
                  <CheckCircle className="h-12 w-12 text-green-500 bg-white rounded-full mb-2 shadow-xl" />
                  <p className="font-bold drop-shadow-md bg-black/60 px-4 py-1 rounded-lg">Chuẩn hóa hoàn tất</p>
                </div>
              )}
            </div>

            {phase !== 'done' && (
              <div className="w-full mt-6 space-y-2">
                <div className="flex justify-between text-xs text-white/70 px-1">
                  <span>
                    {phase === 'loading' ? "Đang tải AI..." : 
                     phase === 'orientation' ? "Duy trì nhìn thẳng" : "Liveness Check"}
                  </span>
                  <span>{Math.floor(progress)}%</span>
                </div>
                <Progress value={progress} className="h-3 [&>div]:bg-primary" />
              </div>
            )}
          </div>

          {/* Right side: Exam Rules and Instructions */}
          <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
            
            {/* Blur Overlay if not looking */}
            {(!isLookingAtCamera || phase === 'loading') && phase === 'orientation' && (
              <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/50 flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="font-bold text-lg mb-2">Vui lòng nhìn thẳng vào camera</h3>
                <p className="text-sm text-muted-foreground">
                  Nội quy bài thi sẽ hiển thị khi hệ thống xác nhận tư thế của bạn hợp lệ. Giữ nguyên tỷ lệ khuôn mặt và nhìn thẳng.
                </p>
              </div>
            )}

            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <CardTitle className="text-xl">Bước 3: Nội quy & Liveness Check</CardTitle>
              </div>
              
              <div className="space-y-4 text-sm">
                <p className="font-medium text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                  Lưu ý: Camera và AI sẽ kiểm tra bạn có phải người thật không (Liveness Check) và sẽ giám sát liên tục.
                </p>

                {phase === 'failed' && (
                 <div className="p-4 rounded-lg flex items-start gap-3 border bg-destructive/10 border-destructive/50 text-destructive">
                   <AlertTriangle className="h-5 w-5 mt-0.5" />
                   <div>
                     <p className="font-medium">Thất bại</p>
                     <p className="text-sm mt-1 opacity-90">{resultMsg}</p>
                   </div>
                 </div>
                )}
                
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                  <li><strong className="text-foreground">Liveness Check:</strong> Màn hình sẽ nháy màu để kiểm tra phản chiếu ảnh thật. Vui lòng giữ mặt yên.</li>
                  <li><strong className="text-foreground">Hướng nhìn và Mắt:</strong> Mắt và mặt phải nhìn thẳng vào màn hình, không quay lảng tránh hoặc nhắm mắt.</li>
                  <li><strong className="text-foreground">App thứ 3:</strong> Không mở tab khác, không thu nhỏ trình duyệt, mọi hành vi sẽ bị đánh dấu Vi Phạm.</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t">
              {phase === 'failed' ? (
                <Button variant="outline" className="flex-1" onClick={() => {
                   setProgress(0);
                   setPhase('orientation');
                }}>
                  Thử lại
                </Button>
              ) : (
                <>
                  {onCancel && (
                    <Button variant="outline" className="flex-1" onClick={onCancel} disabled={phase === 'done' || phase === 'liveness_flashing'}>
                      Hủy
                    </Button>
                  )}
                  {DEVELOPMENT_MODE.ENABLED && (
                    <Button 
                      variant="outline" 
                      className="flex-1 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                      onClick={onSuccess}
                    >
                      [Dev] Bỏ qua
                    </Button>
                  )}
                  <Button 
                    className="flex-[1.5]" 
                    disabled={true}
                  >
                    {phase === 'done' ? "Thành công. Đang chuyển tiếp..." : "Đang chuẩn hóa tư thế..."}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Global Footer Mic Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 flex items-center px-4 gap-3 border-t border-white/10 z-50">
            <Mic className={`w-5 h-5 ${volume > 5 ? 'text-green-400' : 'text-gray-400'}`} />
            <Progress value={Math.min(100, volume)} className="h-2 flex-1 [&>div]:bg-green-500 bg-gray-700" />
          </div>
        </Card>
      </div>
    </>
  );
}
