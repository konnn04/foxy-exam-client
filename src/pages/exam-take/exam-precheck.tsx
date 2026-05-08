import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CameraFaceAuthCheck } from "@/components/exam/camera-face-auth-check";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import { CAMERA_CAPTURE_MAX_FPS } from "@/config/detection.config";
import {
  acquireFaceLandmarker, releaseFaceLandmarker,
} from "@/lib/mediapipe-service";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { ExamTrackingConfig, ExamData } from "@/types/exam";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { livekitPublisher } from "@/lib/livekit-publisher";
import {
  Shield, Camera, Monitor, Mic, Eye, ScanFace, Ban, Box, Fingerprint,
  AppWindow, LayoutGrid, Video, Check, ChevronRight, ChevronLeft,
  RefreshCw, AlertTriangle, Loader2, Wifi,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExamPrecheckProps {
  examId: string;
  attemptId: string;
  onComplete: (
    cameraStream: MediaStream | null,
    screenStream: MediaStream | null,
    config: ExamTrackingConfig,
    proctorConfig: any,
    opts?: { mobileRelayOnly?: boolean },
  ) => void;
}

type WizardStep = "loading" | "info" | "camera" | "mediapipe" | "faceauth" | "liveness" | "environment";

interface EnvCheckItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "pending" | "checking" | "pass" | "fail";
  detail?: string;
}

// ── Config Row icon map ─────────────────────────────────────────────────────

const CONFIG_ITEMS: { key: keyof ExamTrackingConfig; icon: React.ComponentType<{ className?: string }>; label: string; desc: string }[] = [
  { key: "requireApp", icon: AppWindow, label: "Ứng dụng Desktop", desc: "Bắt buộc dùng app, không hỗ trợ trình duyệt" },
  { key: "requireCamera", icon: Camera, label: "Webcam", desc: "Ghi hình + phân tích cử chỉ qua camera" },
  { key: "requireScreenShare", icon: Monitor, label: "Chia sẻ màn hình", desc: "Toàn bộ màn hình được ghi hình giám sát" },
  { key: "noMultiMonitor", icon: LayoutGrid, label: "Cấm đa màn hình", desc: "Phải ngắt màn hình phụ để vào thi" },
  { key: "monitorGaze", icon: Eye, label: "Theo dõi ánh mắt", desc: "AI cảnh báo khi nhìn ra ngoài quá lâu" },
  { key: "requireMic", icon: Mic, label: "Microphone", desc: "Ghi âm phòng thi, phát hiện tiếng nói" },
  { key: "requireFaceAuth", icon: ScanFace, label: "Xác minh khuôn mặt", desc: "AI khớp mặt với ảnh hồ sơ" },
  { key: "detectBannedApps", icon: Ban, label: "Phát hiện app cấm", desc: "Quét và ngăn phần mềm gian lận" },
  { key: "detectBannedObjects", icon: Box, label: "Phát hiện vật thể cấm", desc: "AI phát hiện điện thoại, tai nghe..." },
  { key: "lockDevice", icon: Fingerprint, label: "Khóa thiết bị", desc: "Ngăn đổi máy giữa phiên thi" },
];

// ── Step definition ─────────────────────────────────────────────────────────

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "info", label: "Thông tin" },
  { key: "camera", label: "Camera & Mic" },
  { key: "mediapipe", label: "Khởi tạo AI" },
  { key: "faceauth", label: "Xác minh" },
  { key: "liveness", label: "Độ sống" },
  { key: "environment", label: "Môi trường" },
];

const STEP_ORDER: WizardStep[] = ["loading", "info", "camera", "mediapipe", "faceauth", "liveness", "environment"];

// ── Helpers ────────────────────────────────────────────────────────────────

function usesCamera(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireCamera || c.requireFaceAuth || c.monitorGaze || c.detectBannedObjects;
}
function usesScreen(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireScreenShare || c.detectBannedApps;
}
function needsLiveKit(c: ExamTrackingConfig) {
  return c.level === "strict" || c.requireCamera || c.requireMic || c.requireScreenShare
    || c.requireDualCamera || c.monitorGaze || c.detectBannedObjects || c.detectBannedApps;
}

// ── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current, done }: { current: WizardStep; done: Set<WizardStep> }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      {STEPS.map((s, i) => {
        const isDone = done.has(s.key);
        const isCurrent = s.key === current;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
              ${isCurrent ? "bg-primary text-primary-foreground shadow" : ""}
              ${isDone && !isCurrent ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : ""}
              ${!isDone && !isCurrent ? "bg-muted text-muted-foreground" : ""}
            `}>
              {isDone ? <Check className="h-3 w-3" /> : <span className="text-[10px] w-3 text-center">{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Step: Loading ───────────────────────────────────────────────────────────

function LoadingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Đang tải cấu hình bài thi...</p>
    </div>
  );
}

// ── Step: Info ──────────────────────────────────────────────────────────────

function InfoStep({
  examData, config, proctorConfig, onContinue, onBack,
}: {
  examData: ExamData;
  config: ExamTrackingConfig;
  proctorConfig: any;
  onContinue: () => void;
  onBack: () => void;
}) {
  const exam = examData.exam;
  const activeItems = CONFIG_ITEMS.filter((item) => {
    const v = config[item.key];
    if (typeof v === "boolean") return v;
    return false;
  });

  const camCfg = proctorConfig?.client_stream?.camera;
  const scrCfg = proctorConfig?.client_stream?.screen;

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div>
        <h2 className="text-lg font-bold">{exam.name ?? exam.title ?? "Bài thi"}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {exam.duration ?? exam.duration_minutes} phút
          {camCfg && ` · Cam ${camCfg.height}p ${camCfg.fps}fps`}
          {scrCfg && ` · Màn hình ${scrCfg.height}p ${scrCfg.fps}fps`}
        </p>
      </div>

      {config.level !== "none" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
          <Shield className="h-4 w-4" />
          Mức giám sát: {config.level === "strict" ? "Nghiêm ngặt" : config.level === "standard" ? "Tiêu chuẩn" : "Tùy chỉnh"}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Yêu cầu bài thi ({activeItems.length})
        </p>
        {activeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Không có yêu cầu giám sát đặc biệt.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {activeItems.map(({ key, icon: Icon, label, desc }) => (
              <div key={key} className="flex items-start gap-2.5 rounded-lg border p-2.5 text-sm">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-xs">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        <Button onClick={onContinue} className="flex-1">Bắt đầu kiểm tra<ChevronRight className="h-4 w-4 ml-1" /></Button>
      </div>
    </div>
  );
}

// ── Step: Camera & Mic ─────────────────────────────────────────────────────

function CameraMicStep({
  config, onConfirm, onBack,
}: {
  config: ExamTrackingConfig;
  onConfirm: (stream: MediaStream) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [resolution, setResolution] = useState("");
  const [fps, setFps] = useState(0);
  const rafRef = useRef<number>(0);
  const needsMic = config.requireMic || config.level === "strict";

  const enumerate = useCallback(async () => {
    setError(null);
    try {
      // Request permission first
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((d) => d.kind === "videoinput");
      const audios = all.filter((d) => d.kind === "audioinput");
      setVideoDevices(vids);
      setAudioDevices(audios);
      // Auto-select first device if none selected
      setSelectedVideoId((prev) => prev || (vids[0]?.deviceId ?? ""));
      setSelectedAudioId((prev) => prev || (audios[0]?.deviceId ?? ""));
    } catch {
      setError("Không thể truy cập thiết bị. Kiểm tra quyền camera/mic.");
    }
  }, []);

  // Init
  useEffect(() => { enumerate(); }, [enumerate]);

  // Start selected camera
  useEffect(() => {
    if (!selectedVideoId) return;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); }

    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedVideoId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: CAMERA_CAPTURE_MAX_FPS, max: CAMERA_CAPTURE_MAX_FPS },
          },
          audio: needsMic && selectedAudioId ? { deviceId: { exact: selectedAudioId } } : false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);

        const vt = s.getVideoTracks()[0];
        const settings = vt?.getSettings?.();
        if (settings) {
          setResolution(`${settings.width}x${settings.height}`);
          setFps(Math.round(settings.frameRate ?? 0));
        }
      } catch {
        if (!cancelled) setError("Không thể mở camera đã chọn.");
      }
    })();
    return () => { cancelled = true; };
  }, [selectedVideoId, selectedAudioId, needsMic]);

  // Video preview
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Volume meter
  useEffect(() => {
    if (!stream || !needsMic) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(buf);
        setVolume(buf.reduce((a, b) => a + b, 0) / buf.length / 2.5);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      return () => { cancelAnimationFrame(rafRef.current); ctx.close().catch(() => {}); };
    } catch { /* ignore */ }
  }, [stream, needsMic]);

  const canProceed = !!stream;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Camera preview */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertTriangle className="h-10 w-10" />
            <p className="text-sm px-4 text-center">{error}</p>
          </div>
        ) : stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Video className="h-10 w-10 opacity-40" />
            <p className="text-sm">Chọn camera để bắt đầu</p>
          </div>
        )}
        {/* Resolution badge */}
        {resolution && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] bg-black/60 text-white border-0">
            {resolution} · {fps}fps
          </Badge>
        )}
      </div>

      {/* Device selects */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Camera className="h-3 w-3" />Camera
          </label>
          <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Chọn camera..." />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Mic className="h-3 w-3" />{needsMic ? "Microphone (bắt buộc)" : "Microphone"}
          </label>
          <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Chọn mic..." />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mic volume bar */}
      {needsMic && (
        <div className="flex items-center gap-2">
          <Mic className={`h-4 w-4 ${volume > 5 ? "text-emerald-500" : "text-muted-foreground"}`} />
          <Progress value={Math.min(volume * 10, 100)} className="h-1.5 flex-1" />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={enumerate}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Làm mới thiết bị
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
          <Button disabled={!canProceed} onClick={() => stream && onConfirm(stream)}>
            Tiếp tục<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step: MediaPipe Warmup ──────────────────────────────────────────────────

function MediaPipeStep({
  stream, onDone, onBack,
}: {
  stream: MediaStream;
  onDone: () => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"init" | "testing" | "done">("init");
  const [progress, setProgress] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const landRef = useRef<FaceLandmarker | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastInferAtRef = useRef(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        landRef.current = await acquireFaceLandmarker({ blendshapes: true });
        if (!active) return;
        setStatus("testing");

        const video = videoRef.current!;
        const start = performance.now();
        let lastTime = -1;

        const loop = () => {
          if (!active || !landRef.current) return;
          const elapsed = performance.now() - start;
          setProgress(Math.min((elapsed / 3000) * 100, 100));

          const now = performance.now();
          const MIN_FRAME_INTERVAL_MS = 200; // ~5fps to reduce CPU usage
          const canInfer = (now - lastInferAtRef.current) >= MIN_FRAME_INTERVAL_MS;

          if (video.currentTime !== lastTime && video.videoWidth > 0) {
            lastTime = video.currentTime;
            if (canInfer) {
              lastInferAtRef.current = now;
              const r = landRef.current.detectForVideo(video, now);
              setFaceCount(r.faceLandmarks?.length ?? 0);
            }
          }

          if (elapsed >= 3000) {
            setStatus("done");
            setTimeout(() => onDoneRef.current(), 600);
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch {
        if (active) setStatus("done");
      }
    })();
    return () => {
      active = false;
      landRef.current = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, []); // stable: onDoneRef used instead

  return (
    <div className="max-w-xl mx-auto space-y-5 text-center">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-80" />
        {faceCount > 0 && (
          <Badge className="absolute top-2 right-2 bg-emerald-600 text-[10px]">
            {faceCount} mặt
          </Badge>
        )}
      </div>

      <div>
        <h3 className="font-semibold">
          {status === "init" && "Đang khởi tạo mô hình AI..."}
          {status === "testing" && "Đang kiểm tra độ ổn định camera..."}
          {status === "done" && "Camera hoạt động ổn định!"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {status === "init" && "Tải mô hình nhận diện khuôn mặt (~10MB). Chỉ chạy một lần."}
          {status === "testing" && "Giữ yên, nhìn thẳng vào camera trong 3 giây."}
          {status === "done" && "Sẵn sàng cho bước tiếp theo."}
        </p>
      </div>

      <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />
    </div>
  );
}

// ── Step: Liveness (flash test) ──────────────────────────────────────────────

const FLASH_SEQUENCE = [
  { color: "#ff4444", label: "Đỏ", ms: 400 },
  { color: "#4444ff", label: "Xanh", ms: 400 },
  { color: "#44ff44", label: "Lục", ms: 400 },
];

function LivenessStep({
  stream, onDone, onBack,
}: {
  stream: MediaStream;
  onDone: () => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"face" | "flash" | "done">("face");
  const [flashIdx, setFlashIdx] = useState(-1);
  const [flashColor, setFlashColor] = useState("transparent");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const lastInferAtRef = useRef(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Phase 1: detect face
  useEffect(() => {
    if (phase !== "face") return;
    let active = true;
    let land: FaceLandmarker | null = null;
    (async () => {
      try {
        land = await acquireFaceLandmarker({ blendshapes: true });
        if (!active) return;
        let lastTime = -1;
        const loop = () => {
          if (!active || !land) return;
          const v = videoRef.current!;
          const now = performance.now();
          const MIN_FRAME_INTERVAL_MS = 200; // ~5fps is enough for face presence check
          const canInfer = (now - lastInferAtRef.current) >= MIN_FRAME_INTERVAL_MS;
          if (v.currentTime !== lastTime && v.videoWidth > 0) {
            lastTime = v.currentTime;
            if (canInfer) {
              lastInferAtRef.current = now;
              const r = land.detectForVideo(v, now);
              if (r.faceLandmarks?.length) {
                setPhase("flash");
                return;
              }
            }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch { /* ignore */ }
    })();
    return () => {
      active = false;
      land = null;
      releaseFaceLandmarker({ blendshapes: true });
    };
  }, [phase]);

  // Phase 2: flash sequence
  useEffect(() => {
    if (phase !== "flash") return;
    let active = true;
    let i = 0;
    const run = () => {
      if (!active) return;
      if (i >= FLASH_SEQUENCE.length) {
        setFlashColor("transparent");
        setFlashIdx(-1);
        setPhase("done");
        setTimeout(() => onDoneRef.current(), 600);
        return;
      }
      const f = FLASH_SEQUENCE[i];
      setFlashIdx(i);
      setFlashColor(f.color);
      i++;
      setTimeout(run, f.ms + 100);
    };
    run();
    return () => { active = false; };
  }, [phase]);

  return (
    <div className="max-w-xl mx-auto space-y-4 text-center">
      {/* Full-screen flash so camera receives strong ambient color change for spoof detection */}
      {phase === "flash" && flashColor !== "transparent" && (
        <div
          className="fixed inset-0 z-40 pointer-events-none transition-colors duration-75"
          style={{ backgroundColor: flashColor, opacity: 1 }}
        />
      )}

      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>

      <div>
        <h3 className="font-semibold">
          {phase === "face" && "Nhìn thẳng vào camera..."}
          {phase === "flash" && `Đang kiểm tra — ${FLASH_SEQUENCE[flashIdx]?.label ?? ""}`}
          {phase === "done" && "Xác nhận camera thật!"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {phase === "face" && "Giữ mặt trong khung. Màn hình sẽ nháy màu để kiểm tra camera thật."}
          {phase === "flash" && "Giữ yên, không di chuyển. Camera đang phản chiếu màu sắc."}
          {phase === "done" && "Đang chuyển bước tiếp theo..."}
        </p>
      </div>
    </div>
  );
}

// ── Step: Environment ───────────────────────────────────────────────────────

function EnvironmentStep({
  config, stream, onSuccess, onBack,
}: {
  config: ExamTrackingConfig;
  stream: MediaStream | null;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [checks, setChecks] = useState<EnvCheckItem[]>([
    { key: "multiscreen", label: "Kiểm tra đa màn hình", icon: Monitor, status: "pending" },
    { key: "bannedapps", label: "Quét ứng dụng cấm", icon: Ban, status: "pending" },
    { key: "network", label: "Kiểm tra kết nối mạng", icon: Wifi, status: "pending" },
    { key: "mic", label: "Kiểm tra microphone", icon: Mic, status: "pending" },
  ]);
  const [allDone, setAllDone] = useState(false);

  // Run checks sequentially
  useEffect(() => {
    if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_ENVIRONMENT_CHECK) {
      setChecks((prev) => prev.map((c) => ({ ...c, status: "pass" as const })));
      setTimeout(() => setAllDone(true), 400);
      return;
    }

    const run = async () => {
      // 1. Multi-screen
      setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 500));
      try {
        if (config.noMultiMonitor && window.electronAPI?.getScreenCount) {
          const cnt = await window.electronAPI.getScreenCount();
          if (cnt > 1) {
            setChecks((prev) => prev.map((c) => c.key === "multiscreen"
              ? { ...c, status: "fail", detail: `Phát hiện ${cnt} màn hình. Vui lòng ngắt màn hình phụ!` } : c));
            return;
          }
        }
        setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "pass" } : c));
      } catch {
        setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "pass" } : c));
      }

      // 2. Banned apps
      setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 800));
      try {
        if ((config.detectBannedApps || config.level === "strict") && window.electronAPI?.getRunningBannedApps) {
          const list = Array.isArray(config.bannedApps) ? config.bannedApps : [];
          const wl = Array.isArray(config.bannedAppsWhitelist) ? config.bannedAppsWhitelist : [];
          if (list.length > 0) {
            const found = await window.electronAPI.getRunningBannedApps(list, wl);
            if (found?.length) {
              setChecks((prev) => prev.map((c) => c.key === "bannedapps"
                ? { ...c, status: "fail", detail: `Phát hiện: ${found.join(", ")}` } : c));
              return;
            }
          }
        }
        setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
      } catch {
        setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
      }

      // 3. Network
      setChecks((prev) => prev.map((c) => c.key === "network" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 600));
      setChecks((prev) => prev.map((c) => c.key === "network"
        ? { ...c, status: navigator.onLine ? "pass" : "fail", detail: navigator.onLine ? undefined : "Không có kết nối mạng" } : c));

      // 4. Mic
      setChecks((prev) => prev.map((c) => c.key === "mic" ? { ...c, status: "checking" } : c));
      if (!stream || stream.getAudioTracks().length === 0) {
        setChecks((prev) => prev.map((c) => c.key === "mic"
          ? { ...c, status: config.requireMic ? "fail" : "pass", detail: config.requireMic ? "Không phát hiện microphone" : "Bỏ qua (không bắt buộc)" } : c));
      } else {
        await new Promise((r) => setTimeout(r, 400));
        setChecks((prev) => prev.map((c) => c.key === "mic" ? { ...c, status: "pass" } : c));
      }

      setAllDone(true);
    };
    run();
  }, [config, stream]);

  const hasFail = checks.some((c) => c.status === "fail");
  const failItem = checks.find((c) => c.status === "fail");

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.key} className={`
            flex items-center gap-3 rounded-lg border p-3 transition-all
            ${c.status === "checking" ? "border-primary/30 bg-primary/5" : ""}
            ${c.status === "pass" ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
            ${c.status === "fail" ? "border-destructive/50 bg-destructive/10" : ""}
          `}>
            {c.status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
            {c.status === "pass" && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
            {c.status === "fail" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
            {c.status === "pending" && <c.icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${c.status === "fail" ? "text-destructive" : ""}`}>{c.label}</p>
              {c.detail && <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {allDone && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
          {hasFail ? (
            <Button variant="destructive" className="flex-1" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-1" />Thử lại
            </Button>
          ) : (
            <Button onClick={onSuccess} className="flex-1">
              <Check className="h-4 w-4 mr-1" />Vào thi
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────────────

export function ExamPrecheck({ examId, attemptId, onComplete }: ExamPrecheckProps) {
  const navigate = useNavigate();
  const toast = useToastCustom();
  const [step, setStep] = useState<WizardStep>("loading");
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [config, setConfig] = useState<ExamTrackingConfig | null>(null);
  const [proctorConfig, setProctorConfig] = useState<any>(null);
  const [configError, setConfigError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [doneSteps, setDoneSteps] = useState<Set<WizardStep>>(new Set(["loading"]));
  const [isJoiningSupervisor, setIsJoiningSupervisor] = useState(false);

  // ── Load config (early check) ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [examRes, proctorRes] = await Promise.allSettled([
          api.get(`/student/exams/${examId}/take/${attemptId}?page=1`),
          api.get(`/student/exams/${examId}/proctor/config`),
        ]);

        const d: ExamData = examRes.status === "fulfilled" ? examRes.value.data : null;
        if (!d) { setConfigError("Không tải được dữ liệu bài thi."); return; }
        setExamData(d);

        if (proctorRes.status === "fulfilled") setProctorConfig(proctorRes.value.data);

        const cfg = d.config || { level: "none" };
        setConfig(cfg);

        // ── Early checks ───────────────────────────────────────────
        const isElectron = window.electronAPI?.isElectron === true;

        if ((cfg.level === "strict" || cfg.requireApp) && !isElectron) {
          setConfigError("Bài thi yêu cầu Ứng dụng Desktop. Vui lòng mở bằng Foxy Exam App.");
          return;
        }

        if ((cfg.level === "strict" || cfg.requireApp) && isElectron && window.electronAPI?.getSystemInfo) {
          const sys = await window.electronAPI.getSystemInfo();
          const ok = (sys.platform === "win32" && parseFloat(sys.release) >= 10)
            || sys.platform === "darwin"
            || (sys.platform === "linux" && sys.sessionType?.toLowerCase() === "x11");
          if (!ok) {
            setConfigError(`Hệ điều hành không hỗ trợ (${sys.platform}). Cần Windows 10+, macOS hoặc Linux X11.`);
            return;
          }
        }

        // Skip camera steps if not needed
        if (!usesCamera(cfg) && !usesScreen(cfg)) {
          completeAfterSupervisorReady(null, null, cfg);
          return;
        }

        setStep("info");
      } catch {
        setConfigError("Không thể tải cấu hình. Vui lòng thử lại.");
      }
    })();
  }, []);

  // ── Supervisor connection ──────────────────────────────────────────
  const completeAfterSupervisorReady = useCallback(async (
    camStream: MediaStream | null,
    screenStream: MediaStream | null,
    cfg: ExamTrackingConfig,
  ) => {
    if (!needsLiveKit(cfg)) {
      onComplete(camStream, screenStream, cfg, proctorConfig);
      return;
    }
    setIsJoiningSupervisor(true);
    try {
      const ok = await livekitPublisher.ensureConnected({
        examId: Number(examId),
        attemptId: Number(attemptId),
        onError: (msg) => toast.error(msg),
      });
      if (!ok) {
        toast.error("Không thể kết nối giám sát AI.");
        return;
      }
      onComplete(camStream, screenStream, cfg, proctorConfig);
    } finally {
      setIsJoiningSupervisor(false);
    }
  }, [examId, attemptId, onComplete, proctorConfig, toast]);

  // ── Screen capture ─────────────────────────────────────────────────
  const startScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getDisplayMedia) return null;
    try {
      const fps = proctorConfig?.client_stream?.screen?.fps || 5;
      const height = proctorConfig?.client_stream?.screen?.height || 1080;

      if (window.electronAPI?.getScreenSourceId) {
        const displayInfo = await window.electronAPI.getDisplayId?.();
        for (let i = 0; i < 3; i++) {
          const sourceId = await window.electronAPI.getScreenSourceId(displayInfo?.id);
          if (sourceId) {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxFrameRate: fps } } as any,
              });
            } catch { /* fall through */ }
          }
          await new Promise((r) => setTimeout(r, 180));
        }
      }

      return await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: { ideal: fps }, height: { ideal: height } },
        audio: false,
      } as any);
    } catch {
      toast.error("Cần cấp quyền chia sẻ màn hình để vào thi.");
      return null;
    }
  }, [proctorConfig, toast]);

  // ── Step navigation ────────────────────────────────────────────────
  const markDone = (s: WizardStep) => setDoneSteps((prev) => new Set([...prev, s]));

  const skipIfNotNeeded = (targetStep: WizardStep, cfg: ExamTrackingConfig) => {
    if (targetStep === "camera" && !usesCamera(cfg)) return "info";
    if (targetStep === "mediapipe" && !usesCamera(cfg)) return "camera";
    if (targetStep === "faceauth" && !cfg.requireFaceAuth) return "mediapipe";
    return targetStep;
  };

  // ── Visible steps (must be before any conditional returns) ──────
  const visibleSteps = useMemo(() => {
    if (!config) return STEPS;
    return STEPS.filter((s) => {
      if (s.key === "camera" || s.key === "mediapipe") return usesCamera(config);
      if (s.key === "faceauth") return config.requireFaceAuth;
      return true;
    });
  }, [config]);

  // ── Render ──────────────────────────────────────────────────────────
  if (configError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
        <Shield className="mb-4 h-16 w-16 text-destructive" />
        <h2 className="mb-2 text-xl font-bold text-destructive">Không đủ điều kiện</h2>
        <p className="max-w-md text-center text-muted-foreground">{configError}</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
          Về trang chủ
        </Button>
      </div>
    );
  }

  if (isJoiningSupervisor) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Đang kết nối hệ thống giám sát...</p>
      </div>
    );
  }

  if (step === "loading") return <div className="flex h-screen items-center justify-center"><LoadingStep /></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold">{examData?.exam?.name ?? examData?.exam?.title ?? "Bài thi"}</h1>
            <p className="text-[11px] text-muted-foreground">Kiểm tra môi trường trước khi vào thi</p>
          </div>
          <StepIndicator current={step} done={doneSteps} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-2xl">
          {step === "info" && config && examData && (
            <InfoStep
              examData={examData}
              config={config}
              proctorConfig={proctorConfig}
              onContinue={() => {
                markDone("info");
                setStep(skipIfNotNeeded("camera", config));
              }}
              onBack={() => navigate("/dashboard")}
            />
          )}

          {step === "camera" && config && (
            <CameraMicStep
              config={config}
              onConfirm={(stream) => {
                setCameraStream(stream);
                markDone("camera");
                setStep(skipIfNotNeeded("mediapipe", config));
              }}
              onBack={() => setStep("info")}
            />
          )}

          {step === "mediapipe" && cameraStream && (
            <MediaPipeStep
              stream={cameraStream}
              onDone={() => {
                markDone("mediapipe");
                setStep(skipIfNotNeeded("faceauth", config!));
              }}
              onBack={() => setStep("camera")}
            />
          )}

          {step === "faceauth" && cameraStream && (
            <CameraFaceAuthCheck
              examId={examId}
              stream={cameraStream}
              onSuccess={() => {
                markDone("faceauth");
                setStep("liveness");
              }}
              onCancel={() => navigate("/dashboard")}
            />
          )}

          {step === "liveness" && cameraStream && (
            <LivenessStep
              stream={cameraStream}
              onDone={() => {
                markDone("liveness");
                setStep("environment");
              }}
              onBack={() => setStep(skipIfNotNeeded("faceauth", config!))}
            />
          )}

          {step === "environment" && config && (
            <EnvironmentStep
              config={config}
              stream={cameraStream}
              onSuccess={async () => {
                markDone("environment");
                const needsScreen = usesScreen(config);
                if (needsScreen) {
                  const screenStream = await startScreenCapture();
                  if (!screenStream) return;
                  await completeAfterSupervisorReady(cameraStream, screenStream, config);
                } else {
                  await completeAfterSupervisorReady(cameraStream, null, config);
                }
              }}
              onBack={() => setStep("liveness")}
            />
          )}
        </div>
      </main>

      {/* ── DEV MODE: jump steps (hidden in production) ─────────── */}
      {DEVELOPMENT_MODE.ENABLED && (
        <div className="fixed bottom-3 right-3 z-50 bg-background border rounded-lg p-2 shadow-lg">
          <p className="text-[9px] text-muted-foreground mb-1.5 uppercase tracking-wider text-center font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5">
            ⚠ DEV MODE
          </p>
          <div className="flex gap-1">
            {visibleSteps.map((s) => (
              <Badge
                key={s.key}
                variant={step === s.key ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setStep(s.key as WizardStep)}
              >
                {s.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
