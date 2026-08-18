"use client";

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

// This never changes after mount, so the subscribe function is a no-op —
// we only need useSyncExternalStore for its dual server/client snapshot,
// which is what actually avoids the hydration mismatch below (`navigator`
// doesn't exist during SSR, so this can't be computed at render time the
// same way on both sides without it).
const noopSubscribe = () => () => {};
function getCameraSupportSnapshot() {
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    // getUserMedia silently no-ops on http:// on most browsers — treat
    // insecure contexts as unsupported rather than let it hang forever.
    (window.isSecureContext || window.location.hostname === "localhost")
  );
}
function getCameraSupportServerSnapshot() {
  return false;
}

type CameraState =
  | "idle" // supported, but the user hasn't opted in yet
  | "requesting" // getUserMedia in flight
  | "streaming" // live preview
  | "captured" // frame frozen, awaiting retake/confirm
  | "permission-denied"
  | "no-camera-found"
  | "error";

export interface CameraCaptureProps {
  /** Called with the captured photo once the user confirms it. */
  onCapture: (blob: Blob) => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * Reusable camera capture widget (brief §10/§18: Phase 10).
 *
 * - Feature-detects `navigator.mediaDevices.getUserMedia` — never assumed.
 * - Never requests the camera on mount; only after the user explicitly
 *   taps "Enable Camera".
 * - Offers a front/back toggle when more than one video input exists.
 * - Every path that ends the stream (unmount, retake, cancel, confirm)
 *   stops every track — the camera light must never stay on after
 *   leaving the page.
 */
export function CameraCapture({ onCapture, onCancel, className }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isSupported = useSyncExternalStore(
    noopSubscribe,
    getCameraSupportSnapshot,
    getCameraSupportServerSnapshot,
  );

  const [state, setState] = useState<CameraState>("idle");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Safety net: if this component unmounts (user navigates away) while
  // the camera is live, stop it. Never rely solely on user action.
  useEffect(() => stopStream, [stopStream]);

  useEffect(() => {
    if (!isSupported || typeof navigator.mediaDevices.enumerateDevices !== "function") return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const cameras = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(cameras.length > 1);
      })
      .catch(() => {
        // Device labels/counts aren't available until permission is
        // granted in some browsers — that's fine, the flip button just
        // won't show until then.
      });
  }, [isSupported]);

  async function requestCamera(mode: "environment" | "user" = facingMode) {
    setState("requesting");
    stopStream();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(mode);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("streaming");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState("permission-denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setState("no-camera-found");
      } else {
        setState("error");
      }
    }
  }

  function flip() {
    void requestCamera(facingMode === "environment" ? "user" : "environment");
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    stopStream();
    setCapturedUrl(canvas.toDataURL("image/jpeg", 0.9));
    setState("captured");
  }

  function retake() {
    setCapturedUrl(null);
    void requestCamera();
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.9,
    );
  }

  function cancel() {
    stopStream();
    setCapturedUrl(null);
    setState("idle");
    onCancel?.();
  }

  // Gated on the sync-external-store snapshot, not `state` — this is
  // known safely on both server and client render passes (see
  // getCameraSupportSnapshot above), which is what avoids the hydration
  // mismatch a `state`-driven check would otherwise cause.
  if (!isSupported) {
    return (
      <div className={className}>
        <p className="rounded-md border border-border bg-surface-raised p-3 text-sm text-muted">
          Camera capture isn&apos;t supported in this browser. Try a recent
          version of Chrome, Safari, or Firefox over HTTPS.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {state === "idle" && (
        <Button fullWidth onClick={() => requestCamera()}>
          Enable Camera
        </Button>
      )}

      {state === "requesting" && (
        <p className="text-center text-sm text-muted">Requesting camera access…</p>
      )}

      {state === "permission-denied" && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-danger">
            Camera access was denied. Enable it in your browser&apos;s site
            settings, then try again.
          </p>
          <Button variant="secondary" fullWidth onClick={() => requestCamera()}>
            Try Again
          </Button>
        </div>
      )}

      {state === "no-camera-found" && (
        <p className="text-center text-sm text-danger">
          No camera was found on this device.
        </p>
      )}

      {state === "error" && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-danger">
            Something went wrong accessing the camera.
          </p>
          <Button variant="secondary" fullWidth onClick={() => requestCamera()}>
            Try Again
          </Button>
        </div>
      )}

      {state === "streaming" && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-md bg-black"
          />
          <div className="flex gap-2">
            {hasMultipleCameras && (
              <Button variant="secondary" onClick={flip} aria-label="Switch camera">
                Flip
              </Button>
            )}
            <Button fullWidth onClick={capture}>
              Capture
            </Button>
          </div>
        </div>
      )}

      {state === "captured" && capturedUrl && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local
              data: URL preview, not an optimizable remote image */}
          <img src={capturedUrl} alt="Captured evidence preview" className="w-full rounded-md" />
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={retake}>
              Retake
            </Button>
            <Button fullWidth onClick={confirm}>
              Use Photo
            </Button>
          </div>
        </div>
      )}

      {onCancel && state !== "captured" && state !== "idle" && (
        <button
          type="button"
          onClick={cancel}
          className="mt-2 w-full text-center text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
