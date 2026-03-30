import { useMemo } from "react";
import { toast } from "sonner";

export function useToastCustom() {
  return useMemo(() => ({
    success: (message: string, description?: string) => {
      toast.success(message, { description });
    },
    error: (message: string, description?: string) => {
      toast.error(message, { description });
    },
    warning: (message: string, description?: string) => {
      toast.warning(message, { description });
    },
    info: (message: string, description?: string) => {
      toast.info(message, { description });
    },
    loading: (message: string) => {
      return toast.loading(message);
    },
    dismiss: (id?: string | number) => {
      toast.dismiss(id);
    },
    promise: <T,>(
      promise: Promise<T>,
      opts: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      }
    ) => {
      return toast.promise(promise, opts);
    },
  }), []);
}
