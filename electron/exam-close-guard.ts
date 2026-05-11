
let examCloseGuardActive = false;
let examCloseGuardMessage =
  "Bạn đang làm bài thi. Đóng ứng dụng có thể làm mất phần chưa nộp hoặc vi phạm quy chế.";

export function setExamCloseGuard(active: boolean, message?: string): void {
  examCloseGuardActive = active;
  if (typeof message === "string" && message.trim() !== "") {
    examCloseGuardMessage = message.trim();
  }
}

export function isExamCloseGuardActive(): boolean {
  return examCloseGuardActive;
}

export function getExamCloseGuardMessage(): string {
  return examCloseGuardMessage;
}
