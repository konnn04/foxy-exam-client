import { Button } from "@/components/ui/button";
import { Shield, ChevronRight, ChevronLeft } from "lucide-react";
import type { ExamTrackingConfig, ExamData } from "@/types/exam";
import { CONFIG_ITEMS } from "@/constants/exam";
import { useTranslation } from "react-i18next";

export function InfoStep({
  examData, config, proctorConfig, onContinue, onBack,
}: {
  examData: ExamData;
  config: ExamTrackingConfig;
  proctorConfig: any;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const exam = examData.exam;
  const activeItems = CONFIG_ITEMS.filter((item) => {
    const v = config[item.key];
    if (typeof v === "boolean") return v;
    return false;
  });

  const camCfg = proctorConfig?.client_stream?.camera;
  const scrCfg = proctorConfig?.client_stream?.screen;

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div>
        <h2 className="text-lg font-bold">{exam.name ?? exam.title ?? t("precheck.examTitleDefault")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {exam.duration ?? exam.duration_minutes} {t("precheck.minutes")}
          {camCfg && ` · ${t("precheck.cameraLabel")} ${camCfg.height}p ${camCfg.fps}fps`}
          {scrCfg && ` · ${t("precheck.screenLabel")} ${scrCfg.height}p ${scrCfg.fps}fps`}
        </p>
      </div>

      {config.level !== "none" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
          <Shield className="h-4 w-4" />
          {t("precheck.proctorLevelLabel")}: {config.level === "strict" ? t("precheck.strict") : config.level === "standard" ? t("precheck.standard") : t("precheck.custom")}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("precheck.examRequirements")} ({activeItems.length})
        </p>
        {activeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("precheck.noSpecialRequirements")}</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {activeItems.map(({ key, icon: Icon, label, desc }) => (
              <div key={key} className="flex items-start gap-2.5 rounded-lg border p-2.5 text-sm">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-xs">{t(label)}</p>
                  <p className="text-[11px] text-muted-foreground">{t(desc)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />{t("common.back")}</Button>
        <Button onClick={onContinue} className="flex-1">{t("precheck.startCheck")}<ChevronRight className="h-4 w-4 ml-1" /></Button>
      </div>
    </div>
  );
}

