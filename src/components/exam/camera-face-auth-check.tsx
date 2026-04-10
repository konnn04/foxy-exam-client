import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { User, CheckCircle, Loader2, RefreshCcw, ArrowLeft, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEVELOPMENT_MODE } from "@/config";
import { acquireFaceLandmarker, extractPitchYaw, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import api from "@/lib/api";

interface FaceAuthCheckProps {
  examId: string;
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

type AuthPhase = 'init' | 'straight' | 'left' | 'right' | 'verifying' | 'done' | 'failed';

export function CameraFaceAuthCheck({ examId, stream, onSuccess, onCancel }: FaceAuthCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<AuthPhase>('init');
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0);
  const [qualityHint, setQualityHint] = useState<string>("");
  const FACE_AUTH_WARMUP_MS = 4000;
  const STRAIGHT_HOLD_MS = 1000;
  const SIDE_HOLD_MS = 700;
  const MIN_BRIGHTNESS = 30; // lowered to avoid false rejections
  const MIN_SHARPNESS = 5;   // lowered to avoid blurry false negatives

  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const phaseStartTimeRef = useRef<number>(0);
  const capturedImagesRef = useRef<string[]>([]);
  
  // Audio visualizer setup
  const rafRef = useRef<number>(0);
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
  }, [stream]);

  // MediaPipe Initialization & Setup
  useEffect(() => {
    let isSubscribed = true;

    async function init() {
      try {
        if (!faceLandmarkerRef.current) {
          // Use blendshapes=true to share the same warmed instance with orientation + in-exam monitor.
          faceLandmarkerRef.current = await acquireFaceLandmarker({ blendshapes: true });
        }
        if (!isSubscribed) return;
        setPhase('init');
        capturedImagesRef.current = []; // reset images on init
        phaseStartTimeRef.current = performance.now();
        setTimeout(() => {
          if (!isSubscribed) return;
          setPhase('straight');
          phaseRef.current = 'straight';
          phaseStartTimeRef.current = performance.now();
          requestRef.current = requestAnimationFrame(processVideoFrame);
        }, FACE_AUTH_WARMUP_MS);
      } catch (err) {
        console.error("Lỗi khởi tạo AI:", err);
        setPhase('failed');
      }
    }
    
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().then(() => {
        init();
      }).catch(e => {
        if (e.name !== 'AbortError') {
          console.error("Cannot play video:", e);
        }
      });
    }

    return () => {
      isSubscribed = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceLandmarkerRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, [stream]);

  // Video Processing Loop
  const processVideoFrame = () => {
    const video = videoRef.current;
    if (!video || !faceLandmarkerRef.current) return;
    
    // Stop processing if we are verifying or done
    if (['verifying', 'done', 'failed'].includes(phaseRef.current)) return;

    const now = performance.now();
    if (video.videoWidth > 0 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(video, now);

      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
        const { pitch, yaw } = extractPitchYaw(results.facialTransformationMatrixes[0].data);
        const timeInPhase = now - phaseStartTimeRef.current;

        handlePhaseLogic(pitch, yaw, timeInPhase);
      }
    }

    if (!['verifying', 'done', 'failed'].includes(phaseRef.current)) {
      requestRef.current = requestAnimationFrame(processVideoFrame);
    }
  };

  // Hack to access latest state inside rAF
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const getFrameQuality = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const w = 160;
    const h = 90;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;

    let lumSum = 0;
    let sharpSum = 0;
    let sharpCount = 0;
    const lums = new Float32Array(w * h);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const l = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      lums[p] = l;
      lumSum += l;
    }
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const p = y * w + x;
        sharpSum += Math.abs(lums[p] - lums[p - 1]) + Math.abs(lums[p] - lums[p - w]);
        sharpCount += 2;
      }
    }
    const brightness = lumSum / (w * h);
    const sharpness = sharpCount > 0 ? sharpSum / sharpCount : 0;
    return { brightness, sharpness };
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return false;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const quality = getFrameQuality();
      if (!quality || quality.brightness < MIN_BRIGHTNESS || quality.sharpness < MIN_SHARPNESS) {
        setQualityHint("Khung hình đang mờ/tối, giữ yên 1-2 giây để camera lấy nét.");
        return false;
      }
      setQualityHint("");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      capturedImagesRef.current.push(canvas.toDataURL('image/jpeg', 0.9));
      return true;
    }
    return false;
  };

  const handlePhaseLogic = (pitch: number, yaw: number, timeInPhase: number) => {
    let nextPhase = phaseRef.current;
    
    if (nextPhase === 'straight') {
      // Must look straight for ~0.5s
      const isStraight = Math.abs(pitch) < 15 && Math.abs(yaw) < 15;
      if (isStraight) {
        const pct = Math.min(33, (timeInPhase / 500) * 33);
        setProgress(pct);
        if (timeInPhase > STRAIGHT_HOLD_MS) {
          // Try capture, but don't reset progress if it fails - just retry next frame
          if (captureFrame()) {
            phaseRef.current = 'left';
            setPhase('left');
            phaseStartTimeRef.current = performance.now();
          }
          // If captureFrame fails, we just stay in 'straight' and try again next frame
        }
      } else {
        phaseStartTimeRef.current = performance.now(); // reset if not straight
        setProgress(0);
      }
    } 
    else if (nextPhase === 'left') {
      // Turn left (yaw < -10)
      const isLeft = yaw < -10;
      if (isLeft) {
        setProgress(33 + Math.min(33, (timeInPhase / 500) * 33));
        if (timeInPhase > SIDE_HOLD_MS) {
          if (captureFrame()) {
            phaseRef.current = 'right';
            setPhase('right');
            phaseStartTimeRef.current = performance.now();
          }
        }
      } else {
        phaseStartTimeRef.current = performance.now();
        setProgress(33);
      }
    } 
    else if (nextPhase === 'right') {
      // Turn right (yaw > 10)
      const isRight = yaw > 10;
      if (isRight) {
        setProgress(66 + Math.min(34, (timeInPhase / 500) * 34));
        if (timeInPhase > SIDE_HOLD_MS) {
          if (captureFrame()) {
            phaseRef.current = 'verifying';
            setPhase('verifying');
            verifyIdentity();
          }
        }
      } else {
        phaseStartTimeRef.current = performance.now();
        setProgress(66);
      }
    }
  };

  const verifyIdentity = async () => {
    try {
      if (capturedImagesRef.current.length < 3) throw new Error("Chưa đủ 3 góc ảnh");
      
      const promises = capturedImagesRef.current.map(async (imgBase64) => {
        const formData = new FormData();
        const base64Data = imgBase64.replace(/^data:image\/[a-z]+;base64,/, "");
        formData.append('image', base64Data);
        const res = await api.post(`/student/exams/${examId}/verify-identity`, formData);
        return res.data.match === true;
      });

      const results = await Promise.all(promises);
      const allMatched = results.every(match => match);

      if (allMatched) {
        setProgress(100);
        setPhase('done');
        setTimeout(onSuccess, 1500);
      } else {
        toast.error("Ảnh chụp 3 góc không khớp với dữ liệu đăng ký!");
        setPhase('failed');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || "Lỗi xác thực khuôn mặt");
      setPhase('failed');
    }
  };

  const retry = () => {
    setPhase('straight');
    setProgress(0);
    capturedImagesRef.current = [];
    phaseStartTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(processVideoFrame);
  };

  const getStatusText = () => {
    switch (phase) {
      case 'init': return "Đang khởi tạo thuật toán AI...";
      case 'straight': return "Vui lòng nhìn thẳng vào Camera";
      case 'left': return "Từ từ quay mặt sang TRÁI (10 độ)";
      case 'right': return "Từ từ quay mặt sang PHẢI (10 độ)";
      case 'verifying': return "Đang xác minh danh tính lên hệ thống...";
      case 'done': return "Xác minh danh tính thành công!";
      case 'failed': return "Xác minh thất bại. Vui lòng thử lại.";
      default: return "";
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 relative z-50">
      {/* Hidden canvas for taking snapshot */}
      <canvas ref={canvasRef} className="hidden" />
      
      <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
        {/* Left Side: Camera Preview */}
        <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${phase === 'verifying' ? 'opacity-50 blur-sm' : ''}`}
              style={{ transform: "scaleX(-1)", zIndex: 1 }}
            />
            
            {/* Overlay indicators */}
            <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
              <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 text-white font-medium shadow-xl">
                 {getStatusText()}
              </div>
            </div>

            {phase === 'done' && (
              <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center text-white backdrop-blur-sm transition-all duration-500" style={{ zIndex: 10 }}>
                <CheckCircle className="h-16 w-16 text-green-500 drop-shadow-md bg-white rounded-full animate-bounce" />
                <p className="font-bold mt-4 text-xl drop-shadow-md">Xác minh thành công</p>
              </div>
            )}
            
            {(phase === 'init' || phase === 'verifying') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white" style={{ zIndex: 10 }}>
                <Loader2 className="h-12 w-12 animate-spin text-primary drop-shadow-md" />
              </div>
            )}
            
            {/* Guide circle based on phase */}
            {['straight', 'left', 'right'].includes(phase) && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                 <div className={`relative w-48 h-64 border-2 rounded-[40%] transition-all duration-500 flex items-center justify-center ${
                   phase === 'straight' ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'border-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                 }`}>
                    {phase === 'left' && (
                       <div className="absolute -left-20 flex items-center animate-pulse text-white font-bold drop-shadow-md bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
                          {/* Note: since video is scaleX(-1), turning left moves face left on screen */}
                          <ArrowLeft className="w-5 h-5 mr-1" /> TRÁI
                       </div>
                    )}
                    {phase === 'right' && (
                       <div className="absolute -right-24 flex items-center animate-pulse text-white font-bold drop-shadow-md bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
                          PHẢI <ArrowRight className="w-5 h-5 ml-1" />
                       </div>
                    )}
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Information & Settings */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <User className="h-6 w-6 text-primary" />
                Bước 2: Xác minh danh tính
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Hệ thống đang đối chiếu khuôn mặt của bạn với dữ liệu gốc nhằm đảo bảo chống gian lận. Vui lòng làm theo hướng dẫn trên khung camera.
              </p>
            </div>

            <div className="space-y-2 mt-4">
               <div className="flex justify-between text-xs text-muted-foreground mr-1">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                     {(phase === 'init' || phase === 'verifying') && <Loader2 className="w-3 h-3 animate-spin text-primary"/>}
                     {phase === 'done' ? "Hoàn thành" : 
                      phase === 'failed' ? "Thất bại" : "Tiến độ xác nhận"}
                  </span>
                  <span>{Math.floor(progress)}%</span>
               </div>
               <Progress 
                 value={progress} 
                 className={`h-2 ${phase === 'done' ? "[&>div]:bg-green-500" : phase === 'failed' ? "[&>div]:bg-destructive" : ""}`} 
               />
            </div>
            {qualityHint && phase !== 'verifying' && phase !== 'done' && (
              <div className="bg-amber-500/10 text-amber-700 p-3 rounded-lg text-sm border border-amber-400/30">
                {qualityHint}
              </div>
            )}
            
            {phase === 'failed' && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm border border-destructive/20">
                <p className="font-semibold mb-1">Xác minh không thành công</p>
                <p>Khuôn mặt không khớp tỷ lệ hoặc hệ thống không thể nhận diện. Đảm bảo đủ sáng và không dùng ảnh giả.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 border-t pt-4">
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={phase === 'verifying' || phase === 'done'}>
                Hủy
              </Button>
            )}
            
            {phase === 'failed' ? (
              <Button className="flex-1" onClick={retry}>
                <RefreshCcw className="w-4 h-4 mr-2"/> Thử lại
              </Button>
            ) : (
              <Button className="flex-1" disabled>
                {phase === 'done' ? "Đang chuyển tiếp..." : "Đang xác minh..."}
              </Button>
            )}

            {DEVELOPMENT_MODE.ENABLED && phase !== 'done' && (
              <Button 
                variant="outline" 
                className="flex-[0.5] border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={onSuccess}
              >
                [Dev] Bỏ qua
              </Button>
            )}
          </div>
        </div>

        {/* Global Footer Mic Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 flex items-center px-4 gap-3 border-t border-white/10 z-50">
          <User className={`w-5 h-5 ${volume > 5 ? 'text-green-400' : 'text-gray-400'}`} />
          <Progress value={Math.min(100, volume)} className="h-2 flex-1 [&>div]:bg-green-500 bg-gray-700" />
        </div>
      </Card>
    </div>
  );
}
