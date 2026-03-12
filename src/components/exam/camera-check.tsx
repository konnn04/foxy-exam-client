import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Video, VideoOff, CheckCircle, AlertTriangle, Mic } from "lucide-react";
import { DEV_MODE } from "@/config/app";

interface CameraCheckProps {
  onConfirm: (stream: MediaStream) => void;
  onSkip?: () => void;
}

export function CameraCheck({ onConfirm, onSkip }: CameraCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [volume, setVolume] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Use Electron's native fullscreen if available
        if (window.electronAPI?.setFullScreen && !DEV_MODE) {
          window.electronAPI.setFullScreen(true);
        } else if (!document.fullscreenElement && !DEV_MODE) {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.electronAPI?.setAlwaysOnTop && !DEV_MODE) {
          window.electronAPI.setAlwaysOnTop(true);
        }
      } catch (e) {}
    };
    initApp();

    // Retry fullscreen on first user click if it wasn't acquired
    const retryFullscreen = async () => {
      if (!document.fullscreenElement && !DEV_MODE) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (e) {}
      }
      document.removeEventListener('click', retryFullscreen);
    };
    if (!DEV_MODE) {
      document.addEventListener('click', retryFullscreen, { once: true });
    }

    (async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        
        const vDevices = allDevices.filter((d) => d.kind === "videoinput");
        setVideoDevices(vDevices);
        if (vDevices.length > 0) setSelectedVideoId(vDevices[0].deviceId);

        const aDevices = allDevices.filter((d) => d.kind === "audioinput");
        setAudioDevices(aDevices);
        if (aDevices.length > 0) setSelectedAudioId(aDevices[0].deviceId);
      } catch {
        setError("Không thể truy cập camera hoặc microphone. Vui lòng cấp quyền cho ứng dụng.");
      }
    })();

    return () => {
      document.removeEventListener('click', retryFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!selectedVideoId) return;

    let cancelled = false;

    (async () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraReady(false);
      setError(null);

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: selectedVideoId },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : false,
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) {
          setError("Không thể mở camera đã chọn. Vui lòng thử camera khác.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, selectedAudioId]);

  // Audio Visualizer
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
        setVolume((sum / bufferLength) / 2.5); // Normalize to 0-100 approx
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

  useEffect(() => {
    return () => {
    };
  }, []);

  const handleConfirm = () => {
    if (stream) {
      onConfirm(stream);
    }
  };

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
            {!stream && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60" style={{ zIndex: 10 }}>
                <VideoOff className="h-12 w-12" />
              </div>
            )}
            {cameraReady && (
              <div className="absolute top-2 right-2" style={{ zIndex: 10 }}>
                <CheckCircle className="h-6 w-6 text-green-500 drop-shadow-lg" />
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Information & Settings */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Video className="h-6 w-6 text-primary" />
                Bước 1: Kiểm tra phần mềm & cứng
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Vui lòng chọn thiết bị thu hình, âm thanh dự phòng và xác nhận tín hiệu tốt. Bạn có thể kiểm tra âm lượng thanh Mic ở biên dưới.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {videoDevices.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Video className="w-4 h-4" /> Camera
                  </label>
                  <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {videoDevices.map((device, idx) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${idx + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {audioDevices.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Mic className="w-4 h-4" /> Microphone
                  </label>
                  <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn mic" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioDevices.map((device, idx) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Mic ${idx + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 border-t pt-4">
            {onSkip && (
              <Button variant="outline" className="flex-1" onClick={onSkip}>
                Bỏ qua
              </Button>
            )}
            {DEV_MODE && (
              <Button 
                variant="outline" 
                className="flex-1 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={() => {
                  if (navigator.mediaDevices) {
                      const canvas = document.createElement('canvas');
                      const ms = canvas.captureStream();
                      onConfirm(ms);
                  }
                }}
              >
                [Dev] Bỏ qua
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!cameraReady}
              onClick={handleConfirm}
            >
              {cameraReady ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Xác nhận & Bắt đầu
                </>
              ) : (
                "Đang chờ camera..."
              )}
            </Button>
          </div>
        </div>

        {/* Global Footer Mic Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/80 flex items-center px-4 gap-3 border-t border-white/10 z-50">
          <Mic className={`w-5 h-5 ${volume > 5 ? 'text-green-400' : 'text-gray-400'}`} />
          <Progress value={Math.min(100, volume)} className="h-2 flex-1 [&>div]:bg-green-500 bg-gray-700" />
        </div>
      </Card>
    </div>
  );
}
