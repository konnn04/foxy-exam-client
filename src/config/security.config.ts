/**
 * Security Configuration
 * Centralized security settings, lockdown rules, and exam integrity rules
 */

import { PRODUCTION } from "./env.config";

const DEV_FEATURES_ALLOWED = !PRODUCTION;

// Development mode settings
export const DEVELOPMENT_MODE = {
  // Enable development mode features
  ENABLED: DEV_FEATURES_ALLOWED && true,

  // Disable exam lockscreen in development (violations still logged but no overlay)
  NO_LOCKSCREEN_WHEN_DEV: DEV_FEATURES_ALLOWED && false,

  // ────── Dev Bypass ──────
  // Skip multi-screen detection (allows testing with multiple monitors)
  BYPASS_MULTI_SCREEN: DEV_FEATURES_ALLOWED && true,

  // Skip banned app detection (allows testing with dev tools, editors open)
  BYPASS_BANNED_APPS: DEV_FEATURES_ALLOWED && true,

  // Skip fullscreen requirement
  BYPASS_FULLSCREEN: DEV_FEATURES_ALLOWED && false,

  // Skip face verification during exam (periodic re-verification)
  BYPASS_FACE_VERIFICATION: DEV_FEATURES_ALLOWED && false,

  // Skip environment check (Electron API checks)
  BYPASS_ENVIRONMENT_CHECK: DEV_FEATURES_ALLOWED && false,
};

export const NO_LOCKSCREEN_WHEN_DEV_MODE = DEVELOPMENT_MODE.NO_LOCKSCREEN_WHEN_DEV;

export const OFFLINE_MODE_FEATURE_ENABLED = true;

// Exam lockdown configuration
export const EXAM_LOCKDOWN = {
  // Blocked keyboard shortcuts (prevented key combinations)
  BLOCKED_KEY_COMBINATIONS: ["c", "v", "a", "p", "s", "u", "shift"],

  // Blocked special keys
  BLOCKED_SPECIAL_KEYS: ["PrintScreen", "F11", "F12"],

  // Right-click disabled
  DISABLE_RIGHT_CLICK: true,

  // Context menu disabled
  DISABLE_CONTEXT_MENU: true,

  // Full screen required
  REQUIRE_FULLSCREEN: true,
};

// WebRTC STUN servers for P2P communication
export const STUN_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

// Security headers that should be enforced
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
