import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Clock,
  CalendarDays,
  ArrowRight,
  GraduationCap,
  FileText,
  AlertCircle,
  Play,
} from "lucide-react";

interface Course {
  id: number;
  name: string;
  code: string;
  description?: string;
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
}

export default function DashboardPage() {
  const { t } = useTranslation();
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const courses = data?.courses ?? [];
  const exams = data?.exams ?? [];

  const inProgressExam = exams.find((e) => {
    const attempt = e.active_attempt ?? e.latest_attempt;
    if (!attempt) return false;
    const status = (e.latest_attempt as { status?: string })?.status ?? "";
    return status === "in_progress" || e.active_attempt;
  });

  return (
    <div className="space-y-6">
      {/* In-progress alert */}
      {inProgressExam && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/50 p-2.5">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                {t("dashboard.inProgressAlert")}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t("dashboard.inProgressDesc", {
                  name: inProgressExam.name ?? inProgressExam.title ?? "",
                })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate(`/exams/${inProgressExam.id}`)}
              className="shrink-0"
            >
              <Play className="h-4 w-4 mr-1.5" />
              {t("dashboard.resumeExam")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.coursesCount")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{courses.length}</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.coursesEnrolled")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.upcomingExams")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exams.length}</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.examsPending")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.status")}</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{t("dashboard.statusActive")}</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.statusDesc")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming exams */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {t("dashboard.upcomingTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.upcomingDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!exams.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mb-2 opacity-50" />
              <p>{t("dashboard.noUpcoming")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/exams/${exam.id}`)}
                >
                  <div className="space-y-1">
                    <p className="font-medium">{exam.name ?? exam.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {exam.course_name ?? exam.course?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {exam.duration ?? exam.duration_minutes} {t("common.minutes")}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      {new Date(exam.start_time).toLocaleDateString("vi-VN")}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Courses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {t("dashboard.myCourses")}
            </CardTitle>
            <CardDescription>{t("dashboard.myCoursesDesc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/courses")}>
            {t("common.viewAll")}
          </Button>
        </CardHeader>
        <CardContent>
          {!courses.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mb-2 opacity-50" />
              <p>{t("dashboard.noCourses")}</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {courses.slice(0, 6).map((course) => (
                <div
                  key={course.id}
                  className="rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/courses/${course.id}`)}
                >
                  <p className="font-medium">{course.name}</p>
                  <p className="text-sm text-muted-foreground">{course.code}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
