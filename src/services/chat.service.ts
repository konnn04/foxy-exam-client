import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";

export interface ChatMessage {
  id: number;
  attempt_id: number;
  sender_id: number;
  sender_role: string;
  message: string;
  created_at: string;
  sender: {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
  };
}

export const chatService = {
  getHistory: async (examId: string | number, attemptId: string | number) => {
    return api.get<{ chats: ChatMessage[] }>(API_ENDPOINTS.EXAM_CHAT(examId, attemptId));
  },

  sendMessage: async (examId: string | number, attemptId: string | number, message: string) => {
    return api.post<{ chat: ChatMessage }>(API_ENDPOINTS.EXAM_CHAT(examId, attemptId), { message });
  },
};
