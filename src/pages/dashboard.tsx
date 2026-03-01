import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  course?: { name: string };
  start_time: string;
  end_time: string;
  duration?: number;
  duration_minutes?: number;
  status?: string;
}

interface DashboardData {
  courses: Course[];
  upcoming_exams: Exam[];
  courses_count?: number;
  exams_count?: number;
}

export default function DashboardPage() {
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
        toast.error("Không thể tải dữ liệu dashboard");
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

  return (
    <div className="space-y-6">
      {}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Khóa học</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.courses_count ?? data?.courses?.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Khóa học đã đăng ký
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bài thi sắp tới</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.exams_count ?? data?.upcoming_exams?.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Bài thi chờ làm
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Trạng thái</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Hoạt động</div>
            <p className="text-xs text-muted-foreground">
              Tài khoản được kích hoạt
            </p>
          </CardContent>
        </Card>
      </div>

      {}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Bài thi sắp tới
          </CardTitle>
          <CardDescription>Danh sách các bài thi sắp diễn ra</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.upcoming_exams?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mb-2 opacity-50" />
              <p>Không có bài thi nào sắp tới</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.upcoming_exams.map((exam) => (
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
                      {exam.duration ?? exam.duration_minutes} phút
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

      {}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Khóa học của tôi
            </CardTitle>
            <CardDescription>Các khóa học bạn đã đăng ký</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/courses")}>
            Xem tất cả
          </Button>
        </CardHeader>
        <CardContent>
          {!data?.courses?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mb-2 opacity-50" />
              <p>Chưa đăng ký khóa học nào</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.courses.slice(0, 6).map((course) => (
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
