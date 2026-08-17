"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown in the root layout itself (outside AppShell's
 * ErrorBoundary and error.tsx's reach). Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0b0b12] p-6 text-center text-[#f4f4f8]">
        <p className="text-lg font-semibold">Something went wrong.</p>
        <p className="text-sm text-[#9a9ab0]">
          Your progress is safe. Please try again.
        </p>
        <button
          onClick={reset}
          className="h-11 rounded-md bg-[#8b5cf6] px-4 font-medium text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
