import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, ShieldAlert, AlertTriangle, Mic } from "lucide-react";
import { DEVELOPMENT_MODE } from "@/config/security.config";

const FLASH_COLORS = ["#ff0000", "#00ff00", "#0000ff"]; 
const FLASH_DURATION_MS = 300; 
const BLANK_DURATION_MS = 200; 

interface CameraLivenessCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onFail?: (reason: string) => void;
  onCancel?: () => void;
}

export function CameraLivenessCheck({ stream, onSuccess, onFail, onCancel }: CameraLivenessCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  
  const [phase, setPhase] = useState<"prep" | "flashing" | "analyzing" | "result">("prep");
  const [flashColor, setFlashColor] = useState<string>("transparent");
  const [progress, setProgress] = useState(0);
  const [resultMsg, setResultMsg] = useState("Vui lòng nhìn thẳng vào camera...");
  const [isSuccess, setIsSuccess] = useState(false);
  const [volume, setVolume] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
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

  const startCheck = useCallback(async () => {
    try {
      if (!document.fullscreenElement && !DEVELOPMENT_MODE.ENABLED) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    setPhase("prep");
    for (let i = 3; i > 0; i--) {
      setResultMsg(`Chuẩn bị trong ${i} giây...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    setPhase("flashing");
    setResultMsg("Đang phân tích phản xạ ánh sáng (giữ nguyên khuôn mặt)...");
    
    const baselines = [];
    for(let i=0; i<3; i++) {
        baselines.push(captureFrame());
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
      setProgress(((i) / FLASH_COLORS.length) * 100);
      setFlashColor(FLASH_COLORS[i]);
      
      await new Promise(r => setTimeout(r, FLASH_DURATION_MS));
      
      const frame = captureFrame();
      flashResults.push(frame);
      
      setFlashColor("transparent");
      await new Promise(r => setTimeout(r, BLANK_DURATION_MS));
    }
    
    setProgress(100);
    setPhase("analyzing");
    
    await new Promise(r => setTimeout(r, 1000)); 
    
    let passed = false;
    if (flashResults.length === 3 && flashResults[0] && flashResults[1] && flashResults[2] && baseline) {
      const redFlash = flashResults[0];
      const greenFlash = flashResults[1];
      const blueFlash = flashResults[2];
      
      const rDiff = redFlash.r - baseline.r;
      const gDiff = greenFlash.g - baseline.g;
      const bDiff = blueFlash.b - baseline.b;
      
      console.log("Liveness diffs: ", { rDiff, gDiff, bDiff });
      
      let score = 0;
      if (rDiff > 2) score++; 
      if (gDiff > 2) score++;
      if (bDiff > 2) score++;
      
      passed = score >= 1; 
    }

    setPhase("result");
    if (passed) {
      setIsSuccess(true);
      setResultMsg("Kiểm tra thành công! Hình ảnh từ camera là thật. Đang chuyển tiếp...");
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } else {
      setIsSuccess(false);
      setResultMsg("Không phát hiện phản xạ ánh sáng. Vui lòng thử lại trong môi trường tối hơn, tăng độ sáng màn hình, và đưa mặt gần màn hình hơn.");
      if (onFail) onFail("Liveness check failed");
    }
  }, [captureFrame, onFail, onSuccess]);

  useEffect(() => {
      if (!startedRef.current && stream) {
          startedRef.current = true;
          startCheck();
      }
  }, [stream, startCheck]);

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
    <>
      {}
      {phase === "flashing" && (
        <div 
          className="fixed inset-0 z-[9999] pointer-events-none transition-colors duration-75"
          style={{ backgroundColor: flashColor }}
        />
      )}

      <div className="flex items-center justify-center min-h-screen bg-background/90 p-4 relative z-50">
        <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
          
          {/* Left Side: Camera Preview */}
          <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900">
              <canvas ref={canvasRef} className="hidden" />
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: "scaleX(-1)", zIndex: 1 }}
              />
              
              {(phase === "prep" || phase === "flashing" || phase === "analyzing") && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4 text-center z-10">
                  {phase === "prep" || phase === "analyzing" ? (
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  ) : (
                     <div className="h-8 w-8 mb-4 rounded-full bg-white/20 animate-ping" />
                  )}
                  {phase === "flashing" && (
                    <Progress value={progress} className="w-3/4 mt-4 h-2" />
                  )}
                </div>
              )}
              {phase === "result" && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4 text-center z-10">
                  {isSuccess ? <CheckCircle className="h-12 w-12 text-green-500 bg-white rounded-full mb-2" /> : <AlertTriangle className="h-12 w-12 text-destructive bg-white rounded-full mb-2" />}
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Information & Settings */}
          <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                  Bước 4: Kiểm tra Liveness
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  Hệ thống cần xác minh hình ảnh từ camera là trực tiếp, không phải ảnh giả mạo. Vui lòng giữ khuôn mặt trong khung hình.
                </p>
              </div>

              <div className="space-y-4">
               {phase !== "result" && (
                 <div className="text-center font-medium my-4 p-4 border rounded-lg bg-accent/50 text-sm">
                    <p>{resultMsg}</p>
                 </div>
               )}

               {phase === "result" && (
                 <div className={`p-4 rounded-lg flex items-start gap-3 border ${
                   isSuccess ? "bg-green-500/10 border-green-500/50 text-green-700" : "bg-destructive/10 border-destructive/50 text-destructive"
                 }`}>
                   {isSuccess ? <CheckCircle className="h-5 w-5 mt-0.5" /> : <AlertTriangle className="h-5 w-5 mt-0.5" />}
                   <div>
                     <p className="font-medium">{isSuccess ? "Thành công" : "Thất bại"}</p>
                     <p className="text-sm mt-1 opacity-90">{resultMsg}</p>
                   </div>
                 </div>
               )}
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t">
              {phase === "result" && !isSuccess ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={() => {
                     setPhase("prep");
                     startCheck();
                  }}>
                    Thử lại
                  </Button>
                  {onCancel && (
                    <Button variant="outline" className="flex-1" onClick={onCancel}>
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
                </>
              ) : (
                <>
                   {onCancel && (
                     <Button variant="outline" className="flex-1" onClick={onCancel} disabled={phase !== "prep" && phase !== "result"}>
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
                   <Button className="flex-1" disabled>
                     {phase === "result" ? "Hoàn tất..." : "Đang kiểm tra..."}
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
