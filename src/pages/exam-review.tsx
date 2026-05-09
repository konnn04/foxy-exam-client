import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import { useToastCustom } from "@/hooks/use-toast-custom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownExamContent } from "@/components/exam/markdown-exam-content";
import {
  CheckCircle,
  XCircle,
  Minus,
  ArrowLeft,
} from "lucide-react";

interface Option {
  id: number;
  content: string;
  is_correct?: boolean;
}

interface ReviewQuestion {
  id: number;
  content: string;
  type: string;
  options?: Option[];
  answers?: Option[];
  image_url?: string;
  student_answer_id?: number | null;
  student_answer_content?: string | null;
  is_correct?: boolean | null;
  score?: number;
  max_score?: number;
  explanation?: string;
  /** Correct key for TRUE_FALSE (from backend) */
  correct_true_false?: boolean | null;
  children?: ReviewQuestion[];
}

interface ReviewData {
  exam: { id: number; name?: string; title?: string };
  attempt: { id: number; score: number; total_score?: number; submitted_at: string };
  questions: ReviewQuestion[];
}

/** Types scored automatically on submit (shown in “correct count” summary). */
const AUTO_GRADED_TYPES = new Set([
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "MULTIPLE_FILL_IN_BLANK",
]);

function collectAnswerableLeaves(questions: ReviewQuestion[]): ReviewQuestion[] {
  const out: ReviewQuestion[] = [];
  for (const q of questions) {
    if (q.type === "GROUP_QUESTION" && q.children?.length) {
      out.push(...q.children);
    } else {
      out.push(q);
    }
  }
  return out;
}

function isTextAnswerType(type: string): boolean {
  const t = String(type).toUpperCase();
  return t === "ESSAY" || t === "SHORT_ANSWER" || t === "MULTIPLE_FILL_IN_BLANK";
}

function formatTextAnswerForDisplay(type: string, raw: string | null | undefined): string {
  if (raw == null || raw === "") {
    return "";
  }
  if (type === "MULTIPLE_FILL_IN_BLANK") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v, i) => `Ô ${i + 1}: ${String(v ?? "")}`).join("\n");
      }
    } catch {
      /* use raw */
    }
  }
  return raw;
}

function QuestionCardContent({
  question,
  t,
}: {
  question: ReviewQuestion;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const opts = question.options ?? question.answers ?? [];
  const displayAnswer = formatTextAnswerForDisplay(question.type, question.student_answer_content);

  return (
    <CardContent className="space-y-3">
      <MarkdownExamContent className="text-sm">{question.content}</MarkdownExamContent>

      {question.image_url && (
        <img src={question.image_url} alt="Question" className="max-w-full rounded-lg border" />
      )}

      {question.type === "TRUE_FALSE" && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">{t("review.yourAnswer")}: </span>
            {question.student_answer_content === "true"
              ? t("review.trueLabel")
              : question.student_answer_content === "false"
                ? t("review.falseLabel")
                : "—"}
          </p>
          {question.correct_true_false != null && (
            <p>
              <span className="text-muted-foreground">{t("review.correctAnswer")}: </span>
              {question.correct_true_false ? t("review.trueLabel") : t("review.falseLabel")}
            </p>
          )}
        </div>
      )}

      {question.type !== "TRUE_FALSE" && opts.length > 0 && (
        <div className="space-y-2">
          {opts.map((opt, oi) => {
            const isStudentAnswer = String(opt.id) === String(question.student_answer_id);
            const isCorrect = opt.is_correct;

            return (
              <div
                key={opt.id}
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  isCorrect
                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                    : isStudentAnswer && !isCorrect
                      ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                      : "border-border"
                }`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium ${
                    isStudentAnswer
                      ? isCorrect
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-red-600 bg-red-600 text-white"
                      : isCorrect
                        ? "border-green-600 text-green-600"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {String.fromCharCode(65 + oi)}
                </div>
                <div className="pt-0.5 w-full">
                  <MarkdownExamContent className="text-sm">
                    {String(opt.content)}
                  </MarkdownExamContent>
                </div>
                {isStudentAnswer && (
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    {t("review.yourChoice")}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isTextAnswerType(question.type) && (
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1">{t("review.yourAnswer")}:</p>
          {displayAnswer ? (
            <MarkdownExamContent className="text-sm">{displayAnswer}</MarkdownExamContent>
          ) : (
            <p className="text-sm italic text-muted-foreground">—</p>
          )}
        </div>
      )}

      {question.explanation && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-3">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
            {t("review.explanation")}:
          </p>
          <MarkdownExamContent className="text-sm">{question.explanation}</MarkdownExamContent>
        </div>
      )}
    </CardContent>
  );
}

export default function ExamReviewPage() {
  const { t } = useTranslation();
  const { examId, attemptId } = useParams<{ examId: string; attemptId: string }>();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToastCustom();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(API_ENDPOINTS.EXAM_REVIEW(examId!, attemptId!));
        setData(res.data);
      } catch {
        toast.error(t("review.loadError"));
        navigate(-1);
      } finally {
        setLoading(false);
      }
    })();
  }, [examId, attemptId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const leaves = collectAnswerableLeaves(data.questions);
  const autoGradedQuestions = leaves.filter((q) => AUTO_GRADED_TYPES.has(q.type));
  const correctCount = autoGradedQuestions.filter((q) => q.is_correct === true).length;
  const examTitle = data.exam.title ?? data.exam.name ?? "";

  let qIndex = 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t("review.backButton")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{examTitle}</CardTitle>
          <CardDescription>
            {t("review.submittedAt")}: {new Date(data.attempt.submitted_at).toLocaleString("vi-VN")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">{t("review.score")}</p>
              <p className="text-3xl font-bold">
                {data.attempt.score}
                {data.attempt.total_score !== undefined ? ` / ${data.attempt.total_score}` : ""}
              </p>
            </div>
            <Separator orientation="vertical" className="h-12 hidden sm:block" />
            <div>
              <p className="text-sm text-muted-foreground">{t("review.correctCount")}</p>
              <p className="text-3xl font-bold">
                {autoGradedQuestions.length > 0
                  ? `${correctCount} / ${autoGradedQuestions.length}`
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ScrollArea>
        <div className="space-y-4">
          {data.questions.map((question) => {
            if (question.type === "GROUP_QUESTION" && question.children?.length) {
              return (
                <Card
                  key={question.id}
                  className="border-violet-500/30 bg-violet-500/5"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("review.groupPassage")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MarkdownExamContent className="text-sm">{question.content}</MarkdownExamContent>
                    {question.image_url && (
                      <img
                        src={question.image_url}
                        alt=""
                        className="max-w-full rounded-lg border"
                      />
                    )}
                    {question.children.map((child) => {
                      qIndex += 1;
                      return (
                        <Card
                          key={child.id}
                          className={
                            child.is_correct === true
                              ? "border-green-500/50"
                              : child.is_correct === false
                                ? "border-red-500/50"
                                : ""
                          }
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <CardTitle className="text-base">
                                {t("review.questionN", { n: qIndex })}
                              </CardTitle>
                              <div className="flex items-center gap-2 flex-wrap">
                                {child.score !== undefined && (
                                  <Badge variant="secondary">
                                    {child.score}/{child.max_score ?? "?"} {t("common.points")}
                                  </Badge>
                                )}
                                {child.is_correct === true && (
                                  <Badge variant="default" className="bg-green-600 gap-1">
                                    <CheckCircle className="h-3 w-3" /> {t("review.correct")}
                                  </Badge>
                                )}
                                {child.is_correct === false && (
                                  <Badge variant="default" className="bg-red-600 gap-1">
                                    <XCircle className="h-3 w-3" /> {t("review.incorrect")}
                                  </Badge>
                                )}
                                {(child.is_correct === undefined || child.is_correct === null) && (
                                  <Badge variant="outline" className="gap-1">
                                    <Minus className="h-3 w-3" /> {t("review.pending")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <QuestionCardContent question={child} t={t} />
                        </Card>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            }

            qIndex += 1;
            return (
              <Card
                key={question.id}
                className={
                  question.is_correct === true
                    ? "border-green-500/50"
                    : question.is_correct === false
                      ? "border-red-500/50"
                      : ""
                }
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">{t("review.questionN", { n: qIndex })}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      {question.score !== undefined && (
                        <Badge variant="secondary">
                          {question.score}/{question.max_score ?? "?"} {t("common.points")}
                        </Badge>
                      )}
                      {question.is_correct === true && (
                        <Badge variant="default" className="bg-green-600 gap-1">
                          <CheckCircle className="h-3 w-3" /> {t("review.correct")}
                        </Badge>
                      )}
                      {question.is_correct === false && (
                        <Badge variant="default" className="bg-red-600 gap-1">
                          <XCircle className="h-3 w-3" /> {t("review.incorrect")}
                        </Badge>
                      )}
                      {(question.is_correct === undefined || question.is_correct === null) && (
                        <Badge variant="outline" className="gap-1">
                          <Minus className="h-3 w-3" /> {t("review.pending")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <QuestionCardContent question={question} t={t} />
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
