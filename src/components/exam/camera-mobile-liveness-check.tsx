import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Loader2, RefreshCcw, Smartphone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEVELOPMENT_MODE } from "@/config";
import { acquireFaceLandmarker, extractPitchYaw, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

interface MobileLivenessCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

type AuthPhase = 'init' | 'check_angle' | 'done' | 'failed';

export function CameraMobileLivenessCheck({ stream, onSuccess, onCancel }: MobileLivenessCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<AuthPhase>('init');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string>("Đang khởi tạo thuật toán AI...");
  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const phaseStartTimeRef = useRef<number>(0);
  
  const WARMUP_MS = 2000;
  const HOLD_MS = 2000;

  // MediaPipe Initialization
  useEffect(() => {
    let isSubscribed = true;
    async function init() {
      try {
        if (!faceLandmarkerRef.current) {
          faceLandmarkerRef.current = await acquireFaceLandmarker({ blendshapes: true });
        }
        if (!isSubscribed) return;
        setPhase('init');
        setTimeout(() => {
          if (!isSubscribed) return;
          setPhase('check_angle');
          phaseRef.current = 'check_angle';
          phaseStartTimeRef.current = performance.now();
          setHint("Vui lòng đặt điện thoại chéo 30-45 độ so với mặt, cách xa vừa phải.");
          requestRef.current = requestAnimationFrame(processVideoFrame);
        }, WARMUP_MS);
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
        if (e.name !== 'AbortError') console.error("Cannot play video:", e);
      });
    }

    return () => {
      isSubscribed = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceLandmarkerRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, [stream]);

  const processVideoFrame = () => {
    const video = videoRef.current;
    if (!video || !faceLandmarkerRef.current) return;
    
    if (['done', 'failed'].includes(phaseRef.current)) return;

    const now = performance.now();
    if (video.videoWidth > 0 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(video, now);

      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0 && results.faceLandmarks.length > 0) {
        const { yaw } = extractPitchYaw(results.facialTransformationMatrixes[0].data);
        const landmarks = results.faceLandmarks[0];
        
        // head height: distance from chin (152) to top of head (10)
        const headHeight = Math.abs(landmarks[152].y - landmarks[10].y);
        
        const isGoodAngle = Math.abs(yaw) >= 30 && Math.abs(yaw) <= 50;
        const isGoodDistance = headHeight >= 0.2 && headHeight <= 0.35; // 1/5 to ~1/3
        
        const timeInPhase = now - phaseStartTimeRef.current;
        
        if (isGoodAngle && isGoodDistance) {
          setHint("Góc và khoảng cách ĐẠT. Giữ nguyên tư thế...");
          setProgress(Math.min(100, (timeInPhase / HOLD_MS) * 100));
          if (timeInPhase >= HOLD_MS) {
            phaseRef.current = 'done';
            setPhase('done');
            setTimeout(onSuccess, 1500);
          }
        } else {
          phaseStartTimeRef.current = performance.now(); // reset
          setProgress(0);
          if (!isGoodAngle) {
            setHint(`Góc nhìn chưa đúng (${Math.abs(yaw).toFixed(0)} độ). Vui lòng đặt camera nghiêng 30-45 độ.`);
          } else if (!isGoodDistance) {
            setHint(headHeight < 0.2 ? "Camera điện thoại đang quá XA." : "Camera điện thoại đang quá GẦN.");
          }
        }
      } else {
        phaseStartTimeRef.current = performance.now();
        setProgress(0);
        setHint("Không phát hiện khuôn mặt trên camera phụ.");
      }
    }

    if (!['done', 'failed'].includes(phaseRef.current)) {
      requestRef.current = requestAnimationFrame(processVideoFrame);
    }
  };

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const retry = () => {
    setPhase('check_angle');
    setProgress(0);
    phaseStartTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(processVideoFrame);
  };

  return (
    <div className="flex items-center justify-center min-h-[50vh] bg-background p-4 relative z-50">
      <Card className="w-full max-w-4xl shadow-xl flex flex-col md:flex-row overflow-hidden relative">
        <div className="md:w-1/2 bg-black relative flex flex-col items-center justify-center p-4">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50">
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300`}
              style={{ transform: "scaleX(-1)", zIndex: 1 }}
            />
            {phase === 'done' && (
              <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center text-white backdrop-blur-sm z-10">
                <CheckCircle className="h-16 w-16 text-green-500 drop-shadow-md bg-white rounded-full animate-bounce" />
                <p className="font-bold mt-4 text-xl">Xác minh thành công</p>
              </div>
            )}
            {phase === 'init' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary drop-shadow-md" />
              </div>
            )}
          </div>
        </div>

        <div className="md:w-1/2 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Smartphone className="h-6 w-6 text-primary" />
                Xác minh Camera góc chéo
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Thiết lập này yêu cầu Camera điện thoại phải được đặt ở góc chéo (30-45 độ) và lấy được toàn cảnh người thi (khoảng cách vừa phải).
              </p>
            </div>

            <div className="bg-accent/50 p-4 rounded-lg text-sm border font-medium text-center min-h-[60px] flex items-center justify-center">
               {hint}
            </div>

            <div className="space-y-2 mt-4">
               <div className="flex justify-between text-xs text-muted-foreground mr-1">
                  <span className="font-medium text-foreground">
                     {phase === 'done' ? "Hoàn thành" : "Đang kiểm tra góc..."}
                  </span>
                  <span>{Math.floor(progress)}%</span>
               </div>
               <Progress value={progress} className={`h-2 ${phase === 'done' ? "[&>div]:bg-green-500" : ""}`} />
            </div>
          </div>

          <div className="flex gap-3 mt-6 border-t pt-4">
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={phase === 'done'}>Hủy</Button>
            )}
            {phase === 'failed' ? (
              <Button className="flex-1" onClick={retry}><RefreshCcw className="w-4 h-4 mr-2"/> Thử lại</Button>
            ) : (
              <Button className="flex-1" disabled>{phase === 'done' ? "Hoàn thành" : "Đang kiểm tra..."}</Button>
            )}
            {DEVELOPMENT_MODE.ENABLED && phase !== 'done' && (
              <Button variant="outline" className="flex-[0.5] border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white" onClick={onSuccess}>[Dev] Bỏ qua</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
