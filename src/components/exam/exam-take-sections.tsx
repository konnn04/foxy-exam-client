import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flag,
  LayoutGrid,
  Maximize,
  MessageCircle,
  Monitor,
  Send,
  ShieldAlert,
  Video,
} from "lucide-react";
import type { Answer } from "@/types/exam";
import { useExamStore } from "@/stores/use-exam-store";
import { useTranslation } from "react-i18next";
import { MarkdownExamContent } from "@/components/exam/markdown-exam-content";
import { isLeafAnswered } from "@/lib/exam-answer-utils";
import { setExamLocale } from "@/i18n";
import { useEffect } from "react";

export interface ExamTopNavProps {
  examTitle: string;
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

/** Indices to show in compact strip: first, last, and window around current (deduped, sorted). */
function compactQuestionIndices(globalIdx: number, total: number): number[] {
  if (total <= 0) return [];
  if (total <= 14) return Array.from({ length: total }, (_, i) => i);
  const set = new Set<number>();
  set.add(0);
  set.add(total - 1);
  const radius = 4;
  for (let d = -radius; d <= radius; d++) {
    const i = globalIdx + d;
    if (i >= 0 && i < total) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}

function QuestionIndexButton({
  idx,
  isCurrent,
  isAnswered,
  isFlagged,
  disabled,
  compact,
  title,
  onSelect,
}: {
  idx: number;
  isCurrent: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  disabled: boolean;
  compact: boolean;
  title: string;
  onSelect: () => void;
}) {
  const size = compact ? "h-7 min-w-7 text-[10px]" : "h-9 min-w-9 text-xs";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      title={title}
      className={`
        relative flex shrink-0 items-center justify-center rounded-md font-semibold transition-all
        ${size}
        ${isCurrent ? "ring-2 ring-primary ring-offset-1 ring-offset-background z-[1]" : ""}
        ${isAnswered ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground border"}
        hover:opacity-90 disabled:opacity-40
      `}
    >
      {idx + 1}
      {isFlagged && (
        <Flag className="absolute -right-0.5 -top-0.5 h-2 w-2 fill-amber-400 text-amber-600" />
      )}
    </button>
  );
}

/** Điều hướng câu hỏi + thời gian + nộp bài — nằm trên cùng màn hình thi. */
export function ExamTopNav({
  examTitle,
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
}: ExamTopNavProps) {
  const { t, i18n } = useTranslation();
  const timeLeft = useExamStore((s) => s.timeLeft);
  const isTimeLow = timeLeft !== null && timeLeft <= 300;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);

  const stripIndices = useMemo(
    () => compactQuestionIndices(globalIdx, totalQuestions),
    [globalIdx, totalQuestions]
  );

  const renderPill = (idx: number) => {
    const qid = allIds[idx]!;
    return (
      <QuestionIndexButton
        key={qid}
        idx={idx}
        isCurrent={idx === globalIdx}
        isAnswered={isLeafAnswered(answers.get(qid))}
        isFlagged={flagged.has(qid)}
        disabled={changingPage}
        compact={totalQuestions > 14}
        title={t("exam.question", { n: idx + 1 })}
        onSelect={() => {
          onGoToQuestion(idx);
          setSheetOpen(false);
        }}
      />
    );
  };

  return (
    <header className="z-50 shrink-0 border-b bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 md:px-4">
        <h1 className="min-w-0 max-w-[min(100%,14rem)] truncate text-sm font-semibold md:max-w-xs md:text-base">
          {examTitle}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setExamLocale(i18n.language.startsWith("vi") ? "en" : "vi")}
          >
            {i18n.language.startsWith("vi") ? "EN" : "VI"}
          </Button>
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-sm tabular-nums ${
              isTimeLow ? "border-destructive/50 bg-destructive/10 text-destructive" : "bg-muted/50"
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className={isTimeLow ? "animate-pulse font-bold" : ""}>
              {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 shrink-0 font-semibold"
            onClick={onSubmit}
            disabled={submitting}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? t("common.submitting") : t("common.submit")}
          </Button>
        </div>
      </div>

      <div className="border-t border-border/50 bg-muted/20 px-2 py-1.5 md:px-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{t("exam.questionNav")}</span>
            <Badge variant="outline" className="max-w-full truncate font-normal">
              {t("exam.ofTotal", { current: globalIdx + 1, total: totalQuestions })}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1.5 text-muted-foreground"
              onClick={() => setNavExpanded((v) => !v)}
              aria-expanded={navExpanded}
              aria-label={navExpanded ? t("exam.collapseNav") : t("exam.expandNav")}
            >
              {navExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </span>
          <span className="shrink-0 text-right">
            {t("exam.answered", { done: answeredCount, total: totalQuestions })}
            {violationsCount > 0 && (
              <span className="ml-2 text-destructive">
                · {t("exam.violations", { count: violationsCount })}
              </span>
            )}
          </span>
        </div>
        <Progress value={progressPercent} className="mb-1.5 h-1" />

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          {!navExpanded ? (
            <div className="flex items-center justify-center gap-2 py-1">
              <SheetTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 shadow-sm">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {t("exam.questionList")}
                  <Badge variant="outline" className="ml-0.5 font-mono text-[10px]">
                    {totalQuestions}
                  </Badge>
                </Button>
              </SheetTrigger>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={globalIdx === 0 || changingPage}
                  onClick={() => onGoToQuestion(globalIdx - 1)}
                  aria-label={t("exam.prev")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {stripIndices.map((idx, i) => {
                    const prev = stripIndices[i - 1];
                    const showEllipsis = i > 0 && prev !== undefined && idx - prev > 1;
                    return (
                      <span key={`wrap-${idx}`} className="flex items-center gap-1">
                        {showEllipsis && (
                          <span className="select-none px-0.5 text-[10px] text-muted-foreground">···</span>
                        )}
                        {renderPill(idx)}
                      </span>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={globalIdx >= totalQuestions - 1 || changingPage}
                  onClick={() => onGoToQuestion(globalIdx + 1)}
                  aria-label={t("exam.next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 w-full shrink-0 gap-1.5 shadow-sm sm:w-auto"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="truncate">{t("exam.questionList")}</span>
                </Button>
              </SheetTrigger>
            </div>
          )}

          <SheetContent side="bottom" className="h-[min(85dvh,32rem)] gap-0 rounded-t-xl p-0" showCloseButton>
            <SheetHeader className="border-b px-4 py-3 text-left">
              <SheetTitle>{t("exam.allQuestions")}</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(min(85dvh,32rem)-5.5rem)] px-3 pb-4">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1.5 py-3 sm:grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]">
                {allIds.map((_, idx) => renderPill(idx))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

interface ExamMainContentProps {
  currentQuestion: any;
  globalIdx: number;
  totalQuestions: number;
  changingPage: boolean;
  flagged: Set<number>;
  onToggleFlag: (questionId: number) => void;
  onSelectOption: (questionId: number, optionId: number) => void;
  onEssayChange: (questionId: number, content: string) => void;
  onShortAnswerChange: (questionId: number, content: string) => void;
  onTrueFalseSelect: (questionId: number, value: boolean) => void;
  onFillBlankChange: (questionId: number, slots: string[]) => void;
  answers: Map<number, Answer>;
  isBlurred: boolean;
  monitorWarning: string;
  onGoToQuestion: (idx: number) => void;
}

function questionTypeU(type: string): string {
  return String(type ?? "").toUpperCase();
}

export function ExamMainContent({
  currentQuestion,
  globalIdx,
  totalQuestions,
  changingPage,
  flagged,
  onToggleFlag,
  onSelectOption,
  onEssayChange,
  onShortAnswerChange,
  onTrueFalseSelect,
  onFillBlankChange,
  answers,
  isBlurred,
  monitorWarning,
  onGoToQuestion,
}: ExamMainContentProps) {
  const { t } = useTranslation();
  const qType = currentQuestion ? questionTypeU(currentQuestion.type) : "";

  const fillSlots = (currentQuestion?.answers ?? currentQuestion?.options ?? []) as {
    id: number;
    content?: string;
  }[];
  const fillSlotValues: string[] = (() => {
    const n = fillSlots.length;
    const raw = answers.get(currentQuestion?.id)?.answer_content;
    const base = Array.from({ length: n }, () => "");
    if (!raw) return base;
    try {
      const j = JSON.parse(String(raw)) as unknown;
      if (Array.isArray(j)) {
        return Array.from({ length: n }, (_, i) => String(j[i] ?? ""));
      }
    } catch {
      /* ignore */
    }
    return base;
  })();

  return (
    <div className="flex flex-1 flex-col relative overflow-hidden bg-muted/15">
      <div className="flex items-center justify-end gap-2 border-b border-border/60 bg-background/80 px-4 py-2">
        {!changingPage && currentQuestion && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleFlag(currentQuestion.id)}
            className={flagged.has(currentQuestion.id) ? "border-amber-500/60 text-amber-700 dark:text-amber-400" : ""}
          >
            <Flag className={`h-4 w-4 mr-1 ${flagged.has(currentQuestion.id) ? "fill-amber-400" : ""}`} />
            {flagged.has(currentQuestion.id) ? t("exam.unflag") : t("exam.flag")}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4 md:p-6">
        <div
          className="mx-auto max-w-3xl"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: isBlurred || monitorWarning !== "" ? "none" : "auto",
          }}
        >
          {changingPage || !currentQuestion ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {t("exam.changingPage")}
            </div>
          ) : (
            <>
              {currentQuestion.group_passage && (
                <div className="mb-6 rounded-xl border border-border/80 bg-muted/20 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("exam.readingPassage", { defaultValue: "Đoạn đọc" })}
                  </p>
                  <MarkdownExamContent>{currentQuestion.group_passage.content}</MarkdownExamContent>
                  {currentQuestion.group_passage.image_url && (
                    <img
                      src={currentQuestion.group_passage.image_url}
                      alt=""
                      className="mt-4 max-w-full rounded-lg border"
                      draggable={false}
                    />
                  )}
                </div>
              )}

              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-primary">
                  {t("exam.question", { n: globalIdx + 1 })}
                </h2>
                <MarkdownExamContent>{currentQuestion.content}</MarkdownExamContent>
                {currentQuestion.image_url && (
                  <img
                    src={currentQuestion.image_url}
                    alt=""
                    className="mt-4 max-w-full rounded-lg border"
                    draggable={false}
                  />
                )}
              </div>

              {qType === "ESSAY" && (
                <textarea
                  className="min-h-[200px] w-full resize-y rounded-xl border bg-background p-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t("exam.essayPlaceholder")}
                  value={answers.get(currentQuestion.id)?.answer_content ?? ""}
                  onChange={(e) => onEssayChange(currentQuestion.id, e.target.value)}
                  style={{ userSelect: "text", WebkitUserSelect: "text" }}
                />
              )}

              {qType === "SHORT_ANSWER" && (
                <input
                  type="text"
                  className="w-full rounded-xl border bg-background px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t("exam.shortAnswerPlaceholder", { defaultValue: "Nhập câu trả lời ngắn…" })}
                  value={answers.get(currentQuestion.id)?.answer_content ?? ""}
                  onChange={(e) => onShortAnswerChange(currentQuestion.id, e.target.value)}
                  style={{ userSelect: "text", WebkitUserSelect: "text" }}
                />
              )}

              {qType === "TRUE_FALSE" && (
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      { v: true, label: t("review.trueLabel") },
                      { v: false, label: t("review.falseLabel") },
                    ] as const
                  ).map(({ v, label }) => {
                    const sel = answers.get(currentQuestion.id)?.answer_content === (v ? "true" : "false");
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => onTrueFalseSelect(currentQuestion.id, v)}
                        className={`rounded-xl border px-6 py-3 text-sm font-medium transition-all ${
                          sel
                            ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {qType === "MULTIPLE_FILL_IN_BLANK" && (
                <div className="space-y-3">
                  {fillSlots.map((slot, si) => (
                    <div key={slot.id ?? si} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("exam.blankN", { n: si + 1, defaultValue: `Ô ${si + 1}` })}
                      </span>
                      <input
                        type="text"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        value={fillSlotValues[si] ?? ""}
                        onChange={(e) => {
                          const next = [...fillSlotValues];
                          next[si] = e.target.value;
                          onFillBlankChange(currentQuestion.id, next);
                        }}
                        style={{ userSelect: "text", WebkitUserSelect: "text" }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {qType === "MULTIPLE_CHOICE" && (
                <div className="space-y-3">
                  {(currentQuestion.options ?? currentQuestion.answers ?? []).map((option: any, oi: number) => {
                    const isSelected = String(answers.get(currentQuestion.id)?.answer_id) === String(option.id);
                    const label = option.label ?? String.fromCharCode(65 + oi);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSelectOption(currentQuestion.id, option.id)}
                        className={`
                          flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all
                          ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                              : "border-border hover:border-primary/40 hover:bg-accent/40"
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
                        <div className="min-w-0 flex-1">
                          <span className="mb-1 block text-sm font-semibold">{label}.</span>
                          <MarkdownExamContent className="text-sm">
                            {String(option.content)}
                          </MarkdownExamContent>
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

      <div className="flex items-center justify-between gap-2 border-t bg-background/90 px-4 py-3">
        <Button
          variant="outline"
          onClick={() => onGoToQuestion(globalIdx - 1)}
          disabled={globalIdx === 0 || changingPage}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("exam.prev")}
        </Button>
        <Button
          variant="outline"
          onClick={() => onGoToQuestion(globalIdx + 1)}
          disabled={globalIdx === totalQuestions - 1 || changingPage}
        >
          {t("exam.next")}
          <ChevronRight className="ml-1 h-4 w-4" />
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
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-background/95">
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
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95">
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

interface KeyLogItem {
  id: string;
  key: string;
}

export function KeyboardLogBar() {
  const [keys, setKeys] = useState<KeyLogItem[]>([]);

  useEffect(() => {
    const handleKey = (e: any) => {
      const keyDetail = e.detail;
      const newKey: KeyLogItem = { id: Date.now().toString() + Math.random(), key: keyDetail };
      
      setKeys(prev => {
        const next = [...prev, newKey];
        if (next.length > 30) return next.slice(next.length - 30);
        return next;
      });

      setTimeout(() => {
        setKeys(prev => prev.filter(k => k.id !== newKey.id));
      }, 3000); // fade out after 3 seconds
    };

    window.addEventListener("exam-keypressed", handleKey);
    return () => window.removeEventListener("exam-keypressed", handleKey);
  }, []);

  if (keys.length === 0) return null;

  return (
    <div className="h-7 bg-zinc-900 border-t border-zinc-800 shrink-0 flex items-center px-4 justify-start z-30 transition-all w-full">
      <div className="flex gap-1.5 items-center flex-wrap overflow-hidden h-full w-full">
        <span className="text-[10px] text-zinc-500 mr-1 font-mono uppercase tracking-wider shrink-0">Lịch sử phím:</span>
        {keys.map(k => (
          <span 
            key={k.id} 
            className="animate-in fade-in zoom-in duration-200 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono min-w-[20px] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-32 shrink-0"
          >
            {k.key}
          </span>
        ))}
      </div>
    </div>
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
  const { t } = useTranslation();
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
        <span>{t("brand.name")}</span>
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
