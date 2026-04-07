import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@/i18n";
import App from "./App";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AlertDialogProvider } from "@/components/providers/alert-dialog-provider";
import { ConnectionProvider } from "@/components/providers/connection-provider";
import { OfflineModeProvider } from "@/components/providers/offline-mode-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <BrowserRouter>
      <ThemeProvider>
        <TooltipProvider>
          <ConnectionProvider>
            <OfflineModeProvider>
              <App />
              <AlertDialogProvider />
              <Toaster richColors position="bottom-right" />
            </OfflineModeProvider>
          </ConnectionProvider>
        </TooltipProvider>
      </ThemeProvider>
  </BrowserRouter>
);
