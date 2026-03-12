import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Volume2, CheckCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DEV_MODE } from "@/config/app";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { createFaceLandmarker } from "@/lib/mediapipe-service";

interface VoiceCheckProps {
  stream: MediaStream;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function MicrophoneVoiceCheck({ stream, onSuccess, onCancel }: VoiceCheckProps) {
  const [isDone, setIsDone] = useState(false);
  const [volume, setVolume] = useState(0);
  const volumeRef = useRef<number>(0);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const isMouthOpenRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRafRef = useRef<number>(0);
  const videoRafRef = useRef<number>(0);

  // STT states
  const [sttText, setSttText] = useState("");
  const [sttStatus, setSttStatus] = useState<'listening' | 'matched' | 'failed'>('listening');
  const recognitionRef = useRef<any>(null);
  const isDoneRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        faceLandmarkerRef.current = await createFaceLandmarker({ blendshapes: true });
        setIsLoaded(true);
      } catch (err) {
        setLoadError("Không thể tải AI model. Hãy thử tải lại.");
      }
    })();
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported in this browser");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN'; // Vietnamese
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    
    recognition.onresult = (event: any) => {
      if (isDoneRef.current) return;
      
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      const displayText = (finalTranscript || interimTranscript).toLowerCase().trim();
      setSttText(displayText);
      
      // Check if user said "mot hai ba" or "1 2 3" or similar
      const targetPhrases = ['một hai ba', 'một 2 ba', '1 2 3', 'mot hai ba', 'một hai 3', '123', 'một', 'hai', 'ba'];
      const isMatch = targetPhrases.some(phrase => displayText.includes(phrase));
      
      if (isMatch && isMouthOpenRef.current) {
        // STT heard the phrase AND mouth is open right now → PASS
        isDoneRef.current = true;
        setSttStatus('matched');
        setIsDone(true);
        try { recognition.stop(); } catch (e) {}
      }
    };
    
    recognition.onerror = (event: any) => {
      console.warn('STT error:', event.error);
      if (event.error !== 'no-speech' && !isDoneRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };
    
    recognition.onend = () => {
      if (!isDoneRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.warn('Failed to start STT:', e);
    }
    
    return () => {
      try { recognition.stop(); } catch (e) {}
    };
  }, []);

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
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const currentVol = (sum / bufferLength) / 2.5;
        setVolume(currentVol);
        volumeRef.current = currentVol;
        audioRafRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      return () => {
        if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
        audioContext.close().catch(() => {});
      };
    } catch (e) {
      console.error(e);
    }
  }, [stream]);

  // Continuously track mouth open state via MediaPipe (for lip-sync validation)
  useEffect(() => {
    if (!isLoaded || isDone) return;

    const processFrame = () => {
      if (!faceLandmarkerRef.current || !videoRef.current) {
        videoRafRef.current = requestAnimationFrame(processFrame);
        return;
      }
      
      const v = videoRef.current;
      if (v.readyState >= 2) {
        const startTimeMs = performance.now();
        const results = faceLandmarkerRef.current.detectForVideo(v, startTimeMs);
        
        let mouthOpen = false;
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
           const jawOpen = results.faceBlendshapes[0].categories.find(c => c.categoryName === "jawOpen");
           if (jawOpen && jawOpen.score > 0.05) {
              mouthOpen = true;
           }
        }
        
        setIsMouthOpen(mouthOpen);
        isMouthOpenRef.current = mouthOpen;
      }
      videoRafRef.current = requestAnimationFrame(processFrame);
    };
    
    processFrame();
    
    return () => cancelAnimationFrame(videoRafRef.current);
  }, [isLoaded, isDone]);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onSuccess, 1500);
      return () => clearTimeout(timer);
    }
  }, [isDone, onSuccess]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background/90 p-4 relative z-50">
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
            
            {!isLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 z-20">
                {loadError ? (
                  <p className="text-sm text-destructive px-4 text-center">{loadError}</p>
                ) : (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm">Đang tải AI phân tích...</p>
                  </>
                )}
              </div>
            )}
            
            {isDone && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 text-white z-20 backdrop-blur-sm">
                <CheckCircle className="h-16 w-16 bg-white rounded-full text-green-500 drop-shadow-xl animate-bounce" />
              </div>
            )}
            
            {isLoaded && !isDone && (
              <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                {isMouthOpen ? (
                  <div className="bg-green-500/80 text-white text-xs px-2 py-1 rounded shadow-lg flex items-center gap-1 animate-pulse">
                    <Mic className="w-3 h-3" /> Miệng mở ✔
                  </div>
                ) : (
                  <div className="bg-yellow-500/80 text-white text-xs px-2 py-1 rounded shadow-lg flex items-center gap-1">
                    <Volume2 className="w-3 h-3" /> Chưa phát hiện mở miệng
                  </div>
                )}
              </div>
            )}
            
            {/* STT recognized text overlay */}
            {isLoaded && !isDone && sttText && (
              <div className="absolute bottom-2 left-2 right-2 z-10">
                <div className={`text-xs px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-sm text-center font-mono truncate
                  ${sttStatus === 'matched' ? 'bg-green-500/80 text-white' : 'bg-black/70 text-white/80'}`}>
                  🎤 {sttText}
                  {sttStatus === 'matched' && ' ✅'}
                </div>
              </div>
            )}
          </div>
          
          <div className="w-full mt-6 space-y-2">
            <div className="flex justify-between text-xs text-white/70 px-1">
              <span>{isLoaded ? "Nói 'Một Hai Ba' vào mic" : "Đang chờ AI..."}</span>
              <span>{isDone ? '100%' : (sttText ? 'Nghe...' : '0%')}</span>
            </div>
            <Progress value={isDone ? 100 : (sttText ? 50 : 0)} className="h-3 bg-red-900/40 [&>div]:bg-green-500" />
          </div>
        </div>

        {/* Right Side: Information & Settings */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between bg-card relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Mic className="h-6 w-6 text-primary" />
                Bước 5: Kiểm tra thu âm giọng nói
              </h2>
              <p className="text-muted-foreground mt-2 text-sm mb-4">
                Bài thi của bạn yêu cầu nhận diện giọng nói ngẫu nhiên. Vui lòng đọc to dòng chữ bên dưới và nhìn thẳng vào màn hình để xác minh khẩu hình miệng.
              </p>
            </div>

            <div className="bg-muted p-8 text-center rounded-xl border-2 border-dashed border-primary/50 relative overflow-hidden transition-all duration-300 transform">
               {!isDone && (
                 <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                   background: `radial-gradient(circle, rgba(59,130,246,1) 0%, rgba(255,255,255,0) ${Math.min(100, volume * 4)}%)`,
                   transform: 'scale(1.5)',
                   transition: 'background 0.1s ease-out'
                 }} />
               )}
               <h2 className={`text-4xl font-extrabold tracking-widest drop-shadow-sm mb-4 relative z-10 transition-colors ${isMouthOpen ? 'text-green-500' : 'text-primary'}`}>
                 "Một Hai Ba"
               </h2>
               <p className="text-sm font-medium text-muted-foreground relative z-10 bg-background/50 inline-block px-3 py-1 rounded-full">
                 Nói to và rõ để hệ thống ghi nhận
               </p>
            </div>
            
            <div className="text-xs text-muted-foreground bg-accent/30 p-3 rounded mt-2">
              <p className="font-semibold text-foreground">💡 Mẹo:</p>
              Mở to khẩu hình miệng và nói đủ lớn. Hệ thống xác nhận bằng AI giọng nói + kiểm tra khẩu hình.
            </div>
            {sttStatus === 'matched' && (
              <div className="text-xs bg-green-500/10 text-green-600 border border-green-500/30 p-3 rounded mt-2 font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Đã xác minh thành công giọng nói + khẩu hình!
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t">
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
              {isDone ? "Thành công. Đang chuyển tiếp..." : "Đang kiểm tra giọng nói..."}
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
