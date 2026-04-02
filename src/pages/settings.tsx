import { useTranslation } from "react-i18next";
import { setExamLocale } from "@/i18n";
import { useTheme } from "@/hooks/use-theme";
import { useUser } from "@/hooks/use-user";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Globe,
  Palette,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  User,
  ShieldCheck,
} from "lucide-react";
import { API_CONFIG } from "@/config";

const PORTAL_URL = API_CONFIG.OAUTH_BASE_URL;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user } = useUser();

  const currentLang = i18n.language?.startsWith("vi") ? "vi" : "en";

  const themeOptions = [
    { value: "light", labelKey: "settings.themeLight", icon: Sun },
    { value: "dark", labelKey: "settings.themeDark", icon: Moon },
    { value: "system", labelKey: "settings.themeSystem", icon: Monitor },
  ] as const;

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("settings.profileTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              {user?.username && (
                <p className="text-sm text-muted-foreground">@{user.username}</p>
              )}
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`${PORTAL_URL}/profile`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {t("common.edit")}
              </a>
            </Button>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("settings.faceTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.faceDesc")}</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`${PORTAL_URL}/student/face-registration`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {t("common.manage")}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t("settings.appearanceTitle")}
          </CardTitle>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("settings.themeLabel")}</Label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:bg-accent/50 ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/30"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>
                      {t(opt.labelKey)}
                    </span>
                    {isActive && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        ✓
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("settings.langTitle")}
          </CardTitle>
          <CardDescription>{t("settings.langDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="lang-select">{t("settings.langLabel")}</Label>
            <Select
              value={currentLang}
              onValueChange={(v) => setExamLocale(v as "vi" | "en")}
            >
              <SelectTrigger id="lang-select" className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">🇻🇳 Tiếng Việt</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p className="font-medium">{t("brand.name")}</p>
            <p>{t("brand.description")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
