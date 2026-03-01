import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Video, VideoOff, CheckCircle, AlertTriangle } from "lucide-react";

interface CameraCheckProps {
  onConfirm: (stream: MediaStream) => void;
  onSkip?: () => void;
}

export function CameraCheck({ onConfirm, onSkip }: CameraCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch {
        setError("Không thể truy cập camera. Vui lòng cấp quyền camera cho ứng dụng.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;

    let cancelled = false;

    (async () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraReady(false);
      setError(null);

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
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
  }, [selectedDeviceId]);

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
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl flex items-center justify-center gap-2">
            <Video className="h-5 w-5" />
            Kiểm tra camera
          </CardTitle>
          <CardDescription>
            Vui lòng chọn camera và xác nhận trước khi bắt đầu làm bài thi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {}
          {devices.length > 0 && (
            <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn camera" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device, idx) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${idx + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-black border">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!stream && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <VideoOff className="h-12 w-12" />
              </div>
            )}
            {cameraReady && (
              <div className="absolute top-2 right-2">
                <CheckCircle className="h-6 w-6 text-green-500 drop-shadow-lg" />
              </div>
            )}
          </div>

          {}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {}
          <div className="flex gap-3">
            {onSkip && (
              <Button variant="outline" className="flex-1" onClick={onSkip}>
                Bỏ qua
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
        </CardContent>
      </Card>
    </div>
  );
}
