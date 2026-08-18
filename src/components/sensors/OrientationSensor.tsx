"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useSensorSupport } from "@/lib/sensors/useSensorSupport";
import type { OrientationReading, PermissionGatedEventConstructor } from "@/lib/sensors/types";

export interface OrientationSensorProps {
  /** Called on every reading once permission is granted and events flow. */
  onReading?: (reading: OrientationReading) => void;
  className?: string;
}

/**
 * Reusable device-orientation widget (brief §11: Phase 11). Never
 * assumes the Generic Sensor API — uses DeviceOrientationEvent directly,
 * and only calls the iOS-specific `requestPermission()` gate in response
 * to a real click, never on mount.
 */
export function OrientationSensor({ onReading, className }: OrientationSensorProps) {
  const supported = useSensorSupport("DeviceOrientationEvent");
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [reading, setReading] = useState<OrientationReading | null>(null);
  const onReadingRef = useRef(onReading);
  useEffect(() => {
    onReadingRef.current = onReading;
  }, [onReading]);

  const requiresExplicitPermission =
    supported &&
    typeof (window.DeviceOrientationEvent as unknown as PermissionGatedEventConstructor)
      ?.requestPermission === "function";

  useEffect(() => {
    if (permission !== "granted") return;

    function handle(event: DeviceOrientationEvent) {
      const next: OrientationReading = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
      };
      setReading(next);
      onReadingRef.current?.(next);
    }

    window.addEventListener("deviceorientation", handle);
    return () => window.removeEventListener("deviceorientation", handle);
  }, [permission]);

  async function enable() {
    if (requiresExplicitPermission) {
      try {
        const result = await (
          window.DeviceOrientationEvent as unknown as Required<PermissionGatedEventConstructor>
        ).requestPermission();
        setPermission(result === "granted" ? "granted" : "denied");
      } catch {
        setPermission("denied");
      }
      return;
    }
    // No permission API on this browser (Android/desktop) — the events
    // just start flowing once a listener is attached.
    setPermission("granted");
  }

  if (!supported) {
    return (
      <p className={className}>
        <span className="rounded-md border border-border bg-surface-raised p-3 text-sm text-muted block">
          Motion unavailable — orientation sensing isn&apos;t supported on
          this device/browser.
        </span>
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <div className={className}>
        <p className="text-sm text-danger">
          Permission denied. Enable motion access in your browser settings to
          use tilt-based features.
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
          α {reading.alpha?.toFixed(1) ?? "—"} · β {reading.beta?.toFixed(1) ?? "—"} · γ{" "}
          {reading.gamma?.toFixed(1) ?? "—"}
        </p>
      )}
    </div>
  );
}
