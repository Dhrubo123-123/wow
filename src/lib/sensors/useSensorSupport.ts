"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * SSR-safe feature detection for a global constructor name (e.g.
 * "DeviceOrientationEvent"). Plain `typeof window !== "undefined" &&
 * "X" in window` computed at render time causes a hydration mismatch —
 * true on the client, but the check can't run at all during SSR — so
 * this always reports `false` for the server snapshot and lets React
 * reconcile to the real value right after hydration (same fix as
 * CameraCapture's camera-support check in Phase 10).
 */
export function useSensorSupport(globalName: string): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && globalName in window,
    () => false,
  );
}
