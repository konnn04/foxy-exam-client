export interface Option {
  id: number;
  label?: string;
  content: string;
}

export interface Question {
  id: number;
  content: string;
  type: string; 
  options?: Option[];
  answers?: Option[];
  image_url?: string;
}

export interface Answer {
  question_id: number;
  answer_id?: number | null;
  answer_content?: string | null;
}

export interface ExamTrackingConfig {
  level: "none" | "standard" | "strict";
  requireApp?: boolean;          // Bắt buộc dùng Electron App
  requireCamera?: boolean;       // Mở Camera kiểm tra tập trung
  requireMic?: boolean;          // Ghi âm mic (Chưa chạy, lưu config)
  requireFaceAuth?: boolean;     // Giám sát xác minh khuôn mặt
  detectBannedApps?: boolean;    // Bật quét phần mềm cấm
  bannedApps?: string[];         // DS phần mềm cấm từ server
  bannedAppsExceptions?: string[]; // Các app cấm được ngoại lệ
}

export interface ExamData {
  exam: {
    id: number;
    name?: string;
    title?: string;
    duration?: number;
    duration_minutes?: number;
  };
  attempt: {
    id: number;
    started_at: string;
    time_remaining?: number;
  };
  config?: ExamTrackingConfig;   // Config tracking mode (default: strict if missing)
  questions: {
    data: Question[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  all_question_ids: number[];
  answers: Answer[];
  flagged: number[];
}

export interface Violation {
  type: string;
  timestamp: number;
  message: string;
}
