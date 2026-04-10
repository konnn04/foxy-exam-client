import { useTranslation } from "react-i18next";
import {
  AppWindow,
  Ban,
  Box,
  Camera,
  Eye,
  Fingerprint,
  LayoutGrid,
  Mic,
  Monitor,
  ScanFace,
  Shield,
  Video,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setExamLocale } from "@/i18n";
import type { ExamTrackingConfig } from "@/types/exam";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

type ProctorApiConfig = {
  client_stream?: {
    camera?: { fps?: number; height?: number };
    screen?: { fps?: number; height?: number };
  };
};

function Row({
  icon: Icon,
  label,
  value,
  active,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  active: boolean;
  description?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex gap-3 rounded-xl border p-3 transition-colors text-left w-full hover:bg-muted/50 cursor-help ${
              active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/50"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium leading-tight">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
              </div>
              {description && <HelpCircle className="h-4 w-4 text-muted-foreground opacity-50" />}
            </div>
          </div>
        </TooltipTrigger>
        {description && (
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">{description}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export function ProctoringConfigSummary({
  config,
  proctorConfig,
  onContinue,
  continueLabel,
  showLanguageToggle = true,
}: {
  config: ExamTrackingConfig;
  proctorConfig: ProctorApiConfig | null;
  onContinue: () => void;
  continueLabel: string;
  showLanguageToggle?: boolean;
}) {
  const { t, i18n } = useTranslation();

  const levelLabel = (() => {
    switch (config.level) {
      case "none":
        return t("proctoring.level_none");
      case "standard":
        return t("proctoring.level_standard");
      case "strict":
        return t("proctoring.level_strict");
      case "custom":
        return t("proctoring.level_custom");
      default:
        return config.level;
    }
  })();

  const cam = proctorConfig?.client_stream?.camera;
  const scr = proctorConfig?.client_stream?.screen;

  const rows: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    description: string;
    active: boolean;
  }[] = [
    {
      icon: Shield,
      label: t("proctoring.level"),
      value: levelLabel,
      description: t("proctoring.levelDesc", "Mức độ giám sát tổng thể của bài thi (None, Standard, Strict)."),
      active: true,
    },
    {
      icon: AppWindow,
      label: t("proctoring.requireApp"),
      value: config.requireApp ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.requireAppDesc", "Bắt buộc thi bằng Ứng dụng Desktop thay vì trình duyệt Web để ngăn chặn gian lận phần mềm."),
      active: Boolean(config.requireApp),
    },
    {
      icon: Camera,
      label: t("proctoring.requireCamera"),
      value: config.requireCamera ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.requireCameraDesc", "Hệ thống sẽ ghi hình và phân tích cử chỉ hành vi qua Webcam trong suốt quá trình thi."),
      active: Boolean(config.requireCamera),
    },
    {
      icon: Monitor,
      label: t("proctoring.requireScreen"),
      value: config.requireScreenShare ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.requireScreenDesc", "Toàn bộ màn hình máy tính của bạn sẽ được chia sẻ và ghi hình để giám thị theo dõi."),
      active: Boolean(config.requireScreenShare),
    },
    {
      icon: LayoutGrid,
      label: t("proctoring.noMultiMonitor"),
      value: config.noMultiMonitor ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.noMultiMonitorDesc", "Cấm sử dụng nhiều hơn 1 màn hình. Bạn phải ngắt kết nối các màn hình phụ để vào thi."),
      active: Boolean(config.noMultiMonitor),
    },
    {
      icon: Eye,
      label: t("proctoring.monitorGaze"),
      value: config.monitorGaze ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.monitorGazeDesc", "AI theo dõi hướng ánh mắt để cảnh báo nếu thí sinh nhìn ra ngoài không gian làm bài quá lâu."),
      active: Boolean(config.monitorGaze),
    },
    {
      icon: Mic,
      label: t("proctoring.requireMic"),
      value: config.requireMic ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.requireMicDesc", "Ghi âm thanh phòng thi để hệ thống AI phát hiện tiếng nói chuyện và hỗ trợ giám thị nhận diện tiếng ồn bất thường."),
      active: Boolean(config.requireMic),
    },
    {
      icon: ScanFace,
      label: t("proctoring.requireFaceAuth"),
      value: config.requireFaceAuth ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.requireFaceAuthDesc", "Sử dụng AI khớp khuôn mặt thật của thí sinh với ảnh hồ sơ thẻ sinh viên trước khi vào phòng thi."),
      active: Boolean(config.requireFaceAuth),
    },
    {
      icon: Ban,
      label: t("proctoring.detectBannedApps"),
      value: config.detectBannedApps ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.detectBannedAppsDesc", "Hệ thống sẽ liên tục quét và ngăn thí sinh chạy các ứng dụng bị cấm (như Discord, TeamViewer, Zalo, vv...)."),
      active: Boolean(config.detectBannedApps),
    },
    {
      icon: Box,
      label: t("proctoring.detectBannedObjects"),
      value: config.detectBannedObjects ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.detectBannedObjectsDesc", "AI phân tích hình ảnh AI Camera để phát hiện vật thể cấm như Smartphone, Tai nghe, vv..."),
      active: Boolean(config.detectBannedObjects),
    },
    {
      icon: Fingerprint,
      label: t("proctoring.lockDevice"),
      value: config.lockDevice ? t("proctoring.enabled") : t("proctoring.disabled"),
      description: t("proctoring.lockDeviceDesc", "Khóa bài thi với thiết bị (Browser/Máy tính) cụ thể. Ngăn thí sinh đổi máy giữa phiên."),
      active: Boolean(config.lockDevice),
    },
  ];

  if (cam?.fps != null && cam?.height != null) {
    rows.push({
      icon: Video,
      label: t("proctoring.streamCamera", { fps: cam.fps, h: cam.height }),
      value: `${cam.fps} fps · ${cam.height}px`,
      description: t("proctoring.streamCameraDesc", "Chất lượng đường truyền video AI Camera giám sát từ thiết bị lên Server."),
      active: true,
    });
  }
  if (scr?.fps != null && scr?.height != null) {
    rows.push({
      icon: Monitor,
      label: t("proctoring.streamScreen", { fps: scr.fps, h: scr.height }),
      value: `${scr.fps} fps · ${scr.height}px`,
      description: t("proctoring.streamScreenDesc", "Chất lượng đường truyền chia sẻ Video Màn hình bài làm lên Server."),
      active: true,
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 px-4 py-8">
      <div className="mx-auto max-w-lg">
        {showLanguageToggle && (
          <div className="mb-4 flex justify-end gap-2">
            <span className="sr-only">{t("common.language")}</span>
            <Button
              type="button"
              variant={i18n.language.startsWith("vi") ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setExamLocale("vi")}
            >
              Tiếng Việt
            </Button>
            <Button
              type="button"
              variant={i18n.language.startsWith("en") ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setExamLocale("en")}
            >
              English
            </Button>
          </div>
        )}

        <Card className="border-2 shadow-lg">
          <CardHeader className="space-y-1 pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle className="text-xl">{t("precheck.configTitle")}</CardTitle>
            </div>
            <CardDescription>{t("precheck.configSubtitle")}</CardDescription>
            <Badge variant="secondary" className="w-fit">
              {levelLabel}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto pr-1">
            {rows.map((row, i) => (
              <Row key={i} {...row} />
            ))}
          </CardContent>
        </Card>

        <Button className="mt-6 h-12 w-full text-base font-semibold shadow-md" size="lg" onClick={onContinue}>
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
