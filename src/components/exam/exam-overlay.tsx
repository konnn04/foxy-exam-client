import { Button } from "@/components/ui/button";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import {
  Maximize,
  ShieldAlert,
} from "lucide-react";

export interface ExamOverlayProps {
  showLockOverlay: boolean;
  isBlurred: boolean;
  hardwareLock: string;
  monitorWarning: string;
  blurReason: string;
  violationsCount: number;
  devBypassLock: boolean;
  onSetDevBypassLock: (value: boolean) => void;
  onDismissBlur: () => void;
  onClearHardwareLock: () => void;
}

export function ExamOverlay({
  showLockOverlay,
  isBlurred,
  hardwareLock,
  monitorWarning,
  blurReason,
  violationsCount,
  devBypassLock,
  onSetDevBypassLock,
  onDismissBlur,
  onClearHardwareLock,
}: ExamOverlayProps) {
  return (
    <>
      {showLockOverlay && !isBlurred && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-background/95">
          <div className="bg-card border-2 border-primary/50 rounded-2xl p-8 max-w-sm text-center space-y-4 shadow-xl">
            <div className="flex justify-center">
              <ShieldAlert className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h2 className="text-xl font-bold">Tạm khóa phần thi</h2>
            <p className="text-muted-foreground">{monitorWarning}</p>
            <p className="text-xs text-muted-foreground mt-4">
              Bài thi sẽ tự động mở lại khi hệ thống xác định khuôn mặt hợp lệ.
            </p>
            {DEVELOPMENT_MODE.ENABLED && (
              <Button
                variant="outline"
                className="w-full mt-4 border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                onClick={() => onSetDevBypassLock(true)}
              >
                [Dev] Bỏ qua cảnh báo
              </Button>
            )}
          </div>
        </div>
      )}

      {(isBlurred || hardwareLock !== "") && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95">
          <div className="bg-card border rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-destructive">
              {hardwareLock !== "" ? "Thiết bị/Phần mềm không hợp lệ!" : "Cảnh báo vi phạm!"}
            </h2>
            <p className="text-muted-foreground">{hardwareLock !== "" ? hardwareLock : blurReason}</p>
            <p className="text-sm text-muted-foreground">
              Hành vi này đã được hệ thống giám sát ghi nhận ({violationsCount} lần vi phạm).
              <br />
              Vui lòng xử lý vấn đề hiển thị trên để tiếp tục làm bài.
            </p>
            {hardwareLock !== "" && !devBypassLock ? (
              <div className="text-destructive font-semibold animate-pulse mt-4 bg-destructive/10 p-3 rounded-lg border border-destructive/20 whitespace-pre-wrap text-sm">
                Đang chờ hệ thống xác nhận khắc phục vấn đề...
              </div>
            ) : (
              <Button onClick={onDismissBlur} className="w-full mt-4">
                <Maximize className="h-4 w-4 mr-2" />
                Quay lại làm bài & Tiếp tục
              </Button>
            )}

            {DEVELOPMENT_MODE.ENABLED && hardwareLock !== "" && (
              <Button
                onClick={() => {
                  onClearHardwareLock();
                  onDismissBlur();
                }}
                variant="outline"
                className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2"
              >
                [Dev] Ignore Lock
              </Button>
            )}
            {DEVELOPMENT_MODE.ENABLED && hardwareLock === "" && (
              <Button
                onClick={onDismissBlur}
                variant="outline"
                className="w-full border-dashed border-red-500 text-red-500 hover:bg-red-500 hover:text-white mt-2"
              >
                [Dev] Bỏ qua cảnh báo nhanh
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
