"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { PermissionState } from "@/lib/supabase/types";
import { subscribeToPush } from "@/lib/push/subscribeClient";

type DeviceKey = "camera" | "microphone" | "motion" | "location" | "notifications";

interface DevicePermissionsPanelProps {
  userId: string;
  initial: Record<DeviceKey, PermissionState>;
}

const LABELS: Record<DeviceKey, string> = {
  camera: "Camera",
  microphone: "Microphone",
  motion: "Motion",
  location: "Location",
  notifications: "Notifications",
};

const BADGE_VARIANT: Record<PermissionState, "default" | "success" | "danger" | "warning"> = {
  unknown: "default",
  granted: "success",
  denied: "danger",
  unsupported: "warning",
};

async function checkPermission(key: DeviceKey): Promise<PermissionState> {
  try {
    switch (key) {
      case "camera":
      case "microphone": {
        if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
        if (navigator.permissions?.query) {
          try {
            const status = await navigator.permissions.query({
              name: key as PermissionName,
            });
            if (status.state === "granted") return "granted";
            if (status.state === "denied") return "denied";
          } catch {
            // Some browsers (Safari) don't support querying camera/mic —
            // fall through to an actual request below.
          }
        }
        const stream = await navigator.mediaDevices.getUserMedia(
          key === "camera" ? { video: true } : { audio: true },
        );
        stream.getTracks().forEach((t) => t.stop());
        return "granted";
      }
      case "motion": {
        if (typeof DeviceMotionEvent === "undefined") return "unsupported";
        const ctor = DeviceMotionEvent as unknown as {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
        if (typeof ctor.requestPermission === "function") {
          const result = await ctor.requestPermission();
          return result === "granted" ? "granted" : "denied";
        }
        // No permission gate on this browser — support implies access.
        return "granted";
      }
      case "location": {
        if (!navigator.geolocation) return "unsupported";
        return await new Promise<PermissionState>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve("granted"),
            (err) => resolve(err.code === err.PERMISSION_DENIED ? "denied" : "unsupported"),
            { timeout: 5000 },
          );
        });
      }
      case "notifications": {
        if (typeof Notification === "undefined") return "unsupported";
        if (Notification.permission === "granted") {
          void subscribeToPush();
          return "granted";
        }
        if (Notification.permission === "denied") return "denied";
        const result = await Notification.requestPermission();
        // Roadmap item 6 — the moment OS permission is granted is also
        // the moment to actually create + persist the PushSubscription;
        // otherwise "granted" would just sit there unused.
        if (result === "granted") void subscribeToPush();
        return result === "granted" ? "granted" : "denied";
      }
    }
  } catch {
    return "denied";
  }
}

export function DevicePermissionsPanel({ userId, initial }: DevicePermissionsPanelProps) {
  const [states, setStates] = useState(initial);
  const [checking, setChecking] = useState<DeviceKey | null>(null);

  async function handleCheck(key: DeviceKey) {
    setChecking(key);
    const result = await checkPermission(key);
    setStates((prev) => ({ ...prev, [key]: result }));
    setChecking(null);

    const supabase = createClient();
    const payload: Record<DeviceKey, PermissionState> & { user_id: string } = {
      ...states,
      user_id: userId,
      [key]: result,
    };
    await supabase.from("device_permissions").upsert(payload, { onConflict: "user_id" });
  }

  return (
    <div className="space-y-3">
      {(Object.keys(LABELS) as DeviceKey[]).map((key) => (
        <Card key={key}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{LABELS[key]}</CardTitle>
              <Badge variant={BADGE_VARIANT[states[key]]}>{states[key]}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="secondary"
              size="sm"
              loading={checking === key}
              onClick={() => handleCheck(key)}
            >
              Check {LABELS[key]}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
