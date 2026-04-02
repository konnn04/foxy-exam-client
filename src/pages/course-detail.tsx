import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
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
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Clock,
  CalendarDays,
  ArrowRight,
  FileText,
  User,
} from "lucide-react";

interface Exam {
  id: number;
  name: string;
  title?: string;
  description?: string;
  start_time: string;
  end_time: string;
  duration: number;
  duration_minutes?: number;
  status?: string;
  max_attempts?: number;
  attempt_count?: number;
  latest_attempt?: unknown;
}

interface Course {
  id: number;
  name: string;
  code: string;
  class_name?: string;
  description?: string | null;
  subject?: { id: number; name: string };
  presiding_teacher?: { id: number; first_name: string; last_name: string };
}

export default function CourseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToastCustom();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/student/courses/${id}`);
        setCourse(res.data.course ?? res.data);
        setExams(res.data.exams ?? res.data.course?.exams ?? []);
      } catch {
        toast.error(t("courseDetail.loadError"));
        navigate("/courses");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!course) return null;

  const now = new Date();

  const getExamStatus = (exam: Exam) => {
    if (exam.status) {
      switch (exam.status.toUpperCase()) {
        case "ACTIVE":
          return { label: t("examDetail.statusOpen"), variant: "default" as const };
        case "UPCOMING":
          return { label: t("examDetail.statusUpcoming"), variant: "secondary" as const };
        case "ENDED":
        case "COMPLETED":
          return { label: t("examDetail.statusEnded"), variant: "outline" as const };
      }
    }
    const start = new Date(exam.start_time);
    const end = new Date(exam.end_time);
    if (now < start) return { label: t("examDetail.statusUpcoming"), variant: "secondary" as const };
    if (now >= start && now <= end) return { label: t("examDetail.statusOpen"), variant: "default" as const };
    return { label: t("examDetail.statusEnded"), variant: "outline" as const };
  };

  const teacherName = course.presiding_teacher
    ? `${course.presiding_teacher.first_name} ${course.presiding_teacher.last_name}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/courses")} className="mb-2 -ml-2">
          ← {t("common.back")}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
        <div className="flex items-center gap-3 text-muted-foreground mt-1">
          <span>{course.code}</span>
          {course.class_name && (
            <>
              <span>•</span>
              <span>{t("courseDetail.class")}: {course.class_name}</span>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {t("courseDetail.info")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {course.subject && (
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("courseDetail.subject")}:</span>
              <span className="font-medium">{course.subject.name}</span>
            </div>
          )}
          {teacherName && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("courseDetail.teacher")}:</span>
              <span className="font-medium">{teacherName}</span>
            </div>
          )}
          {course.description && (
            <p className="text-sm text-muted-foreground mt-2">{course.description}</p>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("courseDetail.examList", { count: exams.length })}
        </h2>

        {!exams.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{t("courseDetail.noExams")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => {
              const status = getExamStatus(exam);
              const duration = exam.duration ?? exam.duration_minutes ?? 0;
              const examName = exam.name ?? exam.title ?? `#${exam.id}`;

              return (
                <Card
                  key={exam.id}
                  className="hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/exams/${exam.id}`)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <p className="font-medium group-hover:text-primary transition-colors">{examName}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {duration} {t("common.minutes")}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {new Date(exam.start_time).toLocaleDateString("vi-VN")}
                        </span>
                        {exam.attempt_count !== undefined && (
                          <span className="text-xs">
                            {t("courseDetail.attempted", { count: exam.attempt_count })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
