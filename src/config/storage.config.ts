/**
 * Storage Configuration
 * Centralized keys and constants for local storage, session storage, and caching
 */

// LocalStorage keys
export const STORAGE_KEYS = {
  // Authentication
  AUTH_TOKEN: "auth_token",
  AUTH_USER: "auth_user",

  // Store/Zustand persistence
  AUTH_STORE: "auth-store",

  // Theme preference
  THEME_PREFERENCE: "theme-preference",

  // User preferences
  USER_PREFERENCES: "user-preferences",

  // Cached data
  CACHED_DASHBOARD: "cached-dashboard",
  CACHED_COURSES: "cached-courses",
  CACHED_EXAMS: "cached-exams",

  // Offline mode state
  OFFLINE_MODE_ACTIVE: "offline-mode-active",
};

// SessionStorage keys (cleared when tab closes)
export const SESSION_KEYS = {
  // Current exam attempt ID
  CURRENT_EXAM_ATTEMPT: "current-exam-attempt",

  // Webcam stream state
  WEBCAM_STREAM: "webcam-stream",

  // Face detection state
  FACE_DETECTION_STATE: "face-detection-state",

  // Disconnected page auto-retry counter (persists across reloads)
  DISCONNECTED_RETRY_COUNT: "disconnected-retry-count",

  // Path to return after connection is restored
  DISCONNECTED_RETURN_PATH: "disconnected-return-path",
};

// Storage expiration times (in seconds)
export const STORAGE_EXPIRY = {
  // Token expiry (should align with backend)
  AUTH_TOKEN: 3600, // 1 hour

  // Cache expiry times
  DASHBOARD_CACHE: 300, // 5 minutes
  COURSES_CACHE: 600, // 10 minutes
  EXAMS_CACHE: 600, // 10 minutes
};
