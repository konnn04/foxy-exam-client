import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioClassifier } from '@mediapipe/tasks-audio';
import { useExamSocketStore } from '@/hooks/use-exam-socket';
import { proctorService } from '@/services/proctor.service';

/**
 * Audio monitoring hook using MediaPipe Audio Classifier (yamnet model).
 * Detects speech during exams and records audio clips for proctoring.
 */

interface UseAudioMonitorOptions {
  stream: MediaStream | null;
  enabled: boolean;
  examId: string | number | undefined;
  attemptId: string | number | undefined;
  /** Seconds of audio to record when speech detected. Default: 5 */
  clipDurationSeconds?: number;
  /** Min confidence for "Speech" category. Default: 0.3 */
  speechThreshold?: number;
  /** Cooldown between clips in ms. Default: 30000 (30s) */
  cooldownMs?: number;
}

interface AudioMonitorState {
  isLoaded: boolean;
  error: string | null;
  speechDetected: boolean;
  isRecording: boolean;
  clipCount: number;
}

const YAMNET_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

export function useAudioMonitor({
  stream,
  enabled,
  examId,
  attemptId,
  clipDurationSeconds = 5,
  speechThreshold = 0.3,
  cooldownMs = 30000,
}: UseAudioMonitorOptions): AudioMonitorState {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [clipCount, setClipCount] = useState(0);

  const classifierRef = useRef<AudioClassifier | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastClipTimeRef = useRef(0);
  const isRecordingRef = useRef(false);

  // Initialize AudioClassifier
  useEffect(() => {
    if (!enabled || !stream) return;

    let cancelled = false;

    (async () => {
      try {
        const wasmFileset = {
          wasmLoaderPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.32/wasm/audio_wasm_internal.js',
          wasmBinaryPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.32/wasm/audio_wasm_internal.wasm',
        };

        const classifier = await AudioClassifier.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath: YAMNET_MODEL_URL,
          },
          maxResults: 5,
          scoreThreshold: 0.1,
        });

        if (cancelled) {
          classifier.close();
          return;
        }

        classifierRef.current = classifier;
        setIsLoaded(true);
        console.log('[AudioMonitor] Classifier loaded successfully');
      } catch (e) {
        if (!cancelled) {
          console.error('[AudioMonitor] Failed to load classifier:', e);
          setError('Không thể tải mô hình phân loại âm thanh.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (classifierRef.current) {
        try { classifierRef.current.close(); } catch {}
        classifierRef.current = null;
      }
    };
  }, [enabled, !!stream]);

  // Record audio clip and upload
  const recordAndUpload = useCallback(async (audioStream: MediaStream) => {
    if (isRecordingRef.current || !examId || !attemptId) return;
    
    isRecordingRef.current = true;
    setIsRecording(true);

    return new Promise<void>((resolve) => {
      try {
        const recorder = new MediaRecorder(audioStream, { 
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/webm' 
        });
        mediaRecorderRef.current = recorder;
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          
          // Convert to base64 and upload
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string)?.split(',')[1];
            if (base64) {
              try {
                await proctorService.uploadAudioClip(examId, {
                  attempt_id: attemptId,
                  audio: base64,
                  duration_seconds: clipDurationSeconds,
                  mime_type: recorder.mimeType,
                });
                setClipCount(c => c + 1);
                console.log('[AudioMonitor] Audio clip uploaded');
              } catch (err) {
                console.error('[AudioMonitor] Failed to upload audio clip:', err);
              }
            }
            isRecordingRef.current = false;
            setIsRecording(false);
            resolve();
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          } else {
            isRecordingRef.current = false;
            setIsRecording(false);
            resolve();
          }
        }, clipDurationSeconds * 1000);

      } catch (e: any) {
        if (e.name !== 'NotSupportedError') {
          console.error('[AudioMonitor] Recording error:', e);
        }
        isRecordingRef.current = false;
        setIsRecording(false);
        resolve();
      }
    });
  }, [examId, attemptId, clipDurationSeconds]);

  // Process audio stream for speech detection
  useEffect(() => {
    if (!isLoaded || !stream || !enabled || !classifierRef.current) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      // Buffer size 16384 samples at 16kHz ≈ 1s of audio
      const processor = audioContext.createScriptProcessor(16384, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!classifierRef.current || !enabled) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Copy data to avoid detached buffer issues
        const audioData = new Float32Array(inputData.length);
        audioData.set(inputData);

        try {
          const results = classifierRef.current.classify(audioData);
          
          if (results && results.length > 0) {
            for (const result of results) {
              if (!result.classifications?.[0]?.categories) continue;
              
              for (const category of result.classifications[0].categories) {
                if (category.categoryName === 'Speech' && category.score >= speechThreshold) {
                  setSpeechDetected(true);
                  
                  const now = Date.now();
                  if (now - lastClipTimeRef.current > cooldownMs && !isRecordingRef.current) {
                    lastClipTimeRef.current = now;
                    
                    // Log event
                    useExamSocketStore.getState().logEvent('speech_detected', {
                      confidence: category.score,
                      localTime: new Date().toISOString(),
                    });

                    // Record and upload clip
                    recordAndUpload(stream);
                  }
                  return;
                }
              }
            }
          }
          setSpeechDetected(false);
        } catch (err) {
          // Classification can fail if buffer is wrong size, silently ignore
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      return () => {
        try {
          processor.disconnect();
          source.disconnect();
          audioContext.close();
        } catch {}
        processorRef.current = null;
        audioContextRef.current = null;
      };
    } catch (e) {
      console.error('[AudioMonitor] Audio processing setup failed:', e);
    }
  }, [isLoaded, stream, enabled, speechThreshold, cooldownMs, recordAndUpload]);

  return { isLoaded, error, speechDetected, isRecording, clipCount };
}
