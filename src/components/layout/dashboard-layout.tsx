import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { useLocation } from "react-router-dom";

const pageTitleKeys: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/courses": "nav.courses",
  "/history": "nav.history",
  "/settings": "nav.settings",
  "/exams": "nav.exam",
};

function usePageTitle(pathname: string): string {
  const { t } = useTranslation();
  for (const [path, key] of Object.entries(pageTitleKeys)) {
    if (pathname.startsWith(path)) return t(key);
  }
  return t("nav.page");
}

export function DashboardLayout() {
  const location = useLocation();
  const pageTitle = usePageTitle(location.pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
