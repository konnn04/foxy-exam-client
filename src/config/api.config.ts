export const API_CONFIG = {
  // API Base URL
  BASE_URL: import.meta.env.VITE_BASE_URL ? `${import.meta.env.VITE_BASE_URL}/api` : "http://localhost:8000/api",

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

  // Dashboard & Profile
  DASHBOARD: "/student/dashboard",
  HISTORY: "/student/history",

  // Courses
  COURSES: "/student/courses",
  COURSE_DETAIL: (courseId: string | number) => `/student/courses/${courseId}`,

  // Face Registration
  FACE_REGISTER_QR: "/student/face-register-qr",
  EXAM_FACE_REGISTER_QR: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/face-register-qr`,
  EXAM_VERIFY_IDENTITY: (examId: string | number) => `/student/exams/${examId}/verify-identity`,
  EXAM_RESUME_FACE_IDENTITY: (examId: string | number, attemptId: string | number) =>
    `/student/exams/${examId}/take/${attemptId}/resume-face-identity`,

  // Exams Basic
  EXAM_DETAIL: (examId: string | number) => `/student/exams/${examId}`,
  EXAM_START: (examId: string | number) => `/student/exams/${examId}/start`,
  EXAM_REVIEW: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/review/${attemptId}`,
  EXAM_SUBMIT: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/submit/${attemptId}`,

  // Exam Taking
  EXAM_TAKE: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}`,
  EXAM_TAKE_BEGIN: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/begin`,
  EXAM_TAKE_STATUS: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/attempt/${attemptId}/status`,
  EXAM_SAVE_ANSWER: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/save-answer`,
  EXAM_FLAG_ANSWER: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/flag`,

  // Mobile Camera Check
  MOBILE_CAMERA_TOKEN: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/mobile-camera-token`,
  MOBILE_CAMERA_RELAY_STATUS: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/take/${attemptId}/mobile-camera-relay-status`,
  EXAM_STREAM_READINESS: (examId: string | number, attemptId: string | number) =>
    `/student/exams/${examId}/take/${attemptId}/stream-readiness`,

  // Proctoring & Monitoring
  EXAM_MONITOR_EVENTS: (examId: string | number) => `/student/exams/${examId}/monitor/events`,
  EXAM_MONITOR_SIGNAL: (examId: string | number) => `/student/exams/${examId}/monitor/signal`,
  EXAM_MONITOR_FACE_CROP: (examId: string | number) => `/student/exams/${examId}/monitor/face-crop`,
  EXAM_MONITOR_AUDIO_CLIP: (examId: string | number) => `/student/exams/${examId}/monitor/audio-clip`,
  EXAM_MONITOR_SCREEN_CLIP: (examId: string | number) => `/student/exams/${examId}/monitor/screen-clip`,
  EXAM_PROCTOR_VIOLATIONS: (examId: string | number) => `/student/exams/${examId}/proctor/violations`,
  EXAM_PROCTOR_CONFIG: (examId: string | number) => `/student/exams/${examId}/proctor/config`,
  EXAM_PROCTOR_TOKEN: (examId: string | number) => `/student/exams/${examId}/proctor/token`,
  EXAM_PROCTOR_AGENT_IN_ROOM: (examId: string | number) => `/student/exams/${examId}/proctor/agent-in-room`,

  EXAM_CHAT: (examId: string | number, attemptId: string | number) => `/student/exams/${examId}/chat/${attemptId}`,
};

// OAuth Configuration
export const OAUTH_CONFIG = {
  CLIENT_ID: import.meta.env.VITE_OAUTH_CLIENT_ID || "exam-client",
  CLIENT_SECRET: import.meta.env.VITE_OAUTH_CLIENT_SECRET || "",
  SCOPE: "*",
  GRANT_TYPE: "password",
};
