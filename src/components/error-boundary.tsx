import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Đã xảy ra lỗi (App Error)</h1>
          <p className="text-muted-foreground max-w-md text-center mb-6">
            Rất tiếc, client đã gặp lỗi không mong muốn. Vui lòng quay lại trang chủ và thử lại.
            <br/><br/>
            <span className="text-xs text-destructive/80 font-mono bg-destructive/10 p-2 block rounded">
              {this.state.error?.message}
            </span>
          </p>
          <Button onClick={() => window.location.href = "/dashboard"}>
            <Home className="h-4 w-4 mr-2" />
            Về trang chủ
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
