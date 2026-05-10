import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_WASM_URL, FACE_LANDMARKER_MODEL_URL } from "@/config/mediapipe-config";

type FaceLandmarkerOpts = {
  blendshapes?: boolean;
};

type CacheEntry = {
  instance: FaceLandmarker | null;
  createPromise: Promise<FaceLandmarker> | null;
  refCount: number;
  disposeTimer: number | null;
};

const CACHE_IDLE_DISPOSE_MS = 180_000;
let filesetResolverPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
const faceLandmarkerCache = new Map<string, CacheEntry>();

function cacheKey(opts?: FaceLandmarkerOpts): string {
  return opts?.blendshapes ? "blendshapes:1" : "blendshapes:0";
}

async function getFilesetResolver() {
  if (!filesetResolverPromise) {
    filesetResolverPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL).catch((err) => {
      // Critical: first failed fetch must not leave a permanently rejected promise,
      // otherwise retries never hit the network again (common on Windows when Wi‑Fi
      // is not ready yet at app launch).
      filesetResolverPromise = null;
      throw err;
    });
  }
  return filesetResolverPromise;
}

async function createNewFaceLandmarker(opts?: FaceLandmarkerOpts): Promise<FaceLandmarker> {
  const filesetResolver = await getFilesetResolver();
  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate: "CPU",
    },
    outputFaceBlendshapes: opts?.blendshapes ?? false,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

export async function acquireFaceLandmarker(opts?: FaceLandmarkerOpts): Promise<FaceLandmarker> {
  const key = cacheKey(opts);
  let entry = faceLandmarkerCache.get(key);
  if (!entry) {
    entry = {
      instance: null,
      createPromise: null,
      refCount: 0,
      disposeTimer: null,
    };
    faceLandmarkerCache.set(key, entry);
  }

  if (entry.disposeTimer !== null) {
    window.clearTimeout(entry.disposeTimer);
    entry.disposeTimer = null;
  }

  if (entry.instance) {
    entry.refCount += 1;
    return entry.instance;
  }

  if (!entry.createPromise) {
    entry.createPromise = createNewFaceLandmarker(opts).then((instance) => {
      entry!.instance = instance;
      return instance;
    });
  }

  try {
    const instance = await entry.createPromise;
    entry.refCount += 1;
    return instance;
  } catch (err) {
    // Drop rejected promise so the next acquire can retry (e.g. network came online).
    entry.createPromise = null;
    entry.instance = null;
    throw err;
  }
}

export function releaseFaceLandmarker(opts?: FaceLandmarkerOpts): void {
  const key = cacheKey(opts);
  const entry = faceLandmarkerCache.get(key);
  if (!entry) return;

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount > 0) return;
  if (!entry.instance) return;

  if (entry.disposeTimer !== null) {
    window.clearTimeout(entry.disposeTimer);
  }

  entry.disposeTimer = window.setTimeout(() => {
    if (entry!.refCount > 0 || !entry!.instance) return;
    try {
      entry!.instance.close();
    } catch {
      /* ignore */
    }
    entry!.instance = null;
    entry!.createPromise = null;
    entry!.disposeTimer = null;
  }, CACHE_IDLE_DISPOSE_MS);
}

export async function preloadFaceLandmarker(opts?: FaceLandmarkerOpts): Promise<void> {
  await acquireFaceLandmarker(opts);
  releaseFaceLandmarker(opts);
}

export async function createFaceLandmarker(opts?: FaceLandmarkerOpts): Promise<FaceLandmarker> {
  return acquireFaceLandmarker(opts);
}

export function extractPitchYaw(matrixData: number[] | Float32Array | ArrayLike<number>): { pitch: number; yaw: number } {
  const pitch = Math.atan2(matrixData[9], matrixData[10]);
  const yaw = Math.asin(-Math.max(-1, Math.min(1, matrixData[8])));
  return {
    pitch: (pitch * 180) / Math.PI,
    yaw: (yaw * 180) / Math.PI,
  };
}
