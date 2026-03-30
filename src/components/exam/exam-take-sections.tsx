import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Maximize,
  MessageCircle,
  Monitor,
  Send,
  ShieldAlert,
  Video,
} from "lucide-react";
import type { Answer, ExamData } from "@/types/exam";
import { useExamStore } from "@/stores/use-exam-store";

interface ExamSidebarProps {
  formatTime: (seconds: number) => string;
  progressPercent: number;
  answeredCount: number;
  totalQuestions: number;
  allIds: number[];
  answers: Map<number, Answer>;
  flagged: Set<number>;
  globalIdx: number;
  changingPage: boolean;
  onGoToQuestion: (idx: number) => void;
  violationsCount: number;
  submitting: boolean;
  onSubmit: () => void;
}

export function ExamSidebar({
  formatTime,
  progressPercent,
  answeredCount,
  totalQuestions,
  allIds,
  answers,
  flagged,
  globalIdx,
  changingPage,
  onGoToQuestion,
  violationsCount,
  submitting,
  onSubmit,
}: ExamSidebarProps) {
  const timeLeft = useExamStore((s) => s.timeLeft);
  const isTimeLow = timeLeft !== null && timeLeft <= 300;

  return (
    <div className="w-72 border-r bg-card flex flex-col z-50 shadow-md">
      <div className={`p-4 border-b ${isTimeLow ? "bg-destructive/10" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Thời gian còn lại
          </span>
        </div>
        <p className={`text-2xl font-mono font-bold ${isTimeLow ? "text-destructive animate-pulse" : ""}`}>
          {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
        </p>
        <Progress value={progressPercent} className="mt-2" />
        <p className="text-xs text-muted-foreground mt-1">
          {answeredCount}/{totalQuestions} câu đã trả lời
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-5 gap-2">
          {allIds.map((qid, idx) => {
            const isAnswered = answers.has(qid);
            const isFlagged = flagged.has(qid);
            const isCurrent = idx === globalIdx;

            return (
              <button
                key={qid}
                disabled={changingPage}
                onClick={() => onGoToQuestion(idx)}
                className={`
                  relative h-10 w-10 rounded-lg text-sm font-medium transition-all
                  ${isCurrent ? "ring-2 ring-primary scale-110" : ""}
                  ${isAnswered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                  hover:scale-105 disabled:opacity-50 disabled:hover:scale-100
                `}
              >
                {idx + 1}
                {isFlagged && (
                  <Flag className="absolute -top-1 -right-1 h-3 w-3 text-yellow-500 fill-yellow-500" />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {violationsCount > 0 && (
        <div className="p-3 border-t bg-destructive/10">
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Vi phạm nội quy: {violationsCount} lần
          </p>
        </div>
      )}

      <div className="p-4 border-t">
        <Button className="w-full" variant="destructive" onClick={onSubmit} disabled={submitting}>
          <Send className="h-4 w-4 mr-2" />
          {submitting ? "Đang nộp..." : "Nộp bài"}
        </Button>
      </div>
    </div>
  );
}

interface ExamMainContentProps {
  data: ExamData;
  currentQuestion: any;
  globalIdx: number;
  totalQuestions: number;
  changingPage: boolean;
  flagged: Set<number>;
  onToggleFlag: (questionId: number) => void;
  onSelectOption: (questionId: number, optionId: number) => void;
  onEssayChange: (questionId: number, content: string) => void;
  answers: Map<number, Answer>;
  isBlurred: boolean;
  monitorWarning: string;
  onGoToQuestion: (idx: number) => void;
}

export function ExamMainContent({
  data,
  currentQuestion,
  globalIdx,
  totalQuestions,
  changingPage,
  flagged,
  onToggleFlag,
  onSelectOption,
  onEssayChange,
  answers,
  isBlurred,
  monitorWarning,
  onGoToQuestion,
}: ExamMainContentProps) {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-muted/20">
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="font-semibold">{data.exam.name ?? data.exam.title}</h1>
        <div className="flex items-center gap-2">
          {!changingPage && currentQuestion && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleFlag(currentQuestion.id)}
              className={flagged.has(currentQuestion.id) ? "text-yellow-600 border-yellow-600" : ""}
            >
              <Flag className={`h-4 w-4 mr-1 ${flagged.has(currentQuestion.id) ? "fill-yellow-500" : ""}`} />
              {flagged.has(currentQuestion.id) ? "Bỏ đánh dấu" : "Đánh dấu"}
            </Button>
          )}
          <Badge variant="secondary">Câu {globalIdx + 1} / {totalQuestions}</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div
          className="max-w-3xl mx-auto"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: (isBlurred || monitorWarning !== "") ? "none" : "auto",
          }}
        >
          {changingPage || !currentQuestion ? (
            <div className="flex justify-center items-center py-20 text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
              Đang chuyển trang...
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-primary mb-3">Câu {globalIdx + 1}</h2>
                <div
                  className="prose dark:prose-invert max-w-none prose-sm md:prose-base"
                  dangerouslySetInnerHTML={{ __html: currentQuestion.content }}
                />
                {currentQuestion.image_url && (
                  <img
                    src={currentQuestion.image_url}
                    alt="Question"
                    className="max-w-full rounded-lg border mt-4"
                    draggable={false}
                  />
                )}
              </div>

              {currentQuestion.type === "essay" ? (
                <textarea
                  className="w-full min-h-[200px] rounded-lg border bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  placeholder="Nhập câu trả lời của bạn..."
                  value={answers.get(currentQuestion.id)?.answer_content ?? ""}
                  onChange={(e) => onEssayChange(currentQuestion.id, e.target.value)}
                  style={{ userSelect: "text", WebkitUserSelect: "text" }}
                />
              ) : (
                <div className="space-y-3">
                  {(currentQuestion.options ?? currentQuestion.answers ?? []).map((option: any, oi: number) => {
                    const isSelected = String(answers.get(currentQuestion.id)?.answer_id) === String(option.id);
                    const label = option.label ?? String.fromCharCode(65 + oi);

                    return (
                      <button
                        key={option.id}
                        onClick={() => onSelectOption(currentQuestion.id, option.id)}
                        className={`
                          w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-all
                          ${isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                          }
                        `}
                      >
                        <div
                          className={`
                            mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                            ${isSelected ? "border-primary" : "border-muted-foreground/30"}
                          `}
                        >
                          {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <span className="font-medium text-sm block mb-1">{label}.</span>{" "}
                          <div
                            className="text-sm prose dark:prose-invert max-w-none inline-block mt-0"
                            dangerouslySetInnerHTML={{ __html: String(option.content) }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between border-t p-4">
        <Button
          variant="outline"
          onClick={() => onGoToQuestion(globalIdx - 1)}
          disabled={globalIdx === 0 || changingPage}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Câu trước
        </Button>
        <Button
          variant="outline"
          onClick={() => onGoToQuestion(globalIdx + 1)}
          disabled={globalIdx === totalQuestions - 1 || changingPage}
        >
          Câu sau
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

interface ExamOverlayProps {
  showLockOverlay: boolean;
  isBlurred: boolean;
  hardwareLock: string;
  monitorWarning: string;
  blurReason: string;
  violationsCount: number;
  devBypassLock: boolean;
  onSetDevBypassLock: (value: boolean) => void;
  onDismissBlur: () => void;
  onClearHardwareLock: () => void;
}

export function ExamOverlay({
  showLockOverlay,
  isBlurred,
  hardwareLock,
  monitorWarning,
  blurReason,
  violationsCount,
  devBypassLock,
  onSetDevBypassLock,
  onDismissBlur,
  onClearHardwareLock,
}: ExamOverlayProps) {
  return (
    <>
      {showLockOverlay && !isBlurred && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="bg-card border-2 border-primary/50 rounded-2xl p-8 max-w-sm text-center space-y-4 shadow-xl">
            <div className="flex justify-center">
              <ShieldAlert className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Tạm khóa phần thi</h2>
            <p className="text-muted-foreground">{monitorWarning}</p>
            <p className="text-xs text-muted-foreground mt-4">
              Bài thi sẽ tự động mở lại khi hệ thống xác định khuôn mặt hợp lệ.
            </p>
            {DEVELOPMENT_MODE.ENABLED && (
              <Button
                variant="outline"
                className="w-full mt-4 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={() => onSetDevBypassLock(true)}
              >
                [Dev] Bỏ qua cảnh báo
              </Button>
            )}
          </div>
        </div>
      )}

      {(isBlurred || hardwareLock !== "") && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
          <div className="bg-card border rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-destructive">
              {hardwareLock !== "" ? "Thiết bị/Phần mềm không hợp lệ!" : "Cảnh báo vi phạm!"}
            </h2>
            <p className="text-muted-foreground">{hardwareLock !== "" ? hardwareLock : blurReason}</p>
            <p className="text-sm text-muted-foreground">
              Hành vi này đã được hệ thống giám sát ghi nhận ({violationsCount} lần vi phạm).
              <br />
              Vui lòng xử lý vấn đề hiển thị trên để tiếp tục làm bài.
            </p>
            {hardwareLock !== "" && !devBypassLock ? (
              <div className="text-destructive font-semibold animate-pulse mt-4 bg-destructive/10 p-3 rounded-lg border border-destructive/20 whitespace-pre-wrap text-sm">
                Đang chờ hệ thống xác nhận khắc phục vấn đề...
              </div>
            ) : (
              <Button onClick={onDismissBlur} className="w-full mt-4">
                <Maximize className="h-4 w-4 mr-2" />
                Quay lại làm bài & Tiếp tục
              </Button>
            )}

            {DEVELOPMENT_MODE.ENABLED && hardwareLock !== "" && (
              <Button
                onClick={() => {
                  onClearHardwareLock();
                  onDismissBlur();
                }}
                variant="outline"
                className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2"
              >
                [Dev] Ignore Lock
              </Button>
            )}
            {DEVELOPMENT_MODE.ENABLED && hardwareLock === "" && (
              <Button
                onClick={onDismissBlur}
                variant="outline"
                className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2"
              >
                [Dev] Bỏ qua cảnh báo nhanh
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface ExamStatusBarProps {
  violationsCount: number;
  screenCount: number;
  requireCamera: boolean;
  detectBannedApps: boolean;
  strictMode: boolean;
  bannedApps: string[];
  isScreenSharing: boolean;
  onChatToggle?: () => void;
  unreadCount?: number;
}

export function ExamStatusBar({
  violationsCount,
  screenCount,
  requireCamera,
  detectBannedApps,
  strictMode,
  bannedApps,
  isScreenSharing,
  onChatToggle,
  unreadCount = 0,
}: ExamStatusBarProps) {
  return (
    <div className="h-7 bg-card border-t shrink-0 flex items-center px-4 justify-between z-40 text-xs text-muted-foreground font-mono">
      <div className="flex gap-4">
        <div className="flex items-center gap-1" title="Số vi phạm">
          <AlertTriangle className={`h-3 w-3 ${violationsCount > 0 ? "text-destructive" : ""}`} />
          <span className={violationsCount > 0 ? "text-destructive font-bold" : ""}>{violationsCount} Vi phạm</span>
        </div>
        <div className="flex items-center gap-1" title="Số Màn hình">
          <Monitor className={`h-3 w-3 ${screenCount > 1 ? "text-destructive font-bold" : ""}`} />
          <span className={screenCount > 1 ? "text-destructive font-bold" : ""}>{screenCount} Màn hình</span>
        </div>
        {requireCamera && (
          <div className="flex items-center gap-1" title="Số Camera">
            <Video className="h-3 w-3 text-green-500" />
            <span>1 Camera</span>
          </div>
        )}
        {(detectBannedApps || strictMode) && (
          <div className="flex items-center gap-1" title="Giám sát tiến trình">
            <ShieldAlert className="h-3 w-3 text-green-500" />
            <span>Theo dõi tiến trình</span>
          </div>
        )}
        <div className="flex items-center gap-1" title="Giám sát màn hình">
          <Monitor className={`h-3 w-3 ${isScreenSharing ? "text-green-500" : "text-destructive"}`} />
          <span className={isScreenSharing ? "text-green-600" : "text-destructive font-bold"}>
            {isScreenSharing ? "Đang chia sẻ màn hình" : "Mất chia sẻ màn hình"}
          </span>
        </div>
        {bannedApps.length > 0 && (
          <div className="flex items-center gap-1 text-destructive font-bold">
            <ShieldAlert className="h-3 w-3" />
            <span>Cấm: {bannedApps.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>Hệ thống giám sát thi KLTN</span>
        {onChatToggle && (
          <button
            onClick={onChatToggle}
            className="relative flex items-center gap-1 px-2 py-0.5 rounded hover:bg-primary/10 transition-colors cursor-pointer"
            title="Chat với Giám thị"
          >
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary font-medium">Chat</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1 bg-destructive text-white text-[9px] rounded-full h-3.5 min-w-[14px] flex items-center justify-center font-bold px-0.5">
                {unreadCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
