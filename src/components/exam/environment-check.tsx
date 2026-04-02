import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Monitor, CheckCircle, ShieldAlert, AlertTriangle, Loader2, Mic } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEVELOPMENT_MODE, ENVIRONMENT_CHECK_TIMING } from "@/config";

interface EnvironmentCheckProps {
  config: any;
  stream?: MediaStream | null;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function EnvironmentCheck({ config, stream, onSuccess, onCancel }: EnvironmentCheckProps) {
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [scanStatus, setScanStatus] = useState("Đang khởi tạo các kịch bản quét...");
  const [detectedApps, setDetectedApps] = useState<string[]>([]);
  const [isKilling, setIsKilling] = useState(false);

  // Mic check states
  const [envScanDone, setEnvScanDone] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [micAboveThreshold, setMicAboveThreshold] = useState(0); // seconds above threshold
  const MIC_THRESHOLD = 8; // volume threshold to consider "speaking"
  const MIC_REQUIRED_SECONDS = 2; // seconds of speech needed
  const audioRafRef = useRef<number>(0);

  // Environment scan
  useEffect(() => {
    let time = 0;
    const REQUIRED_TIME = ENVIRONMENT_CHECK_TIMING.REQUIRED_SCAN_TIME_MS;
    
    const interval = setInterval(async () => {
      let hwErr = "";
      
      if (window.electronAPI) {
        try {
          if (time === 1000) setScanStatus(ENVIRONMENT_CHECK_TIMING.SCAN_MESSAGES[1000] || "Scanning...");
          if (time === 2000) setScanStatus(ENVIRONMENT_CHECK_TIMING.SCAN_MESSAGES[2000] || "Analyzing...");
          if (time === 3000) setScanStatus(ENVIRONMENT_CHECK_TIMING.SCAN_MESSAGES[3000] || "Verifying...");
          if (time === 4000) setScanStatus(ENVIRONMENT_CHECK_TIMING.SCAN_MESSAGES[4000] || "Almost done...");
          
          if (window.electronAPI?.getScreenCount) {
             const cnt = await window.electronAPI.getScreenCount();
             if (cnt > 1) hwErr = `Phát hiện ${cnt} màn hình. Vui lòng ngắt kết nối màn hình phụ!`;
          }
          if (!hwErr && window.electronAPI?.getRunningBannedApps && config?.detectBannedApps) {
            const appsList = Array.isArray(config.bannedApps) ? config.bannedApps : [];
            if (appsList.length > 0) {
                const apps = await window.electronAPI.getRunningBannedApps(appsList);
                if (apps && apps.length > 0) {
                   hwErr = `Phát hiện phần mềm bị cấm chạy ngầm: ${apps.join(', ')}. Vui lòng tắt ngay!`;
                   setDetectedApps(apps);
                } else {
                   setDetectedApps([]);
                }
            } else {
                setDetectedApps([]);
            }
          }
        } catch (e) {
          hwErr = "Lỗi kết nối IPC để quét môi trường.";
        }
      }

      if (hwErr) {
        time = 0;
        setProgress(0);
        setErrorMsg(hwErr);
        setScanStatus("Phát hiện vi phạm! Vui lòng khắc phục...");
      } else {
        time += ENVIRONMENT_CHECK_TIMING.PROGRESS_INTERVAL_MS;
        setProgress((time / REQUIRED_TIME) * 100);
        setErrorMsg("");
        if (time >= REQUIRED_TIME) {
          clearInterval(interval);
          setScanStatus("Môi trường an toàn. Kiểm tra microphone...");
          setEnvScanDone(true);
        }
      }
    }, ENVIRONMENT_CHECK_TIMING.PROGRESS_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [config]);

  // No local stream (e.g. mobile camera relay only): skip mic gate and finish.
  useEffect(() => {
    if (envScanDone && !stream) {
      setScanStatus('Bỏ qua kiểm tra mic (không có luồng âm thanh cục bộ).');
      setIsDone(true);
    }
  }, [envScanDone, stream]);

  // Mic volume monitoring (starts after env scan done)
  useEffect(() => {
    if (!envScanDone || !stream) return;
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      // No audio track, skip mic check
      setIsDone(true);
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      microphone.connect(analyser);
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let aboveMs = 0;

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const currentVol = (sum / bufferLength) / 2.5;
        setMicVolume(currentVol);
        
        if (currentVol > MIC_THRESHOLD) {
          aboveMs += 16; // approximate RAF interval
          setMicAboveThreshold(aboveMs / 1000);
          if (aboveMs >= MIC_REQUIRED_SECONDS * 1000) {
            setScanStatus("Microphone hoạt động tốt!");
            setIsDone(true);
            return; // stop RAF
          }
        } else {
          // Don't reset, allow cumulative
        }
        
        audioRafRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      return () => {
        if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
        audioContext.close().catch(() => {});
      };
    } catch (e) {
      console.error("Mic check error:", e);
      // If mic check fails, skip it
      setIsDone(true);
    }
  }, [envScanDone, stream]);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onSuccess, ENVIRONMENT_CHECK_TIMING.SUCCESS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isDone, onSuccess]);

  const handleRetry = () => {
    setIsDone(false);
    setEnvScanDone(false);
    setErrorMsg("");
    setDetectedApps([]);
    setScanStatus("Đang khởi tạo các kịch bản quét...");
    setProgress(0);
    setMicAboveThreshold(0);
    setMicVolume(0);
  };

  const handleKillApps = async () => {
    if (!window.electronAPI?.killBannedApps || detectedApps.length === 0) return;
    setIsKilling(true);
    try {
      await window.electronAPI.killBannedApps(detectedApps);
      setScanStatus("Đã gửi lệnh tắt. Đang quét lại...");
      setTimeout(() => {
        setIsKilling(false);
        handleRetry();
      }, 1500);
    } catch (e) {
      setIsKilling(false);
      console.error('Failed to kill apps:', e);
    }
  };

  const micProgress = Math.min(100, (micAboveThreshold / MIC_REQUIRED_SECONDS) * 100);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background/90 p-4 relative z-50">
      <Card className="w-full max-w-7xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative pb-12">
        
        {/* Left Side: Security Animation */}
        <div className="md:w-3/5 bg-black relative flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/50 bg-gray-900 flex flex-col items-center justify-center">
             {errorMsg ? (
                <AlertTriangle className="h-16 w-16 text-destructive animate-pulse" />
             ) : isDone ? (
                <CheckCircle className="h-16 w-16 text-green-500 drop-shadow-lg" />
             ) : envScanDone ? (
                <Mic className="h-16 w-16 text-primary animate-pulse" />
             ) : (
                <ShieldAlert className="h-16 w-16 text-primary animate-pulse delay-150" />
             )}
             <p className={`font-mono mt-4 tracking-widest ${errorMsg ? 'text-destructive' : envScanDone ? 'text-blue-400' : 'text-primary'}`}>
                {errorMsg ? "VẬT CẢN" : envScanDone ? "MIC CHECK" : "SECURE ENVIRONMENT"}
             </p>
             <div className="absolute inset-0 bg-blue-500/10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
          </div>
        </div>

        {/* Right Side: Information & Settings */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Monitor className="h-6 w-6 text-primary" />
                {envScanDone ? "Kiểm tra Microphone" : "Quét môi trường phòng thi"}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {envScanDone 
                  ? "Nói gì đó vài giây để xác nhận microphone hoạt động tốt." 
                  : "Quét cấp quyền hệ thống sâu để đảm bảo tính công bằng (Không màn hình phụ, Không phần mềm cấm)."}
              </p>
            </div>

            <div className={`p-8 rounded-xl border-2 flex flex-col items-center text-center justify-center space-y-4 transition-colors duration-500
              ${errorMsg ? "bg-destructive/10 border-destructive" : (isDone ? "bg-green-500/10 border-green-500" : envScanDone ? "bg-blue-500/10 border-blue-500/50" : "bg-muted border-primary/20")}`}>
              
              <p className={`text-sm font-semibold ${errorMsg ? "text-destructive" : (isDone ? "text-green-600" : "text-foreground")}`}>
                {errorMsg || scanStatus}
              </p>

              {envScanDone && !isDone && (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2 justify-center">
                    <Mic className={`w-5 h-5 ${micVolume > MIC_THRESHOLD ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
                    <div className="flex-1 max-w-[200px]">
                      <Progress value={Math.min(100, micVolume * 2)} className={`h-3 ${micVolume > MIC_THRESHOLD ? '[&>div]:bg-green-500' : '[&>div]:bg-blue-500'}`} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {micAboveThreshold > 0 
                      ? `Đã ghi nhận ${micAboveThreshold.toFixed(1)}s/${MIC_REQUIRED_SECONDS}s`
                      : "Hãy nói gì đó..."}
                  </p>
                </div>
              )}
            </div>
            
            {!envScanDone && (
              <div className="space-y-2">
                 <div className="flex justify-between text-xs text-muted-foreground mr-1">
                    <span className="flex items-center gap-2 font-medium">
                       {!isDone && !errorMsg && <Loader2 className="w-3 h-3 animate-spin text-primary"/>}
                       Tiến trình rà soát
                    </span>
                    <span>{Math.floor(progress)}%</span>
                 </div>
                 <Progress value={progress} className={`h-2 transition-all duration-300 ${isDone ? "[&>div]:bg-green-500" : (errorMsg ? "[&>div]:bg-destructive" : "")}`} />
              </div>
            )}

            {envScanDone && !isDone && (
              <div className="space-y-2">
                 <div className="flex justify-between text-xs text-muted-foreground mr-1">
                    <span className="flex items-center gap-2 font-medium">
                       <Loader2 className="w-3 h-3 animate-spin text-blue-500"/>
                       Kiểm tra mic
                    </span>
                    <span>{Math.floor(micProgress)}%</span>
                 </div>
                 <Progress value={micProgress} className="h-2 transition-all duration-300 [&>div]:bg-blue-500" />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t">
            {errorMsg && detectedApps.length > 0 && window.electronAPI?.killBannedApps && (
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={handleKillApps}
                disabled={isKilling}
              >
                {isKilling ? "Đang tắt..." : `⚠ Tắt ngay (${detectedApps.length} app)`}
              </Button>
            )}
            {errorMsg && (
              <Button variant="outline" className="flex-1" onClick={handleRetry}>
                Thử lại
              </Button>
            )}
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isDone}>
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
            <Button className="flex-1" disabled={!isDone}>
              {isDone ? "Hoàn thành. Vào phòng thi ngay!" : (envScanDone ? "Đang kiểm tra mic..." : "Đang kiểm tra môi trường...")}
            </Button>
          </div>
        </div>

        {/* Global Footer Mic Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 flex items-center px-4 gap-3 border-t border-white/10 z-50">
          <Mic className={`w-5 h-5 ${micVolume > MIC_THRESHOLD ? 'text-green-400' : 'text-gray-500'}`} />
          <Progress value={Math.min(100, micVolume * 2)} className={`h-2 flex-1 bg-gray-800 ${micVolume > MIC_THRESHOLD ? '[&>div]:bg-green-500' : '[&>div]:bg-gray-600'}`} />
          {envScanDone && <span className="text-xs text-gray-400 font-mono ml-2">{micAboveThreshold.toFixed(1)}s</span>}
        </div>

      </Card>
    </div>
  );
}
