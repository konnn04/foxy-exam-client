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
    filesetResolverPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  }
  return filesetResolverPromise;
}

async function createNewFaceLandmarker(opts?: FaceLandmarkerOpts): Promise<FaceLandmarker> {
  const filesetResolver = await getFilesetResolver();
  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate: "GPU",
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

  entry.refCount += 1;

  if (entry.instance) {
    return entry.instance;
  }

  if (!entry.createPromise) {
    entry.createPromise = createNewFaceLandmarker(opts)
      .then((instance) => {
        entry!.instance = instance;
        return instance;
      })
      .finally(() => {
        entry!.createPromise = null;
      });
  }

  return entry.createPromise;
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
    entry!.instance.close();
    entry!.instance = null;
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
