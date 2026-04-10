/**
 * Telemetry Publisher — Sends raw client events to supervisor-agent via LiveKit DataChannel.
 *
 * Events are buffered and flushed every 1s (or immediately for critical events).
 * The Agent receives these events and makes violation decisions server-side.
 *
 * This replaces the old REST-based event flushing (POST /monitor/events).
 */

import { livekitPublisher } from "./livekit-publisher";

// ─── Types ───────────────────────────────────────────────────
export interface TelemetryEvent {
  type: string;
  data?: Record<string, any>;
  ts: string; // ISO 8601 client_timestamp
}

/** Event types that should be sent immediately (not buffered). */
const CRITICAL_EVENT_TYPES = new Set([
  "window_blur",
  "tab_switch",
  "devtools",
  "screenshot",
  "banned_app_detected",
  "multiple_screens",
  "screen_share_stopped",
  "exit_fullscreen",
  "network_changed",
  "connection_lost",
]);

const TOPIC = "client_telemetry";
const FLUSH_INTERVAL_MS = 1000;
const MAX_BUFFER_SIZE = 200;

// ─── Dedup tracking ──────────────────────────────────────────
const DEFAULT_DEDUP_MS = 500;

/**
 * Per-type dedup windows. High-frequency or recurring events get longer windows
 * to avoid flooding the pipeline with near-identical entries.
 */
const TYPE_DEDUP_MS: Record<string, number> = {
  mouse_click: 1000,
  text_typed: 3000,
  essay_typed: 3000,
  face_gaze: 1000,
  perf_metrics: 2000,
  answer_selected: 800,
  question_navigated: 800,
  question_marked: 800,
  multiple_screens: 10_000,
  window_blur: 3000,
  tab_switch: 3000,
  exit_fullscreen: 5000,
  connection_lost: 10_000,
  banned_app_detected: 10_000,
  network_changed: 10_000,
};

// ─── Class ───────────────────────────────────────────────────
class TelemetryPublisher {
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private examId: string = "";
  private attemptId: string = "";
  private _started = false;
  private _lastEventTime: Record<string, number> = {};
  private _seqNum = 0;

  /**
   * Start the telemetry publisher. Called once when exam session begins.
   */
  start(examId: string, attemptId: string) {
    this.examId = examId;
    this.attemptId = attemptId;
    this._started = true;
    this._seqNum = 0;
    this._lastEventTime = {};

    // Periodic flush every 1s
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * Stop the publisher. Performs a final flush.
   */
  stop() {
    this._started = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    this.flush();
    this.buffer = [];
    this._seqNum = 0;
  }

  /**
   * Emit a telemetry event. Buffers it for the next 1s flush.
   */
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

    // If buffer is getting large, flush immediately
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * Emit a critical event — sent immediately without waiting for batch.
   * Still respects per-type dedup to prevent burst duplicates.
   */
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

  /**
   * Smart emit: auto-decides immediate vs buffered based on event type.
   */
  send(type: string, data?: Record<string, any>) {
    if (CRITICAL_EVENT_TYPES.has(type)) {
      this.emitImmediate(type, data);
    } else {
      this.emit(type, data);
    }
  }

  /**
   * Flush buffered events via LiveKit DataChannel.
   */
  private flush() {
    if (this.buffer.length === 0) return;

    if (!livekitPublisher.isConnected) {
      // Do not clear the buffer if disconnected so we don't lose early events like exam_start 
      // Ensure buffer doesn't grow indefinitely if LiveKit permanently fails
      if (this.buffer.length > MAX_BUFFER_SIZE * 5) {
        this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE * 5); // Keep last N
      }
      return;
    }

    const payload = {
      exam_id: this.examId,
      attempt_id: this.attemptId,
      events: [...this.buffer],
      batch_ts: new Date().toISOString(),
    };

    // Optimistically clear buffer but keep a backup in case of failure
    const backupBuffer = this.buffer;
    this.buffer = [];

    const bytes = new TextEncoder().encode(JSON.stringify(payload));

    livekitPublisher.publishTelemetry(bytes, TOPIC).catch((err) => {
      console.warn("[TelemetryPublisher] Failed to publish, restoring buffer:", err);
      // Restore buffer (putting newer events at the end)
      this.buffer = [...backupBuffer, ...this.buffer];
    });
  }

  get isStarted() {
    return this._started;
  }
}

// Singleton export
export const telemetryPublisher = new TelemetryPublisher();
