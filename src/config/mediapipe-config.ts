// ─── MediaPipe Face Landmarker Configuration ─────────────────────────────

/** CDN path for the MediaPipe Vision WASM bundle */
export const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

/** CDN path for the face landmarker model (float16) */
export const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// ─── Processing ──────────────────────────────────────────────────────────

/** Target interval between MediaPipe frames (ms). ~12 fps */
export const TARGET_INTERVAL_MS = 80;

// ─── Orientation Check (Phase 3 wizard) ──────────────────────────────────

/** Nose tip must be within this normalized range to count as "centered" */
export const NOSE_X_MIN = 0.3;
export const NOSE_X_MAX = 0.7;
export const NOSE_Y_MIN = 0.3;
export const NOSE_Y_MAX = 0.7;

/** Maximum |pitch| and |yaw| in degrees for "looking at camera" */
export const ORIENTATION_PITCH_THRESHOLD = 15;
export const ORIENTATION_YAW_THRESHOLD = 15;

/** Threshold for eye blendshapes. > this = eye is looking too far out/in/down/up (roughly 20 deg) */
export const EYE_LOOK_THRESHOLD = 0.45;

/** Smoothing: consecutive "good" frames before confirming looking */
export const LOOKING_CONFIRM_FRAMES = 3;
/** Smoothing: consecutive "bad" frames before confirming not looking */
export const NOT_LOOKING_CONFIRM_FRAMES = 10;

// ─── In-Exam Monitoring (useFaceMonitor) ─────────────────────────────────

/** Max allowed face bounding-box height (normalized, 0-1). > this = too close */
export const MAX_FACE_HEIGHT = 0.5;

/** Max allowed distance of face center from frame center (normalized) */
export const MAX_CENTER_OFFSET = 0.25;

/** Pitch/yaw thresholds for the in-exam "isLooking" check */
export const MONITOR_PITCH_THRESHOLD = 15;
export const MONITOR_YAW_THRESHOLD = 15;

/** Consecutive no-face frames before reporting face lost */
export const NULL_FACE_THRESHOLD = 15;
