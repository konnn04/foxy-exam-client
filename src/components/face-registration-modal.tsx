import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Smartphone, CheckCircle, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FaceRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FaceRegistrationModal({ open, onOpenChange }: FaceRegistrationModalProps) {
  const REGISTRATION_URL = "https://exam-local.konnn04.dev/student/face-registration";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            Cập nhật Sinh trắc học 
          </DialogTitle>
          <DialogDescription>
            Hệ thống yêu cầu xử lý trên điện thoại di động vì cần nhận diện xoay đa hướng với độ chính xác cao.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-xl mt-2 border">
          <div className="bg-white p-3 rounded-lg shadow-sm border mb-4">
            <QRCodeSVG value={REGISTRATION_URL} size={160} level="M" />
          </div>
          
          <div className="space-y-4 w-full">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <p className="text-sm font-medium">Mở Camera trên điện thoại và quét mã QR bên trên.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <p className="text-sm font-medium">Đăng nhập tài khoản sinh viên.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <p className="text-sm font-medium">Làm theo hướng dẫn trên màn hình để quét 5 góc khuôn mặt.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs text-center text-muted-foreground my-2 flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Nên sử dụng Safari (iPhone) hoặc Chrome (Android)
          </p>
          <Button 
            variant="outline" 
            onClick={() => window.open(REGISTRATION_URL, '_blank')}
            className="w-full flex items-center gap-2"
          >
            <Smartphone className="w-4 h-4" />
            Mở trên máy điện thoại này (Nếu đang dùng ĐT)
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => window.open(REGISTRATION_URL, '_blank')}
            className="w-full flex items-center gap-2 text-muted-foreground"
          >
            <ExternalLink className="w-4 h-4" />
            Vẫn mở trên máy tính (Thủ công Upload)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
