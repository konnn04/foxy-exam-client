/**
 * WebSocket & Reverb Configuration
 * Centralized configuration for Echo, Reverb, and real-time communication
 */

export const WEBSOCKET_CONFIG = {
  // Broadcaster type
  BROADCASTER: "reverb",

  // Reverb App Configuration
  APP_KEY: import.meta.env.VITE_REVERB_APP_KEY || "exam-key-local",
  HOST: import.meta.env.VITE_REVERB_HOST || "localhost",
  PORT: import.meta.env.VITE_REVERB_PORT || "8080",
  SCHEME: import.meta.env.VITE_REVERB_SCHEME || "http",

  // WebSocket Configuration
  ENABLE_STATS: false,
  FORCE_TLS: import.meta.env.VITE_REVERB_SCHEME === "https",
  ENABLED_TRANSPORTS: ["ws", "xhr_streaming", "xhr_polling"],
};

// Channel naming patterns
export const CHANNEL_NAMES = {
  // Channel prefix for exam rooms
  EXAM_ROOM: (examId: string | number) => `exam-room.${examId}`,

  // Signaling channel for WebRTC communication
  SIGNALING: (userId: string | number) => `signaling.${userId}`,

  // Chat channel per attempt
  CHAT_ATTEMPT: (attemptId: string | number) => `chat.attempt.${attemptId}`,
};

// Event names for broadcasting
export const BROADCAST_EVENTS = {
  // Monitor event for proctoring
  MONITOR_EVENT: ".monitor.event",

  // Violation reported by server (broadcast to presence channel)
  VIOLATION_REPORTED: ".violation.reported",

  // WebRTC signaling
  WEBRTC_SIGNAL: ".webrtc.signal",

  // Chat message
  CHAT_MESSAGE: ".chat.message.sent",

  // Server-side face verification lock/unlock
  FACE_LOCK: ".face.lock",

  // Join/Leave room events
  USER_JOINED: "user.joined",
  USER_LEFT: "user.left",
};

// Channel types
export const CHANNEL_TYPES = {
  PRESENCE: "presence",
  PRIVATE: "private",
  PUBLIC: "public",
};
