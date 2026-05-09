/**
 * exam-take-sections — barrel re-export.
 *
 * Split from a single 814-line file into focused modules:
 *   exam-top-nav      — ExamTopNav + QuestionIndexButton
 *   exam-main-content — ExamMainContent (question rendering)
 *   exam-overlay      — ExamOverlay (lock / blur screens)
 *   exam-status-bar   — ExamStatusBar + KeyboardLogBar
 */

export { ExamTopNav } from "./exam-top-nav";
export type { ExamTopNavProps } from "./exam-top-nav";

export { ExamMainContent } from "./exam-main-content";
export type { ExamMainContentProps } from "./exam-main-content";

export { ExamOverlay } from "./exam-overlay";
export type { ExamOverlayProps } from "./exam-overlay";

export { ExamStatusBar, KeyboardLogBar } from "./exam-status-bar";
