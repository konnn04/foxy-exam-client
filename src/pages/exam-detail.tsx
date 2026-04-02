import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useToastCustom } from "@/hooks/use-toast-custom";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
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
import {
  Clock,
  CalendarDays,
  FileText,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle,
  Camera,
  ScanFace,
  AppWindow,
  Search,
  ShieldAlert,
  MonitorX,
  Timer,
} from "lucide-react";

interface ExamDetail {
  id: number;
  name?: string;
  title?: string;
  description?: string;
  start_time: string;
  end_time: string;
  duration?: number;
  duration_minutes?: number;
  max_attempts?: number;
  total_questions?: number;
  passing_score?: number;
  allow_review?: boolean;
  status?: string;
  late_entry_duration?: number;
  course?: { id: number; name: string };
  course_id?: number;
  attempt_count?: number;
  latest_attempt?: { id: number; status: string } | null;
  attempts?: Array<{
    id: number;
    status: string;
    score?: number;
    started_at: string;
    submitted_at?: string;
  }>;
  active_attempt?: { id: number } | null;
  exam_configuration?: {
    max_attempts?: number;
    allow_review?: boolean;
  };
  configuration?: {
    allowed_attempts?: number;
    allow_review?: boolean;
    is_allow_review?: boolean;
    is_hide_score?: boolean;
  };
}

interface ExamConfig {
  level: "none" | "standard" | "strict" | "custom";
  requireApp?: boolean;
  requireCamera?: boolean;
  requireMic?: boolean;
  requireFaceAuth?: boolean;
  detectBannedApps?: boolean;
  detectBannedObjects?: boolean;
  bannedApps?: string[];
}

export default function ExamDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();
  const toast = useToastCustom();
  const { confirm } = useAlertDialog();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/student/exams/${id}`);
        const root = res.data;
        const base = root.exam ?? root;
        setExam({
          ...base,
          total_questions: root.total_questions ?? base.total_questions,
          attempt_count: root.attempt_count ?? base.attempt_count,
          max_attempts:
            root.max_attempts ??
            base.max_attempts ??
            base.configuration?.allowed_attempts,
        });
        if (root.config) setExamConfig(root.config);
      } catch {
        toast.error(t("examDetail.loadError"));
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleStart = async () => {
    if (!exam) return;

    const examName = exam.name ?? exam.title ?? "";
    const examDuration = exam.duration ?? exam.duration_minutes ?? 0;
    const hasActive = exam.active_attempt ?? exam.latest_attempt;

    const ok = await confirm({
      title: hasActive ? t("examDetail.resumeConfirmTitle") : t("examDetail.startConfirmTitle"),
      description: hasActive
        ? t("examDetail.resumeConfirmDesc")
        : t("examDetail.startConfirmDesc", { name: examName, duration: examDuration }),
      confirmLabel: hasActive ? t("examDetail.resumeExam") : t("examDetail.startExam"),
    });

    if (!ok) return;

    setStarting(true);
    try {
      const res = await api.post(`/student/exams/${id}/start`);
      const attemptId = res.data.attempt?.id ?? res.data.attempt_id ?? res.data.id;
      navigate(`/exams/${id}/take/${attemptId}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(t("examDetail.startError"), err?.response?.data?.message);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!exam) return null;

  const examName = exam.name ?? exam.title ?? "";
  const examDuration = exam.duration ?? exam.duration_minutes ?? 0;
  const maxAttempts =
    exam.max_attempts ?? exam.configuration?.allowed_attempts ?? exam.exam_configuration?.max_attempts;
  const allowReview =
    exam.configuration?.is_allow_review === true ||
    exam.configuration?.allow_review === true ||
    exam.allow_review === true ||
    exam.exam_configuration?.allow_review === true;

  const now = new Date();
  const start = new Date(exam.start_time);
  const end = new Date(exam.end_time);
  const isActive = now >= start && now <= end;
  const isUpcoming = now < start;
  const isEnded = now > end;

  const completedAttempts = exam.attempts?.filter(
    (a) => a.status === "submitted" || a.status === "completed" || a.status === "SUBMITTED"
  );
  const attemptCount = exam.attempt_count ?? completedAttempts?.length ?? 0;
  const canAttempt = isActive && (!maxAttempts || attemptCount < maxAttempts);

  const monitorLevelLabel = (level?: string) => {
    switch (level) {
      case "strict": return t("examDetail.monitorStrict");
      case "standard": return t("examDetail.monitorStandard");
      case "custom": return t("examDetail.monitorCustom");
      default: return t("examDetail.monitorNone");
    }
  };

  const proctoringRules: { icon: typeof Camera; text: string; active: boolean }[] = [];
  if (examConfig) {
    proctoringRules.push(
      { icon: Camera, text: t("examDetail.ruleCamera"), active: !!examConfig.requireCamera },
      { icon: ScanFace, text: t("examDetail.ruleFaceAuth"), active: !!examConfig.requireFaceAuth },
      { icon: AppWindow, text: t("examDetail.ruleBannedApps"), active: !!examConfig.detectBannedApps || examConfig.level === "strict" },
      { icon: Search, text: t("examDetail.ruleBannedObjects"), active: !!examConfig.detectBannedObjects },
      { icon: MonitorX, text: t("examDetail.ruleNoSplit"), active: examConfig.level === "strict" },
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        ← {t("common.back")}
      </Button>

      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{examName}</CardTitle>
              {exam.course && <CardDescription>{exam.course.name}</CardDescription>}
            </div>
            <Badge variant={isActive ? "default" : isUpcoming ? "secondary" : "outline"}>
              {isActive
                ? t("examDetail.statusOpen")
                : isUpcoming
                  ? t("examDetail.statusUpcoming")
                  : t("examDetail.statusEnded")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.description && (
            <p className="text-sm text-muted-foreground">{exam.description}</p>
          )}

          <Separator />

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("examDetail.duration")}</p>
                <p className="text-sm text-muted-foreground">{examDuration} {t("common.minutes")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("examDetail.questionCount")}</p>
                <p className="text-sm text-muted-foreground">{exam.total_questions ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("examDetail.examPeriod")}</p>
                <p className="text-sm text-muted-foreground">
                  {start.toLocaleString("vi-VN")} — {end.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("examDetail.attemptCount")}</p>
                <p className="text-sm text-muted-foreground">{attemptCount} / {maxAttempts ?? "∞"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Proctoring rules — visual */}
          <div className="space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              {t("examDetail.rulesTitle")}
            </p>

            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("examDetail.monitorLevel")}:</span>
              <Badge variant="outline">{monitorLevelLabel(examConfig?.level)}</Badge>
            </div>

            {examConfig && (examConfig.requireApp || examConfig.level === "strict") && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300" dangerouslySetInnerHTML={{ __html: t("examDetail.ruleRequireApp") }} />
              </div>
            )}

            {proctoringRules.some((r) => r.active) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {proctoringRules.filter((r) => r.active).map((rule, i) => {
                  const Icon = rule.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                      <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: rule.text }} />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Timer className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("examDetail.ruleAutoSubmit")}</span>
            </div>
          </div>

          {/* Action */}
          <div className="flex justify-center pt-2">
            {isEnded ? (
              <p className="text-muted-foreground text-sm">{t("examDetail.ended")}</p>
            ) : isUpcoming ? (
              <p className="text-muted-foreground text-sm">{t("examDetail.notStarted")}</p>
            ) : canAttempt ? (
              <Button size="lg" onClick={handleStart} disabled={starting} className="min-w-48">
                {starting ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t("examDetail.processing")}
                  </span>
                ) : (exam.active_attempt ?? exam.latest_attempt) ? (
                  <span className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    {t("examDetail.resumeExam")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    {t("examDetail.startExam")}
                  </span>
                )}
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">{t("examDetail.maxAttemptsReached")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Previous attempts */}
      {completedAttempts && completedAttempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("examDetail.historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedAttempts.map((attempt, idx) => (
                <div key={attempt.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">{t("examDetail.attemptN", { n: idx + 1 })}</p>
                      <p className="text-xs text-muted-foreground">
                        {attempt.submitted_at
                          ? new Date(attempt.submitted_at).toLocaleString("vi-VN")
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {attempt.score !== undefined && (
                      <Badge variant="secondary">{attempt.score} {t("common.points")}</Badge>
                    )}
                    {allowReview && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/exams/${exam.id}/review/${attempt.id}`);
                        }}
                      >
                        {t("examDetail.review")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
