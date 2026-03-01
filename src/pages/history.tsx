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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, Eye, CheckCircle, XCircle, Clock } from "lucide-react";

interface Attempt {
  id: number;
  exam_id: number;
  exam_title?: string;
  exam?: { id: number; title: string; allow_review?: boolean };
  status: string;
  score?: number;
  total_score?: number;
  started_at: string;
  submitted_at?: string;
}

interface PaginationMeta {
  current_page: number;
  last_page: number;
  total: number;
}

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToastCustom();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/student/history", { params: { page } });
        setAttempts(res.data.data ?? res.data.attempts ?? res.data);
        setMeta(res.data.meta ?? null);
      } catch {
        toast.error("Không thể tải lịch sử thi");
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Đã nộp
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Đang làm
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <XCircle className="h-3 w-3" /> {status}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lịch sử thi</h1>
        <p className="text-muted-foreground">
          Tất cả các lần thi của bạn
        </p>
      </div>

      {!attempts.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-12 w-12 mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              Chưa có lịch sử thi nào
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kết quả thi</CardTitle>
            <CardDescription>
              Tổng cộng {meta?.total ?? attempts.length} lượt thi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bài thi</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Điểm</TableHead>
                  <TableHead>Ngày thi</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => {
                  const examId = attempt.exam_id ?? attempt.exam?.id;
                  const examTitle =
                    attempt.exam_title ?? attempt.exam?.title ?? `Exam #${examId}`;
                  const allowReview = attempt.exam?.allow_review !== false;

                  return (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">{examTitle}</TableCell>
                      <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                      <TableCell>
                        {attempt.score !== undefined
                          ? `${attempt.score}${attempt.total_score ? ` / ${attempt.total_score}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {attempt.submitted_at
                          ? new Date(attempt.submitted_at).toLocaleString("vi-VN")
                          : new Date(attempt.started_at).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {(attempt.status === "submitted" ||
                          attempt.status === "completed") &&
                          allowReview && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(
                                  `/exams/${examId}/review/${attempt.id}`
                                )
                              }
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Xem lại
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {page} / {meta.last_page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
