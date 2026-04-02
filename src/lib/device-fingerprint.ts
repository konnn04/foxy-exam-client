/**
 * Device fingerprint generation for exam proctoring.
 * Collects stable browser/device signals and produces an HMAC-signed hash
 * that the server can verify to detect device changes during an exam.
 *
 * Signals used (stable within same browser+device):
 * - Canvas rendering hash (GPU-dependent)
 * - WebGL renderer + vendor
 * - Screen resolution + color depth
 * - Platform + hardwareConcurrency + deviceMemory
 * - Timezone + language
 * - Media device IDs (camera, mic)
 * - Audio context fingerprint
 */

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  language: string;
  webglRenderer: string;
  webglVendor: string;
  canvasHash: string;
  audioHash: string;
  mediaDevices: string[];
  electronMachineId?: string;
}

export interface DeviceFingerprint {
  fingerprint: string;
  info: DeviceInfo;
  checksum: string;
  timestamp: number;
}

async function getCanvasHash(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("ExamProctor:fp", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("ExamProctor:fp", 4, 17);

    const dataUrl = canvas.toDataURL();
    return await sha256Short(dataUrl);
  } catch {
    return "canvas-error";
  }
}

function getWebGLInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { renderer: "no-webgl", vendor: "no-webgl" };

    const debugInfo = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_debug_renderer_info"
    );
    if (!debugInfo)
      return { renderer: "no-debug-info", vendor: "no-debug-info" };

    return {
      renderer:
        (gl as WebGLRenderingContext).getParameter(
          debugInfo.UNMASKED_RENDERER_WEBGL
        ) || "unknown",
      vendor:
        (gl as WebGLRenderingContext).getParameter(
          debugInfo.UNMASKED_VENDOR_WEBGL
        ) || "unknown",
    };
  } catch {
    return { renderer: "error", vendor: "error" };
  }
}

async function getAudioHash(): Promise<string> {
  try {
    const audioCtx = new OfflineAudioContext(1, 44100, 44100);
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    oscillator.connect(compressor);
    compressor.connect(audioCtx.destination);
    oscillator.start(0);

    const buffer = await audioCtx.startRendering();
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(data[i]);
    }
    return sum.toFixed(6);
  } catch {
    return "audio-error";
  }
}

async function getMediaDeviceIds(): Promise<string[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.deviceId && d.deviceId !== "default")
      .map((d) => `${d.kind}:${d.deviceId.substring(0, 16)}`);
  } catch {
    return [];
  }
}

async function sha256Short(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const webgl = getWebGLInfo();
  const [canvasHash, audioHash, mediaDevices] = await Promise.all([
    getCanvasHash(),
    getAudioHash(),
    getMediaDeviceIds(),
  ]);

  const info: DeviceInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform || "unknown",
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || 0,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    canvasHash,
    audioHash,
    mediaDevices,
  };

  if (window.electronAPI?.getMachineId) {
    try {
      info.electronMachineId = await window.electronAPI.getMachineId();
    } catch {
      // not available
    }
  }

  return info;
}

/**
 * Generate a stable fingerprint hash from device signals.
 * Uses only fields that don't change between page reloads on the same device.
 */
export async function generateFingerprint(
  info: DeviceInfo,
  secret: string
): Promise<DeviceFingerprint> {
  const stableSignals = [
    info.platform,
    info.hardwareConcurrency.toString(),
    info.deviceMemory.toString(),
    info.screenResolution,
    info.colorDepth.toString(),
    info.timezone,
    info.webglRenderer,
    info.webglVendor,
    info.canvasHash,
    info.audioHash,
    info.electronMachineId || "",
  ].join("|");

  const fingerprint = await sha256Short(stableSignals);
  const timestamp = Date.now();
  const checksum = await hmacSha256(
    secret,
    `${fingerprint}:${timestamp}`
  );

  return { fingerprint, info, checksum, timestamp };
}
