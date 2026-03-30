/**
 * API Configuration
 * Centralized API endpoints, base URLs, and HTTP configuration
 */

// Base URLs
export const API_CONFIG = {
  // API Base URL
  BASE_URL: `${import.meta.env.VITE_BASE_URL}/api` || "http://localhost:8000/api",

  // Broadcasting/WebSocket Auth — can be overridden to bypass tunnel
  BROADCASTING_AUTH_URL: import.meta.env.VITE_BROADCASTING_AUTH_URL
    || (import.meta.env.VITE_BASE_URL
      ? `${import.meta.env.VITE_BASE_URL}/broadcasting/auth`
      : "http://localhost:8000/broadcasting/auth"),

  // OAuth Base URL (without /api prefix)
  OAUTH_BASE_URL: import.meta.env.VITE_BASE_URL
    ? import.meta.env.VITE_BASE_URL.replace("/api", "")
    : "http://localhost:8000",
};

// HTTP Status Codes
export const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  OAUTH_TOKEN: "/oauth/token",
  AUTH_ME: "/auth/me",
  AUTH_LOGOUT: "/auth/logout",

  // Dashboard
  DASHBOARD: "/student/dashboard",

  // Exams
  EXAM_TAKE: (examId: string, attemptId: string) => `/student/exams/${examId}/take/${attemptId}`,
  EXAM_MONITOR_EVENTS: (examId: string) => `/student/exams/${examId}/monitor/events`,
  EXAM_MONITOR_SIGNAL: (examId: string | number) => `/student/exams/${examId}/monitor/signal`,
  EXAM_MONITOR_FACE_CROP: (examId: string | number) => `/student/exams/${examId}/monitor/face-crop`,
  EXAM_MONITOR_AUDIO_CLIP: (examId: string | number) => `/student/exams/${examId}/monitor/audio-clip`,
  EXAM_MONITOR_SCREEN_CLIP: (examId: string | number) => `/student/exams/${examId}/monitor/screen-clip`,
  EXAM_PROCTOR_VIOLATIONS: (examId: string | number) => `/student/exams/${examId}/proctor/violations`,
  EXAM_PROCTOR_CONFIG: (examId: string | number) => `/student/exams/${examId}/proctor/config`,

  // Chat
  EXAM_CHAT: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/chat/${attemptId}`,
};

// OAuth Configuration
export const OAUTH_CONFIG = {
  CLIENT_ID: import.meta.env.VITE_OAUTH_CLIENT_ID || "exam-client",
  CLIENT_SECRET: import.meta.env.VITE_OAUTH_CLIENT_SECRET || "",
  SCOPE: "*",
  GRANT_TYPE: "password",
};
