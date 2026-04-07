import { create } from "zustand";
import { useEffect, useRef } from "react";
import { connectExamSocket, joinExamRoom, leaveExamRoom, subscribeToWebRTCSignals, subscribeToFaceLock, unsubscribeFromWebRTCSignals, listenToConnectionEvents } from "@/sockets/exam.socket";
import { socket } from "@/sockets/socket";
import { examMonitorService } from "@/services/exam-monitor.service";
import { proctorService } from "@/services/proctor.service";
import { telemetryPublisher } from "@/lib/telemetry-publisher";
import { STORAGE_KEYS, EVENT_FLUSHING } from "@/config";

interface ExamEvent {
  type: string;
  data?: Record<string, any>;
  client_timestamp?: string;
}

interface DeviceLockData {
  fingerprint: string;
  checksum: string;
  timestamp: number;
}

interface ExamSocketStore {
  examId: number | null;
  attemptId: number | null;
  sessionId: string;
  isConnected: boolean;
  eventBuffer: ExamEvent[];
  lastEventTime: Record<string, number>;
  deviceLock: DeviceLockData | null;
  
  onDisconnectCallbacks: (() => void)[];
  onReconnectCallbacks: (() => void)[];
  onEventCallbacks: ((event: any) => void)[];
  onViolationCallbacks: ((violation: any) => void)[];

  setConnected: (status: boolean) => void;
  initSession: (examId: number, attemptId: number) => void;
  setDeviceLock: (data: DeviceLockData) => void;
  clearSession: () => void;
  
  logEvent: (type: string, data?: Record<string, any>) => void;
  flush: () => Promise<void>;
  
  sendSignal: (signalType: string, data: any, toUserId: number) => Promise<void>;
  uploadFaceCrop: (imageBase64: string) => Promise<boolean | null>;

  onDisconnect: (cb: () => void) => void;
  onReconnect: (cb: () => void) => void;
  onMonitorEvent: (cb: (event: any) => void) => void;
  onViolation: (cb: (violation: any) => void) => void;
}

export const useExamSocketStore = create<ExamSocketStore>((set, get) => ({
  examId: null,
  attemptId: null,
  sessionId: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  isConnected: false,
  eventBuffer: [],
  lastEventTime: {},
  
  onDisconnectCallbacks: [],
  onReconnectCallbacks: [],
  onEventCallbacks: [],
  onViolationCallbacks: [],
  deviceLock: null,
  
  setConnected: (status) => set({ isConnected: status }),
  
  initSession: (examId, attemptId) => set({ examId, attemptId }),
  
  setDeviceLock: (data) => set({ deviceLock: data }),
  
  clearSession: () => set({ 
    examId: null, 
    attemptId: null, 
    eventBuffer: [], 
    isConnected: false,
    onDisconnectCallbacks: [],
    onReconnectCallbacks: [],
    onEventCallbacks: [],
    onViolationCallbacks: [],
    deviceLock: null,
  }),
  
  /**
   * @deprecated Events now go via LiveKit DataChannel (telemetryPublisher).
   * This method forwards to telemetryPublisher for backward compat.
   */
  logEvent: (type, data = {}) => {
    // Forward to telemetry publisher (LiveKit DataChannel → Agent)
    telemetryPublisher.send(type, data);
  },
  
  /**
   * @deprecated No longer flushes to REST. Events go via LiveKit DataChannel.
   */
  flush: async () => {
    // No-op: events are flushed by telemetryPublisher every 1s via LiveKit
  },

  sendSignal: async (signalType, data, toUserId) => {
    const { examId } = get();
    if (!examId) return;
    await examMonitorService.sendSignal(examId, { signal_type: signalType, data, to_user_id: toUserId });
  },

  uploadFaceCrop: async (imageBase64) => {
    const { examId, attemptId } = get();
    if (!examId || !attemptId) return null;
    try {
      const resp = await proctorService.uploadFaceCrop(examId, { attempt_id: attemptId, image: imageBase64 });
      return resp.data?.match ?? null;
    } catch {
      return null;
    }
  },

  onDisconnect: (cb) => set((state) => ({ onDisconnectCallbacks: [...state.onDisconnectCallbacks, cb] })),
  onReconnect: (cb) => set((state) => ({ onReconnectCallbacks: [...state.onReconnectCallbacks, cb] })),
  onMonitorEvent: (cb) => set((state) => ({ onEventCallbacks: [...state.onEventCallbacks, cb] })),
  onViolation: (cb) => set((state) => ({ onViolationCallbacks: [...state.onViolationCallbacks, cb] })),
}));

/**
 * Hook to manage Exam Socket lifecycle
 * Automatically joins room on mount and leaves on unmount when examId is provided.
 */
export function useExamSocket(examId?: number | string | null, attemptId?: number | string | null) {
  const store = useExamSocketStore();
  const mounted = useRef(false);
  
  useEffect(() => {
    if (!examId || !attemptId) return;

    const parsedExamId = typeof examId === 'string' ? parseInt(examId) : examId;
    const parsedAttemptId = typeof attemptId === 'string' ? parseInt(attemptId) : attemptId;
    
    store.initSession(parsedExamId, parsedAttemptId);
    connectExamSocket();
    
    joinExamRoom(parsedExamId, {
      onHere: () => store.setConnected(true),
      onEvent: (event: any) => {
        store.onEventCallbacks.forEach(cb => cb(event));
      },
      onViolation: (violation: any) => {
        useExamSocketStore.getState().onViolationCallbacks.forEach(cb => cb(violation));
      },
    });

    const authStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH_STORE) || '{}');
    const userId = authStore?.state?.user?.id;
    if (userId) {
      subscribeToWebRTCSignals(userId, (signal: any) => {
        window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: signal }));
      });
      subscribeToFaceLock(userId, (data: any) => {
        window.dispatchEvent(new CustomEvent('face-lock', { detail: data }));
      });
    }

    const emitWhenTelemetryReady = (type: string, data: Record<string, any> = {}, retry = 0) => {
      if (telemetryPublisher.isStarted) {
        telemetryPublisher.send(type, data);
        return;
      }
      if (retry >= 10) return;
      window.setTimeout(() => emitWhenTelemetryReady(type, data, retry + 1), 200);
    };

    const unbind = listenToConnectionEvents(
      () => {
        store.setConnected(true);
        emitWhenTelemetryReady('connection_restored', {});
        store.onReconnectCallbacks.forEach(cb => cb());
      },
      () => {
        store.setConnected(false);
        emitWhenTelemetryReady('disconnected', {});
        store.onDisconnectCallbacks.forEach(cb => cb());
      },
      (err) => console.error('[ExamSocket] Connection Error:', err)
    );

    emitWhenTelemetryReady('connected', { sessionId: store.sessionId });
    mounted.current = true;
    
    // Auto flush
    const flushInterval = setInterval(() => {
      useExamSocketStore.getState().flush();
    }, EVENT_FLUSHING.FLUSH_INTERVAL_MS);
    
    return () => {
      clearInterval(flushInterval);
      mounted.current = false;
      emitWhenTelemetryReady('connection_lost', { sessionId: store.sessionId });
      
      // Attempt to flush last events
      store.flush();
      
      if (userId) unsubscribeFromWebRTCSignals(userId);
      leaveExamRoom(parsedExamId);
      unbind();
      store.clearSession();
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, attemptId]);
  
  return store;
}
