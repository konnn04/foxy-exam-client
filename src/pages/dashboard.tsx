import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useUser } from "@/hooks/use-user";
import { useToastCustom } from "@/hooks/use-toast-custom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Clock,
  CalendarDays,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Play,
  Users,
  Timer,
  ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Course {
  id: number;
  name: string;
  code: string;
  description?: string;
  subject?: { id: number; name: string } | null;
  presiding_teacher?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  exams_count?: number;
}

interface Exam {
  id: number;
  name?: string;
  title?: string;
  course_name?: string;
  course?: { id?: number; name: string };
  start_time: string;
  end_time: string;
  duration?: number;
  duration_minutes?: number;
  status?: string;
  active_attempt?: { id: number } | null;
  latest_attempt?: { id: number; status: string } | null;
}

interface DashboardData {
  courses: Course[];
  exams: Exam[];
  totalCourses: number;
  totalExams: number;
  pendingExams: number;
  avgViolations: number;
  isLocked: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Đang diễn ra";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days} ngày ${hours} giờ nữa`;
  if (hours > 0) return `${hours} giờ nữa`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${mins} phút nữa`;
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass = "text-primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub: string;
  colorClass?: string;
}) {
  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-5 flex items-start gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${colorClass}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          <p className="text-sm font-medium text-foreground/80">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToastCustom();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/student/dashboard");
        setData(res.data);
      } catch {
        toast.error(t("dashboard.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── In-progress exam detection ──────────────────────────────────────
  const inProgressExam = useMemo(() => {
    if (!data?.exams) return null;
    return data.exams.find((e) => {
      const attempt = e.active_attempt ?? e.latest_attempt;
      if (!attempt) return false;
      const status = (e.latest_attempt as { status?: string })?.status ?? "";
      return status === "in_progress" || e.active_attempt;
    });
  }, [data?.exams]);

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  const courses = data?.courses ?? [];
  const exams = data?.exams ?? [];
  const stats = {
    totalCourses: data?.totalCourses ?? courses.length,
    totalExams: data?.totalExams ?? 0,
    pendingExams: data?.pendingExams ?? exams.length,
    avgViolations: data?.avgViolations ?? 0,
    isLocked: data?.isLocked ?? false,
  };

  const displayName = user
    ? `${user.last_name} ${user.first_name}`
    : "...";

  return (
    <div className="space-y-6">
      {/* ── Account Lock Warning ──────────────────────────────────── */}
      {stats.isLocked && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-destructive/50 bg-destructive/10 px-5 py-4 text-destructive">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Tài khoản của bạn đang bị khóa</p>
            <p className="text-sm opacity-80">
              Vui lòng liên hệ giảng viên hoặc quản trị viên để được mở khóa.
            </p>
          </div>
        </div>
      )}

      {/* ── In-progress Exam Alert ─────────────────────────────────── */}
      {inProgressExam && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/20 shadow-lg overflow-hidden">
          <div className="bg-red-500 text-white px-4 py-2 text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            PHIÊN THI ĐANG DIỄN RA
          </div>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-red-900 dark:text-red-100">
                {inProgressExam.name ?? inProgressExam.title}
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                Kết nối bị gián đoạn. Bài thi vẫn đang tính giờ!
              </p>
            </div>
            <Button
              size="lg"
              variant="destructive"
              onClick={() => navigate(`/exams/${inProgressExam.id}`)}
              className="shrink-0 font-bold shadow-lg"
            >
              <Play className="h-4 w-4 mr-2 fill-current" />
              Kết nối lại ngay
            </Button>
          </div>
        </div>
      )}

      {/* ── Greeting ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Xin chào,{" "}
          <span className="text-primary">{displayName}</span>!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {exams.length > 0
            ? `Bạn có ${stats.pendingExams} bài thi đang chờ. Hãy chuẩn bị thật tốt nhé!`
            : "Chúc bạn một ngày học tập hiệu quả!"}
        </p>
      </div>

      {/* ── Stats Grid ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={BookOpen}
          label="Khóa học"
          value={stats.totalCourses}
          sub="Khóa học đã đăng ký"
          colorClass="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={FileText}
          label="Tổng bài thi"
          value={stats.totalExams}
          sub={`${stats.pendingExams} bài đang chờ thi`}
          colorClass="text-violet-600 dark:text-violet-400"
        />
        <StatCard
          icon={Timer}
          label="Đang chờ"
          value={stats.pendingExams}
          sub="Bài thi sắp diễn ra"
          colorClass="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={ShieldAlert}
          label="Vi phạm TB"
          value={stats.avgViolations.toFixed(1)}
          sub="Trung bình mỗi lần thi"
          colorClass={
            stats.avgViolations > 0
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }
        />
      </div>

      {/* ── Upcoming Exams ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Bài thi sắp tới
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/history")}>
            Xem tất cả
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Không có bài thi nào sắp tới</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exams.map((exam) => {
                const dt = formatDateTime(exam.start_time);
                const remaining = timeUntil(exam.start_time);
                const isSoon = remaining === "Đang diễn ra";
                const duration = exam.duration ?? exam.duration_minutes ?? 0;
                return (
                  <div
                    key={exam.id}
                    className="group flex items-center gap-4 rounded-lg border p-4 transition-all hover:border-primary/30 hover:bg-accent/40 cursor-pointer"
                    onClick={() => navigate(`/exams/${exam.id}`)}
                  >
                    {/* Time column */}
                    <div className="shrink-0 text-center w-16">
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        {dt.date.slice(0, 5)}
                      </p>
                      <p className="text-lg font-bold tabular-nums">{dt.time}</p>
                    </div>

                    {/* Divider */}
                    <div className="hidden sm:block w-px h-10 bg-border shrink-0" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate group-hover:text-primary transition-colors">
                        {exam.name ?? exam.title ?? `Bài thi #${exam.id}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {exam.course_name ?? exam.course?.name ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {duration} phút
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0 flex items-center gap-2">
                      <Badge
                        variant={isSoon ? "default" : "secondary"}
                        className="text-xs font-medium"
                      >
                        {remaining}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── My Courses ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            Khóa học của tôi
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/courses")}>
            Xem tất cả
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <BookOpen className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Chưa đăng ký khóa học nào</p>
              <p className="text-xs mt-1 opacity-60">
                Liên hệ giảng viên để được thêm vào khóa học
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="group flex flex-col rounded-lg border p-4 hover:border-primary/30 hover:bg-accent/40 transition-all cursor-pointer"
                  onClick={() => navigate(`/courses/${course.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate group-hover:text-primary transition-colors">
                      {course.name}
                    </p>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                  </div>

                  <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {course.subject && (
                      <p className="flex items-center gap-1.5">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        {course.subject.name}
                      </p>
                    )}
                    {course.presiding_teacher && (
                      <p className="flex items-center gap-1.5">
                        <Users className="h-3 w-3 shrink-0" />
                        {course.presiding_teacher.last_name}{" "}
                        {course.presiding_teacher.first_name}
                      </p>
                    )}
                    {(course.exams_count ?? 0) > 0 && (
                      <p className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 shrink-0" />
                        {course.exams_count} bài thi
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {course.code}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
