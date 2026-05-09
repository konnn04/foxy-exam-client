import { 
  AppWindow, Camera, Monitor, LayoutGrid, Eye, Mic, ScanFace, 
  Ban, Box, Fingerprint, Smartphone 
} from "lucide-react";
import type { ExamTrackingConfig } from "@/types/exam";

// ── Wizards / Precheck
export const FLASH_SEQUENCE = [
  { color: "#ff4444", label: "precheck.colorRed", ms: 400 },
  { color: "#4444ff", label: "precheck.colorBlue", ms: 400 },
  { color: "#44ff44", label: "precheck.colorGreen", ms: 400 },
];

export const PRECHECK_STEPS = [
  { key: "info", label: "precheck.stepInfo" },
  { key: "camera", label: "precheck.stepCamera" },
  { key: "mediapipe", label: "precheck.stepMediapipe" },
  { key: "faceauth", label: "precheck.stepFaceAuth" },
  { key: "liveness", label: "precheck.stepLiveness" },
  { key: "dual_camera", label: "precheck.stepPhoneCam" },
  { key: "environment", label: "precheck.stepEnvironment" },
] as const;

export const PRECHECK_STEP_ORDER = ["loading", "info", "camera", "mediapipe", "faceauth", "liveness", "dual_camera", "environment"] as const;

export const CONFIG_ITEMS: { key: keyof ExamTrackingConfig; icon: React.ComponentType<{ className?: string }>; label: string; desc: string }[] = [
  { key: "requireApp", icon: AppWindow, label: "config.requireApp", desc: "config.requireAppDesc" },
  { key: "requireCamera", icon: Camera, label: "config.requireCamera", desc: "config.requireCameraDesc" },
  { key: "requireScreenShare", icon: Monitor, label: "config.requireScreenShare", desc: "config.requireScreenShareDesc" },
  { key: "noMultiMonitor", icon: LayoutGrid, label: "config.noMultiMonitor", desc: "config.noMultiMonitorDesc" },
  { key: "monitorGaze", icon: Eye, label: "config.monitorGaze", desc: "config.monitorGazeDesc" },
  { key: "requireMic", icon: Mic, label: "config.requireMic", desc: "config.requireMicDesc" },
  { key: "requireFaceAuth", icon: ScanFace, label: "config.requireFaceAuth", desc: "config.requireFaceAuthDesc" },
  { key: "requireDualCamera", icon: Smartphone, label: "config.requireDualCamera", desc: "config.requireDualCameraDesc" },
  { key: "detectBannedApps", icon: Ban, label: "config.detectBannedApps", desc: "config.detectBannedAppsDesc" },
  { key: "detectBannedObjects", icon: Box, label: "config.detectBannedObjects", desc: "config.detectBannedObjectsDesc" },
  { key: "lockDevice", icon: Fingerprint, label: "config.lockDevice", desc: "config.lockDeviceDesc" },
];
