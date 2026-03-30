import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";

export const proctorService = {
  reportViolation: async (examId: string | number, payload: any) => {
    return api.post(API_ENDPOINTS.EXAM_PROCTOR_VIOLATIONS(examId), payload);
  },

  uploadAudioClip: async (examId: string | number, payload: any) => {
    return api.post(API_ENDPOINTS.EXAM_MONITOR_AUDIO_CLIP(examId), payload);
  },

  uploadFaceCrop: async (examId: string | number, payload: any) => {
    return api.post(API_ENDPOINTS.EXAM_MONITOR_FACE_CROP(examId), payload);
  },
};
