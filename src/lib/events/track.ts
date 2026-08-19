"use client";

import type { EventName } from "./names";

/**
 * Client-side event tracking — fire-and-forget by design. Analytics
 * must never block or fail a user-facing action, so this never awaits
 * its own result, never throws, and never shows an error to the user.
 */
export function track(name: EventName, props: Record<string, unknown> = {}) {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, props }),
      keepalive: true, // survives a navigation that happens right after
    }).catch(() => {});
  } catch {
    // Fire-and-forget — never let analytics break the actual action.
  }
}
