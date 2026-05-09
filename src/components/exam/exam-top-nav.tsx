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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flag,
  LayoutGrid,
  Send,
} from "lucide-react";
import type { Answer } from "@/types/exam";
import { useExamStore } from "@/stores/use-exam-store";
import { useTranslation } from "react-i18next";
import { isLeafAnswered } from "@/lib/exam-answer-utils";
import { setExamLocale } from "@/i18n";

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
