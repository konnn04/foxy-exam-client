import { create } from "zustand";

interface AlertDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "destructive";
  resolve: ((value: boolean) => void) | null;
  confirm: (opts?: {
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "default" | "destructive";
  }) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

export const useAlertDialogStore = create<AlertDialogState>((set, get) => ({
  isOpen: false,
  title: "Xác nhận",
  description: "Bạn có chắc chắn muốn thực hiện hành động này?",
  confirmLabel: "Đồng ý",
  cancelLabel: "Hủy",
  variant: "default",
  resolve: null,

  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        title: opts?.title ?? "Xác nhận",
        description:
          opts?.description ??
          "Bạn có chắc chắn muốn thực hiện hành động này?",
        confirmLabel: opts?.confirmLabel ?? "Đồng ý",
        cancelLabel: opts?.cancelLabel ?? "Hủy",
        variant: opts?.variant ?? "default",
        resolve,
      });
    }),

  handleConfirm: () => {
    const { resolve } = get();
    resolve?.(true);
    set({ isOpen: false, resolve: null });
  },

  handleCancel: () => {
    const { resolve } = get();
    resolve?.(false);
    set({ isOpen: false, resolve: null });
  },
}));

export function useAlertDialog() {
  const confirm = useAlertDialogStore((s) => s.confirm);
  return { confirm };
}
