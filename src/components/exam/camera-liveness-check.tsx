import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Maximize, AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEV_MODE } from "@/config/app";

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
  
  const [phase, setPhase] = useState<"intro" | "prep" | "flashing" | "analyzing" | "result">("intro");
  const [flashColor, setFlashColor] = useState<string>("transparent");
  const [progress, setProgress] = useState(0);
  const [resultMsg, setResultMsg] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

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

  const startCheck = async () => {
    try {
      if (!document.fullscreenElement) {
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
      setResultMsg("Kiểm tra thành công! Hình ảnh từ camera là thật.");
    } else {
      setIsSuccess(false);
      setResultMsg("Không phát hiện phản xạ ánh sáng. Vui lòng thử lại trong môi trường tối hơn, tăng độ sáng màn hình, và đưa mặt gần màn hình hơn.");
      if (onFail) onFail("Liveness check failed");
    }
  };

  const handleNext = async () => {
    if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
    }
    onSuccess();
  };

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
        <Card className="w-full max-w-lg shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Bước 2: Kiểm tra thực thể (Liveness)
            </CardTitle>
            <CardDescription>
              Hệ thống cần xác minh hình ảnh từ camera là trực tiếp, không phải ảnh giả mạo.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            
            {}
            <canvas ref={canvasRef} className="hidden" />

            {}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black/5 mx-auto w-3/4 border-2 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]" 
              />
              
              {}
              {(phase === "prep" || phase === "flashing" || phase === "analyzing") && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4 text-center">
                  {phase === "prep" || phase === "analyzing" ? (
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  ) : (
                    <div className="h-8 w-8 mb-4 rounded-full bg-white/20 animate-ping" />
                  )}
                  <p className="font-medium text-lg text-white drop-shadow-md">{resultMsg}</p>
                  {phase === "flashing" && (
                    <Progress value={progress} className="w-3/4 mt-4 h-2" />
                  )}
                </div>
              )}
            </div>

            {}
            {phase === "intro" && (
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm text-muted-foreground border">
                <p className="font-semibold text-foreground flex items-center gap-2">
                  <Maximize className="h-4 w-4" /> Yêu cầu chuẩn bị:
                </p>
                <ul className="list-decimal pl-5 space-y-1">
                  <li>Tăng độ sáng màn hình lên mức cao nhất.</li>
                  <li>Ngồi cách màn hình khoảng 30-50cm để ánh sáng phản chiếu rõ lên khuôn mặt.</li>
                  <li>Màn hình sẽ nhấp nháy 3 màu (Đỏ, Xanh lá, Xanh dương) trong vài giây.</li>
                  <li>Giữ nguyên khuôn mặt nhìn thẳng vào màn hình trong quá trình kiểm tra.</li>
                </ul>
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

            {}
            <div className="flex gap-3 pt-2">
              {phase === "intro" && (
                <>
                  {onCancel && (
                    <Button variant="outline" className="flex-1" onClick={onCancel}>
                      Hủy
                    </Button>
                  )}
                  <Button className="flex-1" onClick={startCheck}>
                    Bắt đầu kiểm tra
                  </Button>
                </>
              )}
              
              {phase === "result" && (
                <>
                  {!isSuccess ? (
                    <>
                      <Button variant="outline" className="flex-1" onClick={() => setPhase("intro")}>
                        Thử lại
                      </Button>
                      {DEV_MODE && (
                        <Button 
                          variant="outline" 
                          className="flex-1 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                          onClick={handleNext}
                        >
                          [Dev] Bỏ qua
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button className="flex-1" onClick={handleNext}>
                      Tiếp tục <CheckCircle className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    </>
  );
}
