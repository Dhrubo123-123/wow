"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

export type ToastVariant = "default" | "success" | "danger" | "warning";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-surface-raised",
  success: "border-success/40 bg-surface-raised",
  danger: "border-danger/40 bg-surface-raised",
  warning: "border-warning/40 bg-surface-raised",
};

let idCounter = 0;

/**
 * App-wide toast provider. Wrap the root layout once; call useToast()
 * anywhere below it. Toasts are visually queued bottom-up, above the
 * BottomNavigation, and respect prefers-reduced-motion via CSS.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ durationMs = 4000, ...input }: ToastInput) => {
      idCounter += 1;
      const id = `toast-${idCounter}`;
      setToasts((prev) => [...prev, { id, durationMs, ...input }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-md border px-4 py-3 shadow-lg",
              "transition-all duration-200",
              variantClasses[t.variant ?? "default"],
            )}
          >
            <p className="text-sm font-medium text-foreground">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs text-muted">{t.description}</p>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
