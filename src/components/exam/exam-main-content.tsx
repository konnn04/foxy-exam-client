import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
} from "lucide-react";
import type { Answer } from "@/types/exam";
import { useTranslation } from "react-i18next";
import { MarkdownExamContent } from "@/components/exam/markdown-exam-content";

export interface ExamMainContentProps {
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
