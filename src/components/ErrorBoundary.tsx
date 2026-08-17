"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Generic React error boundary for wrapping arbitrary subtrees (e.g. the
 * camera capture widget in Phase 10, or a single dashboard card) so a
 * render error there doesn't take down the whole shell. Route-level
 * failures are handled separately by app/error.tsx (Next.js convention).
 *
 * User-facing copy follows Phase 24: never a raw stack trace.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 25 observability: replace with structured logging, never log
    // secrets or raw evidence content.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.retry);
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Something went wrong.
          </p>
          <p className="text-xs text-muted">Your progress is safe.</p>
          <Button size="sm" variant="secondary" onClick={this.retry}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
