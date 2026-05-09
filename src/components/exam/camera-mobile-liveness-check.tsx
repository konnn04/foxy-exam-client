import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, RefreshCcw, Smartphone, Camera } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEVELOPMENT_MODE, API_CONFIG, STORAGE_KEYS } from "@/config";
import { acquireFaceLandmarker, extractPitchYaw, releaseFaceLandmarker } from "@/lib/mediapipe-service";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

interface MobileLivenessCheckProps {
  stream: MediaStream;
  laptopStream?: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

type AuthPhase = 'init' | 'check_layout' | 'done' | 'failed';

export function CameraMobileLivenessCheck({ stream, laptopStream, onSuccess, onCancel }: MobileLivenessCheckProps) {
  const { t } = useTranslation();
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const laptopVideoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<AuthPhase>('init');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string>(t("mobileLiveness.initAI"));
  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const phaseStartTimeRef = useRef<number>(0);
  const isVerifyingLayoutRef = useRef<boolean>(false);
  const { examId } = useParams<{ examId: string }>();
  
  const WARMUP_MS = 2000;
  const HOLD_MS = 2500;

  // Attach laptop camera preview
  useEffect(() => {
    if (laptopVideoRef.current && laptopStream) {
      laptopVideoRef.current.srcObject = laptopStream;
      laptopVideoRef.current.play().catch(() => {});
    }
  }, [laptopStream]);

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
          setPhase('check_layout');
          phaseRef.current = 'check_layout';
          phaseStartTimeRef.current = performance.now();
          setHint(t("mobileLiveness.positionPhone"));
          requestRef.current = requestAnimationFrame(processVideoFrame);
        }, WARMUP_MS);
      } catch (err) {
        console.error("Lỗi khởi tạo AI:", err);
        setPhase('failed');
      }
    }
    
    if (mobileVideoRef.current && stream) {
      mobileVideoRef.current.srcObject = stream;
      mobileVideoRef.current.play().then(() => {
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
    const video = mobileVideoRef.current;
    if (!video || !faceLandmarkerRef.current) return;
    
    if (['done', 'failed'].includes(phaseRef.current)) return;

    const now = performance.now();
    if (video.videoWidth > 0 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(video, now);

      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0 && results.faceLandmarks.length > 0) {
        const { yaw } = extractPitchYaw(results.facialTransformationMatrixes[0].data);
        const landmarks = results.faceLandmarks[0];
        
        // head height ratio in frame
        const headHeight = Math.abs(landmarks[152].y - landmarks[10].y);
        // Face center X position (0-1, 0=left, 1=right)
        const faceCenterX = landmarks[1].x;
        
        const timeInPhase = now - phaseStartTimeRef.current;

        if (phaseRef.current === 'check_layout') {
          // Check for 90° angle (face roughly facing camera, yaw near 0)
          // The phone is at eye level, so the face should be roughly frontal
          const isFacingCamera = Math.abs(yaw) <= 35;
          // Face should be on one side of the frame (person on left or right)
          // leaving room for the laptop on the other side
          const isOnSide = faceCenterX < 0.35 || faceCenterX > 0.65;
          // Good distance: face takes 15-40% of frame height
          const isGoodDistance = headHeight >= 0.15 && headHeight <= 0.40;

          if (isFacingCamera && isOnSide && isGoodDistance) {
            if (!isVerifyingLayoutRef.current) {
              setHint(t("mobileLiveness.layoutGood"));
              setProgress(Math.min(100, (timeInPhase / HOLD_MS) * 100));
              if (timeInPhase >= HOLD_MS) {
                isVerifyingLayoutRef.current = true;
                setHint("Đang kiểm tra laptop qua AI server...");
                
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(video, 0, 0);
                
                canvas.toBlob((blob) => {
                    if (!blob) {
                        isVerifyingLayoutRef.current = false;
                        return;
                    }
                    const formData = new FormData();
                    formData.append('frame', blob, 'frame.jpg');
                    
                    fetch(`${API_CONFIG.BASE_URL}/student/exams/${examId}/proctor/verify-mobile-layout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)}`
                        },
                        body: formData
                    }).then(res => res.json()).then(data => {
                        if (data.ok) {
                            // Layout verified — done
                            phaseRef.current = 'done';
                            setPhase('done');
                            setTimeout(onSuccess, 1500);
                        } else {
                            // Failed, restart timeInPhase
                            phaseStartTimeRef.current = performance.now();
                            setProgress(0);
                            setHint(data.message || "Góc máy không hợp lệ (cần thấy cả người và laptop)");
                        }
                    }).catch(err => {
                        console.error("Lỗi AI góc máy:", err);
                        phaseStartTimeRef.current = performance.now();
                        setProgress(0);
                        setHint("Lỗi kết nối kiểm tra góc máy (Thử lại)");
                    }).finally(() => {
                        isVerifyingLayoutRef.current = false;
                    });
                }, 'image/jpeg', 0.8);
              }
            }
          } else {
            if (!isVerifyingLayoutRef.current) {
              phaseStartTimeRef.current = performance.now();
              setProgress(0);
            }
            if (!isFacingCamera) {
              setHint(t("mobileLiveness.turnToCamera"));
            } else if (!isOnSide) {
              setHint(t("mobileLiveness.moveToSide"));
            } else if (!isGoodDistance) {
              setHint(headHeight < 0.15 ? t("mobileLiveness.tooFar") : t("mobileLiveness.tooClose"));
            }
          }
        }
      } else {
        phaseStartTimeRef.current = performance.now();
        setProgress(0);
        setHint(t("mobileLiveness.noFace"));
      }
    }

    if (!['done', 'failed'].includes(phaseRef.current)) {
      requestRef.current = requestAnimationFrame(processVideoFrame);
    }
  };

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const retry = () => {
    setPhase('check_layout');
    phaseRef.current = 'check_layout';
    setProgress(0);
    phaseStartTimeRef.current = performance.now();
    setHint(t("mobileLiveness.positionPhone"));
    requestRef.current = requestAnimationFrame(processVideoFrame);
  };

  return (
    <div className="space-y-4">
      {/* Split view: laptop cam (left) + phone cam (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Laptop camera */}
        {laptopStream && (
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
            <video ref={laptopVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
              <Camera className="w-3 h-3 mr-1" /> {t("precheck.laptopCamera")}
            </Badge>
          </div>
        )}

        {/* Phone camera */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black border-2 border-primary/50">
          <video
            ref={mobileVideoRef}
            autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style={{ zIndex: 1 }}
          />
          <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] bg-emerald-600/80 text-white border-0 z-10">
            <Smartphone className="w-3 h-3 mr-1" /> {t("precheck.phoneCamera")}
          </Badge>
          {phase === 'done' && (
            <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center text-white backdrop-blur-sm z-10">
              <CheckCircle className="h-16 w-16 text-green-500 drop-shadow-md bg-white rounded-full animate-bounce" />
              <p className="font-bold mt-4 text-xl">{t("mobileLiveness.verified")}</p>
            </div>
          )}
          {phase === 'init' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary drop-shadow-md" />
            </div>
          )}
        </div>
      </div>

      {/* Info panel */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {t("mobileLiveness.title")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("mobileLiveness.subtitle")}
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          <Badge variant={phase === 'check_layout' ? 'default' : phase === 'done' ? 'secondary' : 'outline'} className="text-xs">
            1. {t("mobileLiveness.stepLayout")}
          </Badge>
        </div>

        {/* Hint */}
        <div className="bg-accent/50 p-4 rounded-lg text-sm border font-medium text-center min-h-[60px] flex items-center justify-center">
          {hint}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground mr-1">
            <span className="font-medium text-foreground">
              {phase === 'done' ? t("mobileLiveness.complete") : t("mobileLiveness.checkingLayout")}
            </span>
            <span>{Math.floor(progress)}%</span>
          </div>
          <Progress value={progress} className={`h-2 ${phase === 'done' ? "[&>div]:bg-green-500" : ""}`} />
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t pt-4">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={phase === 'done'}>{t("common.cancel")}</Button>
          )}
          {phase === 'failed' ? (
            <Button className="flex-1" onClick={retry}><RefreshCcw className="w-4 h-4 mr-2"/> {t("mobileCameraSetup.retry")}</Button>
          ) : (
            <Button className="flex-1" disabled>{phase === 'done' ? t("mobileLiveness.complete") : t("mobileLiveness.checking")}</Button>
          )}
          {DEVELOPMENT_MODE.ENABLED && phase !== 'done' && (
            <Button variant="outline" className="flex-[0.5] border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white" onClick={onSuccess}>[Dev] Skip</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
