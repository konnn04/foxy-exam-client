export interface Option {
  id: number;
  label?: string;
  content: string;
}

export interface GroupPassage {
  content: string;
  image_url?: string | null;
}

export interface Question {
  id: number;
  content: string;
  type: string;
  options?: Option[];
  answers?: Option[];
  image_url?: string;
  points?: number;
  weight?: number;
  /** Reading / group stem when this leaf belongs to a GROUP_QUESTION */
  group_passage?: GroupPassage | null;
}

export interface Answer {
  question_id: number;
  answer_id?: number | null;
  answer_content?: string | null;
}

export interface ExamTrackingConfig {
  level: "none" | "standard" | "strict" | "custom";
  requireApp?: boolean;
  requireScreenShare?: boolean;
  noMultiMonitor?: boolean;
  requireCamera?: boolean;
  monitorGaze?: boolean;
  requireMic?: boolean;
  requireFaceAuth?: boolean;
  detectBannedApps?: boolean;
  detectBannedObjects?: boolean;
  bannedApps?: string[];
  bannedAppsExceptions?: string[];
  face_verification_interval_seconds?: number;
  lockDevice?: boolean;
  device_lock_secret?: string;
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
  /** Set when row came from Laravel broadcast — do not POST again to /proctor/violations */
  fromServer?: boolean;
}
