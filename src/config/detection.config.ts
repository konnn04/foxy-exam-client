/**
 * Detection Configuration
 * Centralized face detection, orientation, liveness check, and monitoring thresholds
 */

// ─── MediaPipe Models Configuration ──────────────────────────────────────

/** Max camera capture FPS (getUserMedia + LiveKit encode). Lower = less CPU / bandwidth. */
export const CAMERA_CAPTURE_MAX_FPS = 10;

export const MEDIAPIPE_CONFIG = {
  // WASM module URL
  WASM_URL: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",

  // Face Landmarker model URL
  FACE_LANDMARKER_MODEL_URL:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

  // Target interval between frames (~12 fps)
  TARGET_INTERVAL_MS: 80,

  /**
   * Exam-session gaze: min ms between FaceLandmarker runs. Higher = less CPU & UI lag;
   * lower = snappier warnings (was effectively ~200ms inline; default 450ms ≈ 2.2 fps).
   */
  FACE_GAZE_PROCESS_INTERVAL_MS: 450,
};

// ─── Face Centering & Orientation Thresholds ────────────────────────────

export const FACE_CENTERING = {
  // Normalized coordinates (0-1) for "centered" nose position
  NOSE_X_MIN: 0.3,
  NOSE_X_MAX: 0.7,
  NOSE_Y_MIN: 0.3,
  NOSE_Y_MAX: 0.7,
};

// ─── Orientation Detection (Head Position) ──────────────────────────────

export const ORIENTATION_THRESHOLDS = {
  // Pitch threshold in degrees (forward/backward head tilt)
  PITCH_THRESHOLD: 15,

  // Yaw threshold in degrees (left/right head turn)
  YAW_THRESHOLD: 15,
};

// ─── Eye Contact Detection ──────────────────────────────────────────────

export const EYE_CONTACT = {
  // Eye blendshape threshold (> this = looking away)
  // ~0.45 = approximately 20 degrees
  LOOK_THRESHOLD: 0.45,

  // Consecutive "good" frames before confirming "looking"
  LOOKING_CONFIRM_FRAMES: 3,

  // Consecutive "bad" frames before confirming "not looking"
  NOT_LOOKING_CONFIRM_FRAMES: 10,
};

// ─── Face Detection Boundaries ──────────────────────────────────────────

export const FACE_BOUNDARIES = {
  // Max allowed face height (normalized, 0-1). > this = too close to camera
  MAX_HEIGHT: 0.5,

  // Max allowed distance of face center from frame center (normalized)
  MAX_CENTER_OFFSET: 0.25,
};

// ─── Monitoring Thresholds (In-Exam) ────────────────────────────────────

export const MONITORING_THRESHOLDS = {
  // Pitch/yaw thresholds for in-exam "looking" check
  PITCH_THRESHOLD: 15,
  YAW_THRESHOLD: 15,

  // Consecutive no-face frames before reporting face lost
  NULL_FACE_THRESHOLD: 15,
};

// ─── Mouth / Talking Detection ──────────────────────────────────────
// Reduced sensitivity to avoid false positives (e.g. breathing with open mouth)
export const MOUTH_DETECTION = {
  JAW_OPEN_THRESHOLD: 0.55,
  HISTORY_FRAMES: 15,
  VARIANCE_THRESHOLD: 0.04,
  SUSTAINED_MS: 4000,
  LOG_COOLDOWN_MS: 30000,
};

// ─── Face Event Logging ──────────────────────────────────────────────

export const FACE_EVENT_LOG = {
  COOLDOWN_MS: 20000,
};

// ─── Liveness Detection ──────────────────────────────────────────────────

export const LIVENESS_CONFIG = {
  // FFT size for audio liveness check
  AUDIO_FFT_SIZE: 256,

  // Required face samples for liveness confirmation
  REQUIRED_SAMPLES: 30,
};
