// Re-exported from the Phase 2 DB enum — device_permissions.motion uses
// the exact same four states, so the UI and the persisted record agree.
export type { PermissionState } from "@/lib/supabase/types";

export interface OrientationReading {
  alpha: number | null; // compass heading, 0-360
  beta: number | null; // front-back tilt, -180-180
  gamma: number | null; // left-right tilt, -90-90
}

export interface MotionReading {
  accelerationX: number | null;
  accelerationY: number | null;
  accelerationZ: number | null;
  rotationRateAlpha: number | null;
  rotationRateBeta: number | null;
  rotationRateGamma: number | null;
}

/**
 * iOS 13+ gates both DeviceOrientationEvent and DeviceMotionEvent behind
 * an explicit `requestPermission()` call that must run inside a user
 * gesture handler. No other browser exposes this — Chrome/Firefox/
 * Android fire the events directly with no JS-level permission step (the
 * brief: "Do not assume Generic Sensor API is available").
 */
export interface PermissionGatedEventConstructor {
  requestPermission?: () => Promise<"granted" | "denied">;
}
