import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_WASM_URL, FACE_LANDMARKER_MODEL_URL } from "@/config/mediapipe-config";

export async function createFaceLandmarker(opts?: {
  blendshapes?: boolean;
}): Promise<FaceLandmarker> {
  const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
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

export function extractPitchYaw(matrixData: number[] | Float32Array | ArrayLike<number>): { pitch: number; yaw: number } {
  const pitch = Math.atan2(matrixData[9], matrixData[10]);
  const yaw = Math.asin(-Math.max(-1, Math.min(1, matrixData[8])));
  return {
    pitch: (pitch * 180) / Math.PI,
    yaw: (yaw * 180) / Math.PI,
  };
}
