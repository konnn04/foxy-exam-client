import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle, UserCheck, Loader2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";

interface FaceRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId?: number | string;
  attemptId?: number | string;
}

const FALLBACK_URL = "https://exam-local.konnn04.dev/student/face-registration";

export function FaceRegistrationModal({ open, onOpenChange, examId, attemptId }: FaceRegistrationModalProps) {
  const [qrUrl, setQrUrl] = useState<string>(FALLBACK_URL);
  const [loading, setLoading] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setApiError(false);
    setIsAutoLogin(false);

    const endpoint = examId && attemptId
      ? `/student/exams/${examId}/take/${attemptId}/face-register-qr`
      : `/student/face-register-qr`;

    api.post(endpoint)
      .then((res) => {
        console.log('[FaceRegistration] Auto-login QR URL:', res.data.url);
        setQrUrl(res.data.url);
        setIsAutoLogin(true);
      })
      .catch((err) => {
        console.warn('[FaceRegistration] QR token API failed, using fallback URL:', err);
        setApiError(true);
        setQrUrl(FALLBACK_URL);
      })
      .finally(() => setLoading(false));
  }, [open, examId, attemptId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            Cập nhật Sinh trắc học
          </DialogTitle>
          <DialogDescription>
            Dùng điện thoại quét mã QR bên dưới để đăng ký khuôn mặt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-xl mt-2 border">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Đang tạo mã đăng nhập nhanh...</p>
            </div>
          ) : (
            <>
              <div className="bg-white p-3 rounded-lg shadow-sm border mb-3">
                <QRCodeSVG value={qrUrl} size={180} level="M" />
              </div>

              {isAutoLogin ? (
                <div className="w-full bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    🔐 Quét QR này sẽ tự động đăng nhập — không cần nhập mật khẩu
                  </p>
                </div>
              ) : apiError ? (
                <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 text-center">
                    ⚠️ Không tạo được mã đăng nhập nhanh. QR yêu cầu đăng nhập thủ công.
                  </p>
                </div>
              ) : null}

              <div className="space-y-3 w-full">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
                  <p className="text-sm">Mở Camera trên điện thoại và quét mã QR.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
                  <p className="text-sm">
                    {isAutoLogin
                      ? "Hệ thống tự động đăng nhập — không cần nhập tài khoản."
                      : "Đăng nhập bằng tài khoản sinh viên của bạn."}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">3</div>
                  <p className="text-sm">Làm theo hướng dẫn để quét 5 góc khuôn mặt.</p>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Nên dùng Safari (iPhone) hoặc Chrome (Android)
        </p>
      </DialogContent>
    </Dialog>
  );
}
