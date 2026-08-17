"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Route-segment error boundary (Next.js convention). Never surfaces the
 * raw error/stack trace to the user — see Phase 24.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">Something went wrong.</p>
      <p className="text-sm text-muted">
        Your quest was not lost.
        <br />
        Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
