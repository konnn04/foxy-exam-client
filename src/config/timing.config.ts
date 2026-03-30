/**
 * Timing Configuration
 * Centralized timing constants for animations, intervals, and timeouts
 */

// Event flushing configuration
export const EVENT_FLUSHING = {
  // Interval to flush buffered events (in milliseconds)
  FLUSH_INTERVAL_MS: 5000,

  // Buffer size threshold to trigger immediate flush
  BUFFER_SIZE_THRESHOLD: 100,
};

// Environment check timings
export const ENVIRONMENT_CHECK_TIMING = {
  // Total time required for environment scan
  REQUIRED_SCAN_TIME_MS: 5000,

  // Progress interval for updating UI
  PROGRESS_INTERVAL_MS: 500,

  // Messages shown at specific timestamps
  SCAN_MESSAGES: {
    1000: "Đang phân tích thiết bị kết nối...",
    2000: "Đang đếm số lượng màn hình phụ...",
    3000: "Đang quét các tiến trình chạy ngầm...",
    4000: "Đang đối chiếu danh sách phần mềm cấm...",
  },

  // Delay before showing success feedback
  SUCCESS_DELAY_MS: 1500,

  // Timeout before allowing retry
  RETRY_TIMEOUT_MS: 1500,
};

// Face authentication check timings
export const FACE_AUTH_CHECK_TIMING = {
  // Total duration to collect face samples
  TOTAL_CHECK_DURATION_MS: 3000,

  // Progress bar update interval
  PROGRESS_INTERVAL_MS: 100,

  // Delay after successful authentication
  SUCCESS_DELAY_MS: 1500,

  // FFT size for audio liveness check
  FFT_SIZE: 256,
};

// Webcam popup timings
export const WEBCAM_POPUP_TIMING = {
  // Interval for cropping and sending face data
  FACE_CROP_INTERVAL_MS: 10000,
};

// Face monitoring timings
export const FACE_MONITOR_TIMING = {
  // Debounce interval for eye look-away detection
  EYE_LOOKAWAY_DEBOUNCE_MS: 500,

  // Interval for FPS metric calculation
  FPS_CALCULATION_INTERVAL_MS: 1000,
};

// Connection recovery retry schedule
export const CONNECTION_RECOVERY_TIMING = {
  // Auto retry delays in seconds: 5s -> 10s -> 60s
  RETRY_DELAYS_SECONDS: [5, 10, 60],

  // Maximum automatic retry attempts
  MAX_AUTO_RETRIES: 3,
};

// General timing constants
export const ANIMATION_TIMING = {
  // Standard animation duration
  STANDARD_DURATION_MS: 300,

  // Short animation duration
  SHORT_DURATION_MS: 150,

  // Long animation duration
  LONG_DURATION_MS: 500,
};
