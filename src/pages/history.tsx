import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  exam?: {
    id: number;
    title?: string;
    name?: string;
    allow_review?: boolean;
    configuration?: { is_allow_review?: boolean };
  };
  status: string;
  score?: number | null;
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
  const { t } = useTranslation();
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
        const res = await api.get(API_ENDPOINTS.HISTORY, {
          params: { page, per_page: 50 },
        });
        const d = res.data;
        const rows = Array.isArray(d.data) ? d.data : Array.isArray(d.attempts) ? d.attempts : [];
        setAttempts(rows);
        // Laravel paginator: flat keys; some APIs use meta.{}
        setMeta(
          d.meta ?? {
            current_page: d.current_page ?? page,
            last_page: d.last_page ?? 1,
            total: d.total ?? rows.length,
          },
        );
      } catch {
        toast.error(t("history.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "submitted":
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" /> {t("history.statusSubmitted")}
          </Badge>
        );
      case "in_progress":
      case "in progress":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> {t("history.statusInProgress")}
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
        <h1 className="text-2xl font-bold tracking-tight">{t("history.title")}</h1>
        <p className="text-muted-foreground">{t("history.subtitle")}</p>
      </div>

      {!attempts.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-12 w-12 mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t("history.noHistory")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("history.results")}</CardTitle>
            <CardDescription>
              {t("history.totalAttempts", { count: meta?.total ?? attempts.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("history.colExam")}</TableHead>
                  <TableHead>{t("history.colStatus")}</TableHead>
                  <TableHead>{t("history.colScore")}</TableHead>
                  <TableHead>{t("history.colDate")}</TableHead>
                  <TableHead className="text-right">{t("history.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => {
                  const examId = attempt.exam_id ?? attempt.exam?.id;
                  const examTitle =
                    attempt.exam_title ??
                    attempt.exam?.name ??
                    attempt.exam?.title ??
                    `Exam #${examId}`;
                  const cfg = attempt.exam?.configuration;
                  const allowReview =
                    cfg?.is_allow_review === true ||
                    attempt.exam?.allow_review === true;
                  const st = (attempt.status || "").toLowerCase();
                  const isSubmitted =
                    Boolean(attempt.submitted_at) ||
                    st === "submitted" ||
                    st === "completed";

                  return (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">{examTitle}</TableCell>
                      <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                      <TableCell>
                        {attempt.score !== undefined && attempt.score !== null
                          ? `${attempt.score}${attempt.total_score ? ` / ${attempt.total_score}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {attempt.submitted_at
                          ? new Date(attempt.submitted_at).toLocaleString("vi-VN")
                          : new Date(attempt.started_at).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {isSubmitted && allowReview && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/exams/${examId}/review/${attempt.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            {t("history.review")}
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

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("common.page", { current: page, total: meta.last_page })}
          </span>
          <Button variant="outline" size="sm" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
            {t("common.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
