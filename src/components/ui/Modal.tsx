"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Mobile-first modal: bottom-sheet on small screens, centered dialog on
 * larger viewports. Traps focus loosely via autofocus + Escape-to-close;
 * a fuller focus trap can be added later if audits flag it as needed.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-h-[85vh] overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-5 pb-safe",
          "sm:max-w-md sm:rounded-xl sm:pb-5",
          "focus:outline-none",
          className,
        )}
      >
        {title && (
          <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
