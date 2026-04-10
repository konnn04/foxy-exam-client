/**
 * Gates high-privilege IPC (process list, exec, HW monitors, etc.) to the exam take route only.
 * Not a cryptographic boundary — reduces accidental exposure outside /exams/:id/take/:attemptId.
 */

let examTakeRouteActive = false;

export function setExamIpcSessionActive(active: boolean): void {
  examTakeRouteActive = active;
}

export function isExamIpcSessionActive(): boolean {
  return examTakeRouteActive;
}

export class ExamIpcSessionError extends Error {
  readonly code = "IPC_EXAM_SESSION_REQUIRED";

  constructor(channel: string) {
    super(`IPC "${channel}" requires an active exam take session`);
    this.name = "ExamIpcSessionError";
  }
}

export function assertExamIpcSession(channel: string): void {
  if (!examTakeRouteActive) {
    throw new ExamIpcSessionError(channel);
  }
}
