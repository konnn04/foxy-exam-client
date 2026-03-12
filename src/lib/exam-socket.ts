import { getEcho, disconnectEcho } from './echo';
import api from './api';

// ─── Types ──────────────────────────────────────────────────────────
export interface ExamEvent {
  type: string;
  data?: Record<string, any>;
  client_timestamp?: string;
}

export interface MonitorEventPayload {
  type: string;
  userId: number;
  attemptId: number;
  payload: Record<string, any>;
  timestamp: string;
}

type DisconnectCallback = () => void;
type ReconnectCallback = () => void;
type EventCallback = (event: MonitorEventPayload) => void;

// ─── ExamSocketService ──────────────────────────────────────────────
class ExamSocketService {
  private examId: number | null = null;
  private attemptId: number | null = null;
  private eventBuffer: ExamEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private isConnected = false;
  
  // Callbacks
  private onDisconnectCallbacks: DisconnectCallback[] = [];
  private onReconnectCallbacks: ReconnectCallback[] = [];
  private onEventCallbacks: EventCallback[] = [];

  constructor() {
    this.sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Join an exam room (Presence channel).
   * Starts event buffering and sets up connection monitoring.
   */
  joinRoom(examId: number, attemptId: number): void {
    this.examId = examId;
    this.attemptId = attemptId;

    const echo = getEcho();

    // Join presence channel
    echo.join(`exam-room.${examId}`)
      .here((members: any[]) => {
        console.log('[ExamSocket] Room members:', members);
        this.isConnected = true;
      })
      .joining((member: any) => {
        console.log('[ExamSocket] Member joined:', member);
      })
      .leaving((member: any) => {
        console.log('[ExamSocket] Member left:', member);
      })
      .listen('.monitor.event', (event: MonitorEventPayload) => {
        this.onEventCallbacks.forEach(cb => cb(event));
      })
      .error((error: any) => {
        console.error('[ExamSocket] Channel error:', error);
      });

    // Listen for WebRTC signaling on private channel
    const authStore = JSON.parse(localStorage.getItem('auth-store') || '{}');
    const userId = authStore?.state?.user?.id;
    if (userId) {
      echo.private(`signaling.${userId}`)
        .listen('.webrtc.signal', (signal: any) => {
          console.log('[ExamSocket] WebRTC signal received:', signal);
          // WebRTC service handles this
          window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: signal }));
        });
    }

    // Monitor connection state via Pusher's connection events
    const pusher = (echo.connector as any).pusher;
    if (pusher) {
      pusher.connection.bind('disconnected', () => {
        console.warn('[ExamSocket] Disconnected!');
        this.isConnected = false;
        this.onDisconnectCallbacks.forEach(cb => cb());
      });
      pusher.connection.bind('connected', () => {
        if (this.examId) {
          console.log('[ExamSocket] Reconnected!');
          this.isConnected = true;
          this.onReconnectCallbacks.forEach(cb => cb());
          // Log reconnection event
          this.logEvent('reconnected', {});
        }
      });
      pusher.connection.bind('error', (err: any) => {
        console.error('[ExamSocket] Connection error:', err);
      });
    }

    // Start event buffer flushing (every 2 seconds)
    this.startFlushInterval();

    // Log connection event
    this.logEvent('connected', { sessionId: this.sessionId });
  }

  /**
   * Buffer an event to be sent in the next batch.
   */
  logEvent(type: string, data: Record<string, any> = {}): void {
    this.eventBuffer.push({
      type,
      data,
      client_timestamp: new Date().toISOString(),
    });

    // If buffer exceeds 50 events, flush immediately
    if (this.eventBuffer.length >= 50) {
      this.flush();
    }
  }

  /**
   * Flush buffered events to the server via REST API.
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0 || !this.examId || !this.attemptId) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await api.post(`/student/exams/${this.examId}/monitor/events`, {
        attempt_id: this.attemptId,
        events,
      }, {
        headers: {
          'X-Session-Id': this.sessionId,
        },
      });
    } catch (error) {
      console.error('[ExamSocket] Failed to flush events:', error);
      // Put events back in buffer for retry
      this.eventBuffer = [...events, ...this.eventBuffer];
    }
  }

  /**
   * Start the periodic flush interval.
   */
  private startFlushInterval(): void {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setInterval(() => this.flush(), 2000);
  }

  /**
   * Send a WebRTC signaling message to a specific user.
   */
  async sendSignal(signalType: string, data: any, toUserId: number): Promise<void> {
    if (!this.examId) return;
    try {
      await api.post(`/student/exams/${this.examId}/monitor/signal`, {
        signal_type: signalType,
        data,
        to_user_id: toUserId,
      });
    } catch (error) {
      console.error('[ExamSocket] Failed to send signal:', error);
    }
  }

  /**
   * Upload a face crop image.
   */
  async uploadFaceCrop(imageBase64: string): Promise<void> {
    if (!this.examId || !this.attemptId) return;
    try {
      await api.post(`/student/exams/${this.examId}/monitor/face-crop`, {
        attempt_id: this.attemptId,
        image: imageBase64,
      });
    } catch (error) {
      console.error('[ExamSocket] Failed to upload face crop:', error);
    }
  }

  // ─── Event Listeners ─────────────────────────────────────────
  onDisconnect(callback: DisconnectCallback): void {
    this.onDisconnectCallbacks.push(callback);
  }

  onReconnect(callback: ReconnectCallback): void {
    this.onReconnectCallbacks.push(callback);
  }

  onMonitorEvent(callback: EventCallback): void {
    this.onEventCallbacks.push(callback);
  }

  // ─── Getters ──────────────────────────────────────────────────
  getSessionId(): string {
    return this.sessionId;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  // ─── Cleanup ──────────────────────────────────────────────────
  /**
   * Leave the exam room and disconnect.
   */
  async leaveRoom(): Promise<void> {
    // Flush remaining events
    this.logEvent('disconnected', { sessionId: this.sessionId });
    await this.flush();

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Leave channel
    if (this.examId) {
      const echo = getEcho();
      echo.leave(`exam-room.${this.examId}`);

      const authStore = JSON.parse(localStorage.getItem('auth-store') || '{}');
      const userId = authStore?.state?.user?.id;
      if (userId) {
        echo.leave(`signaling.${userId}`);
      }
    }

    // Clear state
    this.examId = null;
    this.attemptId = null;
    this.eventBuffer = [];
    this.onDisconnectCallbacks = [];
    this.onReconnectCallbacks = [];
    this.onEventCallbacks = [];
    this.isConnected = false;

    disconnectEcho();
  }
}

// Export singleton
export const examSocket = new ExamSocketService();
