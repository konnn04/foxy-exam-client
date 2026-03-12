import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  };
}

interface ExamConfig {
  level: "none" | "standard" | "strict";
  requireApp?: boolean;
  requireCamera?: boolean;
  requireMic?: boolean;
  requireFaceAuth?: boolean;
  detectBannedApps?: boolean;
  bannedApps?: string[];
}

export default function ExamDetailPage() {
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
        setExam(res.data.exam ?? res.data);
        if (res.data.config) {
          setExamConfig(res.data.config);
        }
      } catch {
        toast.error("Không thể tải thông tin bài thi");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleStart = async () => {
    if (!exam) return;

    const examName = exam.name ?? exam.title ?? 'Bài thi';
    const examDuration = exam.duration ?? exam.duration_minutes ?? 0;
    const hasActive = exam.active_attempt ?? exam.latest_attempt;

    const ok = await confirm({
      title: hasActive ? "Tiếp tục làm bài" : "Bắt đầu bài thi",
      description: hasActive
        ? "Bạn sẽ tiếp tục phiên thi trước đó."
        : `Bạn sẽ bắt đầu bài thi "${examName}". Thời gian: ${examDuration} phút. Bạn có chắc chắn?`,
      confirmLabel: hasActive ? "Tiếp tục" : "Bắt đầu",
    });

    if (!ok) return;

    setStarting(true);
    try {
      const res = await api.post(`/student/exams/${id}/start`);
      const attemptId = res.data.attempt?.id ?? res.data.attempt_id ?? res.data.id;
      navigate(`/exams/${id}/take/${attemptId}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        "Không thể bắt đầu bài thi",
        err?.response?.data?.message
      );
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

  const examName = exam.name ?? exam.title ?? 'Bài thi';
  const examDuration = exam.duration ?? exam.duration_minutes ?? 0;
  const maxAttempts = exam.max_attempts ?? exam.configuration?.allowed_attempts ?? exam.exam_configuration?.max_attempts;
  const allowReview = exam.allow_review ?? exam.configuration?.allow_review ?? exam.exam_configuration?.allow_review;

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
  const canAttempt =
    isActive &&
    (!maxAttempts || attemptCount < maxAttempts);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="-ml-2"
      >
        ← Quay lại
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{examName}</CardTitle>
              {exam.course && (
                <CardDescription>{exam.course.name}</CardDescription>
              )}
            </div>
            <Badge
              variant={isActive ? "default" : isUpcoming ? "secondary" : "outline"}
            >
              {isActive
                ? "Đang mở"
                : isUpcoming
                  ? "Sắp tới"
                  : "Đã kết thúc"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.description && (
            <p className="text-sm text-muted-foreground">{exam.description}</p>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Thời gian</p>
                <p className="text-sm text-muted-foreground">
                  {examDuration} phút
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Số câu hỏi</p>
                <p className="text-sm text-muted-foreground">
                  {exam.total_questions ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Thời gian thi</p>
                <p className="text-sm text-muted-foreground">
                  {start.toLocaleString("vi-VN")} — {end.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Số lần thi</p>
                <p className="text-sm text-muted-foreground">
                  {attemptCount} / {maxAttempts ?? "∞"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Rules */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Lưu ý & Quy định thi
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
              <li>Mức độ giám sát: <strong>
                  {examConfig?.level === 'strict' ? 'Nghiêm ngặt' : examConfig?.level === 'standard' ? 'Tiêu chuẩn' : 'Không có'}
              </strong></li>
              {examConfig?.requireApp || examConfig?.level === 'strict' ? (
                <li>Yêu cầu sử dụng <strong>Ứng dụng Exam Client trên Máy tính</strong>.</li>
              ) : (
                <li>Có thể thi trên trình duyệt hoặc ứng dụng.</li>
              )}
              {examConfig?.requireCamera !== false && (
                <li>Webcam sẽ được bật trong suốt quá trình thi để giám sát tự động.</li>
              )}
              {examConfig?.requireFaceAuth && (
                <li>Bắt buộc <strong>xác thực khuôn mặt (FaceID)</strong> liên tục.</li>
              )}
              {(examConfig?.detectBannedApps || examConfig?.level === 'strict') && (
                <li>Hệ thống <strong>sẽ tự động giám sát các tiến trình/phần mềm cấm</strong> chạy ngầm trên máy bạn.</li>
              )}
              {examConfig?.level === 'strict' && (
                <li>Không được phép chia nhỏ màn hình (chế độ độc quyền). Cấm phím tắt.</li>
              )}
              <li>Bài thi sẽ tự nộp khi quá trình kết thúc hoặc hết thời gian.</li>
            </ul>
          </div>

          {/* Action */}
          <div className="flex justify-center pt-2">
            {isEnded ? (
              <p className="text-muted-foreground text-sm">
                Bài thi đã kết thúc
              </p>
            ) : isUpcoming ? (
              <p className="text-muted-foreground text-sm">
                Bài thi chưa bắt đầu
              </p>
            ) : canAttempt ? (
              <Button
                size="lg"
                onClick={handleStart}
                disabled={starting}
                className="min-w-48"
              >
                {starting ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Đang xử lý...
                  </span>
                ) : (exam.active_attempt ?? exam.latest_attempt) ? (
                  <span className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Tiếp tục làm bài
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Bắt đầu làm bài
                  </span>
                )}
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">
                Đã sử dụng hết lượt thi
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Previous attempts */}
      {completedAttempts && completedAttempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lịch sử làm bài</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedAttempts.map((attempt, idx) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">Lần {idx + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {attempt.submitted_at
                          ? new Date(attempt.submitted_at).toLocaleString("vi-VN")
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {attempt.score !== undefined && (
                      <Badge variant="secondary">{attempt.score} điểm</Badge>
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
                        Xem lại
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
