import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
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
  image_url?: string;
  student_answer_id?: number | null;
  student_answer_content?: string | null;
  is_correct?: boolean;
  score?: number;
  max_score?: number;
  explanation?: string;
}

interface ReviewData {
  exam: {
    id: number;
    title: string;
  };
  attempt: {
    id: number;
    score: number;
    total_score?: number;
    submitted_at: string;
  };
  questions: ReviewQuestion[];
}

export default function ExamReviewPage() {
  const { examId, attemptId } = useParams<{
    examId: string;
    attemptId: string;
  }>();
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToastCustom();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(
          `/student/exams/${examId}/review/${attemptId}`
        );
        setData(res.data);
      } catch {
        toast.error("Không thể tải kết quả bài thi");
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

  const correctCount = data.questions.filter((q) => q.is_correct).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="-ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Quay lại
      </Button>

      {}
      <Card>
        <CardHeader>
          <CardTitle>{data.exam.title}</CardTitle>
          <CardDescription>
            Nộp bài:{" "}
            {new Date(data.attempt.submitted_at).toLocaleString("vi-VN")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Điểm</p>
              <p className="text-3xl font-bold">
                {data.attempt.score}
                {data.attempt.total_score !== undefined
                  ? ` / ${data.attempt.total_score}`
                  : ""}
              </p>
            </div>
            <Separator orientation="vertical" className="h-12" />
            <div>
              <p className="text-sm text-muted-foreground">Số câu đúng</p>
              <p className="text-3xl font-bold">
                {correctCount} / {data.questions.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {}
      <ScrollArea>
        <div className="space-y-4">
          {data.questions.map((question, idx) => (
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Câu {idx + 1}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {question.score !== undefined && (
                      <Badge variant="secondary">
                        {question.score}/{question.max_score ?? "?"} điểm
                      </Badge>
                    )}
                    {question.is_correct === true && (
                      <Badge
                        variant="default"
                        className="bg-green-600 gap-1"
                      >
                        <CheckCircle className="h-3 w-3" /> Đúng
                      </Badge>
                    )}
                    {question.is_correct === false && (
                      <Badge
                        variant="default"
                        className="bg-red-600 gap-1"
                      >
                        <XCircle className="h-3 w-3" /> Sai
                      </Badge>
                    )}
                    {question.is_correct === undefined && (
                      <Badge variant="outline" className="gap-1">
                        <Minus className="h-3 w-3" /> Chờ chấm
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="prose dark:prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {question.content}
                  </ReactMarkdown>
                </div>

                {question.image_url && (
                  <img
                    src={question.image_url}
                    alt="Question"
                    className="max-w-full rounded-lg border"
                  />
                )}

                {}
                {question.options && (
                  <div className="space-y-2">
                    {question.options.map((opt, oi) => {
                      const isStudentAnswer =
                        String(opt.id) === String(question.student_answer_id);
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
                            <div className="prose dark:prose-invert max-w-none text-sm inline-block">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                {String(opt.content)}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {isStudentAnswer && (
                            <Badge
                              variant="outline"
                              className="ml-auto shrink-0 text-xs"
                            >
                              Bạn chọn
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {}
                {question.type === "essay" &&
                  question.student_answer_content && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        Câu trả lời của bạn:
                      </p>
                      <div className="prose dark:prose-invert max-w-none text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {question.student_answer_content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                {}
                {question.explanation && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                      Giải thích:
                    </p>
                    <div className="prose dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                        {question.explanation}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
