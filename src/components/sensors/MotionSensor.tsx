"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useSensorSupport } from "@/lib/sensors/useSensorSupport";
import type { MotionReading, PermissionGatedEventConstructor } from "@/lib/sensors/types";

export interface MotionSensorProps {
  /** Called on every reading once permission is granted and events flow. */
  onReading?: (reading: MotionReading) => void;
  className?: string;
}

/**
 * Reusable device-motion widget (brief §11: Phase 11) — accelerometer +
 * rotation rate. Same shape as OrientationSensor: never assumes the
 * Generic Sensor API, only requests iOS's explicit permission from a
 * real click.
 */
export function MotionSensor({ onReading, className }: MotionSensorProps) {
  const supported = useSensorSupport("DeviceMotionEvent");
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [reading, setReading] = useState<MotionReading | null>(null);
  const onReadingRef = useRef(onReading);
  useEffect(() => {
    onReadingRef.current = onReading;
  }, [onReading]);

  const requiresExplicitPermission =
    supported &&
    typeof (window.DeviceMotionEvent as unknown as PermissionGatedEventConstructor)
      ?.requestPermission === "function";

  useEffect(() => {
    if (permission !== "granted") return;

    function handle(event: DeviceMotionEvent) {
      const next: MotionReading = {
        accelerationX: event.acceleration?.x ?? null,
        accelerationY: event.acceleration?.y ?? null,
        accelerationZ: event.acceleration?.z ?? null,
        rotationRateAlpha: event.rotationRate?.alpha ?? null,
        rotationRateBeta: event.rotationRate?.beta ?? null,
        rotationRateGamma: event.rotationRate?.gamma ?? null,
      };
      setReading(next);
      onReadingRef.current?.(next);
    }

    window.addEventListener("devicemotion", handle);
    return () => window.removeEventListener("devicemotion", handle);
  }, [permission]);

  async function enable() {
    if (requiresExplicitPermission) {
      try {
        const result = await (
          window.DeviceMotionEvent as unknown as Required<PermissionGatedEventConstructor>
        ).requestPermission();
        setPermission(result === "granted" ? "granted" : "denied");
      } catch {
        setPermission("denied");
      }
      return;
    }
    setPermission("granted");
  }

  if (!supported) {
    return (
      <p className={className}>
        <span className="rounded-md border border-border bg-surface-raised p-3 text-sm text-muted block">
          Motion unavailable — motion sensing isn&apos;t supported on this
          device/browser.
        </span>
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <div className={className}>
        <p className="text-sm text-danger">
          Permission denied. Enable motion access in your browser settings to
          use motion-based features.
        </p>
      </div>
    );
  }

  if (permission !== "granted") {
    return (
      <div className={className}>
        <Button fullWidth onClick={enable}>
          Enable Motion Access
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-xs text-muted">Motion supported</p>
      {reading && (
        <p className="font-mono text-xs">
          a ({reading.accelerationX?.toFixed(1) ?? "—"},{" "}
          {reading.accelerationY?.toFixed(1) ?? "—"}, {reading.accelerationZ?.toFixed(1) ?? "—"})
        </p>
      )}
    </div>
  );
}
