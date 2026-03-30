import { create } from "zustand";
import type { ExamData, Answer } from "@/types/exam";

interface ExamState {
  data: ExamData | null;
  answers: Map<number, Answer>;
  flagged: Set<number>;
  timeLeft: number | null;
  globalIdx: number;
  submitting: boolean;
  wizardPhase: number;
  configError: string;

  setData: (data: ExamData | null) => void;
  setAnswers: (answers: Map<number, Answer> | ((prev: Map<number, Answer>) => Map<number, Answer>)) => void;
  setFlagged: (flagged: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  setTimeLeft: (time: number | null | ((prev: number | null) => number | null)) => void;
  setGlobalIdx: (idx: number | ((prev: number) => number)) => void;
  setSubmitting: (submitting: boolean) => void;
  setWizardPhase: (phase: number | ((prev: number) => number)) => void;
  setConfigError: (err: string) => void;
}

export const useExamStore = create<ExamState>((set) => ({
  data: null,
  answers: new Map(),
  flagged: new Set(),
  timeLeft: null,
  globalIdx: 0,
  submitting: false,
  wizardPhase: 0,
  configError: "",

  setData: (data) => set({ data }),
  setAnswers: (answers) =>
    set((state) => ({ answers: typeof answers === "function" ? answers(state.answers) : answers })),
  setFlagged: (flagged) =>
    set((state) => ({ flagged: typeof flagged === "function" ? flagged(state.flagged) : flagged })),
  setTimeLeft: (time) =>
    set((state) => ({ timeLeft: typeof time === "function" ? time(state.timeLeft) : time })),
  setGlobalIdx: (idx) =>
    set((state) => ({ globalIdx: typeof idx === "function" ? idx(state.globalIdx) : idx })),
  setSubmitting: (submitting) => set({ submitting }),
  setWizardPhase: (phase) =>
    set((state) => ({ wizardPhase: typeof phase === "function" ? phase(state.wizardPhase) : phase })),
  setConfigError: (configError) => set({ configError }),
}));
