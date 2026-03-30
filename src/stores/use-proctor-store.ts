import { create } from "zustand";
import type { Violation } from "@/types/exam";

interface ProctorState {
  violations: Violation[];
  isBlurred: boolean;
  blurReason: string;
  hardwareLock: string;
  monitorWarning: string;
  bannedApps: string[];
  screenCount: number;
  wsDisconnected: boolean;
  isScreenSharing: boolean;
  isScreenRecording: boolean;
  isLiveKitConnected: boolean;
  faceAuthLockedMsg: string;

  addViolationAction: (v: Violation) => void;
  setIsBlurred: (b: boolean | ((prev: boolean) => boolean)) => void;
  setBlurReason: (r: string | ((prev: string) => string)) => void;
  setHardwareLock: (l: string | ((prev: string) => string)) => void;
  setMonitorWarning: (w: string) => void;
  setBannedApps: (apps: string[]) => void;
  setScreenCount: (c: number) => void;
  setWsDisconnected: (d: boolean) => void;
  setIsScreenSharing: (s: boolean) => void;
  setIsScreenRecording: (s: boolean) => void;
  setIsLiveKitConnected: (c: boolean) => void;
  setFaceAuthLockedMsg: (m: string) => void;
  
  clearViolations: () => void;
}

export const useProctorStore = create<ProctorState>((set) => ({
  violations: [],
  isBlurred: false,
  blurReason: "",
  hardwareLock: "",
  monitorWarning: "",
  bannedApps: [],
  screenCount: 1,
  wsDisconnected: false,
  isScreenSharing: false,
  isScreenRecording: false,
  isLiveKitConnected: false,
  faceAuthLockedMsg: "",

  addViolationAction: (v) => set((state) => ({ violations: [...state.violations, v] })),
  setIsBlurred: (b) => set((state) => ({ isBlurred: typeof b === "function" ? b(state.isBlurred) : b })),
  setBlurReason: (r) => set((state) => ({ blurReason: typeof r === "function" ? r(state.blurReason) : r })),
  setHardwareLock: (l) => set((state) => ({ hardwareLock: typeof l === "function" ? l(state.hardwareLock) : l })),
  setMonitorWarning: (w) => set({ monitorWarning: w }),
  setBannedApps: (apps) => set({ bannedApps: apps }),
  setScreenCount: (c) => set({ screenCount: c }),
  setWsDisconnected: (d) => set({ wsDisconnected: d }),
  setIsScreenSharing: (s) => set({ isScreenSharing: s }),
  setIsScreenRecording: (s) => set({ isScreenRecording: s }),
  setIsLiveKitConnected: (c) => set({ isLiveKitConnected: c }),
  setFaceAuthLockedMsg: (m) => set({ faceAuthLockedMsg: m }),

  clearViolations: () => set({ violations: [] }),
}));
