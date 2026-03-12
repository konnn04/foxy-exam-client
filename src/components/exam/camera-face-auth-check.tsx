import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { User, CheckCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEV_MODE } from "@/config/app";

interface FaceAuthCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function CameraFaceAuthCheck({ stream, onSuccess, onCancel }: FaceAuthCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [volume, setVolume] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    let time = 0;
    const interval = setInterval(() => {
      time += 100;
      setProgress((time / 3000) * 100);
      if (time >= 3000) {
        clearInterval(interval);
        setIsDone(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onSuccess, 1500);
      return () => clearTimeout(timer);
    }
  }, [isDone, onSuccess]);

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

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 relative z-50">
      <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
        
        {/* Left Side: Camera Preview */}
        <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)", zIndex: 1 }}
            />
            {isDone && (
              <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center text-white backdrop-blur-sm transition-all duration-500" style={{ zIndex: 10 }}>
                <CheckCircle className="h-12 w-12 text-green-500 drop-shadow-md bg-white rounded-full animate-bounce" />
                <p className="font-bold mt-2 text-lg drop-shadow-md">Xác minh danh tính</p>
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
                Hệ thống đang đối chiếu khuôn mặt của bạn với hình ảnh thẻ tùy thân gốc...
              </p>
            </div>

            <div className="space-y-2 mt-4">
               <div className="flex justify-between text-xs text-muted-foreground mr-1">
                  <span className="flex items-center gap-1">
                     {!isDone && <Loader2 className="w-3 h-3 animate-spin"/>}
                     {isDone ? "Hoàn thành" : "Đang xử lý thuật toán..."}
                  </span>
                  <span>{Math.floor(progress)}%</span>
               </div>
               <Progress value={progress} className={`h-2 ${isDone ? "[&>div]:bg-green-500" : ""}`} />
            </div>
          </div>

          <div className="flex gap-3 mt-6 border-t pt-4">
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isDone}>
                Hủy
              </Button>
            )}
            {DEV_MODE && (
              <Button 
                variant="outline" 
                className="flex-1 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={onSuccess}
              >
                [Dev] Bỏ qua
              </Button>
            )}
            <Button className="flex-1" disabled>
              {isDone ? "Đang chuyển tiếp..." : "Đang xác minh..."}
            </Button>
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
