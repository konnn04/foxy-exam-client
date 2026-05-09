import { useEffect, useState } from "react";
import {
  AlertTriangle,
  MessageCircle,
  Monitor,
  ShieldAlert,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface KeyLogItem {
  id: string;
  key: string;
}

export function KeyboardLogBar() {
  const [keys, setKeys] = useState<KeyLogItem[]>([]);

  useEffect(() => {
    const handleKey = (e: any) => {
      const keyDetail = e.detail;
      const newKey: KeyLogItem = { id: Date.now().toString() + Math.random(), key: keyDetail };
      
      setKeys(prev => {
        const next = [...prev, newKey];
        if (next.length > 30) return next.slice(next.length - 30);
        return next;
      });

      setTimeout(() => {
        setKeys(prev => prev.filter(k => k.id !== newKey.id));
      }, 3000);
    };

    window.addEventListener("exam-keypressed", handleKey);
    return () => window.removeEventListener("exam-keypressed", handleKey);
  }, []);

  if (keys.length === 0) return null;

  return (
    <div className="h-7 bg-zinc-900 border-t border-zinc-800 shrink-0 flex items-center px-4 justify-start z-30 transition-all w-full">
      <div className="flex gap-1.5 items-center flex-wrap overflow-hidden h-full w-full">
        <span className="text-[10px] text-zinc-500 mr-1 font-mono uppercase tracking-wider shrink-0">Lịch sử phím:</span>
        {keys.map(k => (
          <span 
            key={k.id} 
            className="animate-in fade-in zoom-in duration-200 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono min-w-[20px] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-32 shrink-0"
          >
            {k.key}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ExamStatusBarProps {
  violationsCount: number;
  screenCount: number;
  requireCamera: boolean;
  detectBannedApps: boolean;
  strictMode: boolean;
  bannedApps: string[];
  isScreenSharing: boolean;
  onChatToggle?: () => void;
  unreadCount?: number;
}

export function ExamStatusBar({
  violationsCount,
  screenCount,
  requireCamera,
  detectBannedApps,
  strictMode,
  bannedApps,
  isScreenSharing,
  onChatToggle,
  unreadCount = 0,
}: ExamStatusBarProps) {
  const { t } = useTranslation();
  return (
    <div className="h-7 bg-card border-t shrink-0 flex items-center px-4 justify-between z-40 text-xs text-muted-foreground font-mono">
      <div className="flex gap-4">
        <div className="flex items-center gap-1" title="Số vi phạm">
          <AlertTriangle className={`h-3 w-3 ${violationsCount > 0 ? "text-destructive" : ""}`} />
          <span className={violationsCount > 0 ? "text-destructive font-bold" : ""}>{violationsCount} Vi phạm</span>
        </div>
        <div className="flex items-center gap-1" title="Số Màn hình">
          <Monitor className={`h-3 w-3 ${screenCount > 1 ? "text-destructive font-bold" : ""}`} />
          <span className={screenCount > 1 ? "text-destructive font-bold" : ""}>{screenCount} Màn hình</span>
        </div>
        {requireCamera && (
          <div className="flex items-center gap-1" title="Số Camera">
            <Video className="h-3 w-3 text-green-500" />
            <span>1 Camera</span>
          </div>
        )}
        {(detectBannedApps || strictMode) && (
          <div className="flex items-center gap-1" title="Giám sát tiến trình">
            <ShieldAlert className="h-3 w-3 text-green-500" />
            <span>Theo dõi tiến trình</span>
          </div>
        )}
        <div className="flex items-center gap-1" title="Giám sát màn hình">
          <Monitor className={`h-3 w-3 ${isScreenSharing ? "text-green-500" : "text-destructive"}`} />
          <span className={isScreenSharing ? "text-green-600" : "text-destructive font-bold"}>
            {isScreenSharing ? "Đang chia sẻ màn hình" : "Mất chia sẻ màn hình"}
          </span>
        </div>
        {bannedApps.length > 0 && (
          <div className="flex items-center gap-1 text-destructive font-bold">
            <ShieldAlert className="h-3 w-3" />
            <span>Cấm: {bannedApps.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>{t("brand.name")}</span>
        {onChatToggle && (
          <button
            onClick={onChatToggle}
            className="relative flex items-center gap-1 px-2 py-0.5 rounded hover:bg-primary/10 transition-colors cursor-pointer"
            title="Chat với Giám thị"
          >
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary font-medium">Chat</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1 bg-destructive text-white text-[9px] rounded-full h-3.5 min-w-[14px] flex items-center justify-center font-bold px-0.5">
                {unreadCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
