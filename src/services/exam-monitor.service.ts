import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";

export const examMonitorService = {
  flushEvents: async (examId: string | number, payload: any, sessionId: string) => {
    return api.post(API_ENDPOINTS.EXAM_MONITOR_EVENTS(String(examId)), payload, {
      headers: {
        'X-Session-Id': sessionId,
      },
    });
  },

  sendSignal: async (examId: string | number, payload: any) => {
    return api.post(API_ENDPOINTS.EXAM_MONITOR_SIGNAL(examId), payload);
  }
};
