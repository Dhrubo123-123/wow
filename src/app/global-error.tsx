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
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#05061a] p-6 text-center text-[#f3f5ff]">
        <p className="text-lg font-semibold">Something went wrong.</p>
        <p className="text-sm text-[#9ea3d6]">
          Your progress is safe. Please try again.
        </p>
        <button
          onClick={reset}
          className="h-11 rounded-md bg-gradient-to-br from-[#6d5bff] to-[#22d3ee] px-4 font-medium text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
