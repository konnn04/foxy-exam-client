
import { livekitPublisher } from "./livekit-publisher";

export interface TelemetryEvent {
  type: string;
  data?: Record<string, any>;
  ts: string; 
}

const CRITICAL_EVENT_TYPES = new Set([
  "window_blur",
  "tab_switch",
  "devtools",
  "screenshot",
  "keyboard_shortcut",
  "copy_attempt",
  "banned_app_detected",
  "multiple_screens",
  "screen_share_stopped",
  "exit_fullscreen",
  "network_changed",
  "connection_lost",
]);

const TOPIC = "client_telemetry";
const FLUSH_INTERVAL_MS = 800;
const MAX_BUFFER_SIZE = 200;

const DEFAULT_DEDUP_MS = 500;

const TYPE_DEDUP_MS: Record<string, number> = {
  mouse_click: 1000,
  text_typed: 3000,
  essay_typed: 3000,
  face_gaze: 750,
  perf_metrics: 2000,
  answer_selected: 800,
  question_navigated: 800,
  question_marked: 800,
  multiple_screens: 10_000,
  window_blur: 500,
  tab_switch: 500,
  exit_fullscreen: 5000,
  connection_lost: 10_000,
  banned_app_detected: 10_000,
  network_changed: 10_000,
};

class TelemetryPublisher {
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private examId: string = "";
  private attemptId: string = "";
  private _started = false;
  private _lastEventTime: Record<string, number> = {};
  private _seqNum = 0;

  start(examId: string, attemptId: string) {
    this.examId = examId;
    this.attemptId = attemptId;
    this._started = true;
    this._seqNum = 0;
    this._lastEventTime = {};

    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop() {
    this._started = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.buffer = [];
    this._seqNum = 0;
  }

  emit(type: string, data?: Record<string, any>) {
    if (!this._started) return;

    const dedupMs = TYPE_DEDUP_MS[type] ?? DEFAULT_DEDUP_MS;
    if (dedupMs > 0) {
      const now = Date.now();
      const lastTime = this._lastEventTime[type] ?? 0;
      if (now - lastTime < dedupMs) return;
      this._lastEventTime[type] = now;
    }

    const event: TelemetryEvent = {
      type,
      data: { ...data, _seq: this._seqNum++ },
      ts: new Date().toISOString(),
    };

    this.buffer.push(event);

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  emitImmediate(type: string, data?: Record<string, any>) {
    if (!this._started) return;

    const dedupMs = TYPE_DEDUP_MS[type] ?? DEFAULT_DEDUP_MS;
    if (dedupMs > 0) {
      const now = Date.now();
      const lastTime = this._lastEventTime[type] ?? 0;
      if (now - lastTime < dedupMs) return;
      this._lastEventTime[type] = now;
    }

    const event: TelemetryEvent = {
      type,
      data: { ...data, _seq: this._seqNum++, _immediate: true },
      ts: new Date().toISOString(),
    };

    this.buffer.push(event);
    this.flush();
  }

  send(type: string, data?: Record<string, any>) {
    if (CRITICAL_EVENT_TYPES.has(type)) {
      this.emitImmediate(type, data);
    } else {
      this.emit(type, data);
    }
  }

  flush() {
    if (this.buffer.length === 0) return;

    if (!livekitPublisher.isConnected) {
      if (this.buffer.length > MAX_BUFFER_SIZE * 5) {
        this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE * 5); 
      }
      return;
    }

    const payload = {
      exam_id: this.examId,
      attempt_id: this.attemptId,
      events: [...this.buffer],
      batch_ts: new Date().toISOString(),
    };

    const backupBuffer = this.buffer;
    this.buffer = [];

    const bytes = new TextEncoder().encode(JSON.stringify(payload));

    livekitPublisher.publishTelemetry(bytes, TOPIC).catch((err) => {
      console.warn("[TelemetryPublisher] Failed to publish, restoring buffer:", err);
      this.buffer = [...backupBuffer, ...this.buffer];
    });
  }

  get isStarted() {
    return this._started;
  }
}

export const telemetryPublisher = new TelemetryPublisher();
