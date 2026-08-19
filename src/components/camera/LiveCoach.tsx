"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { speak, vibrate } from "@/lib/audio/sound";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";

// Mirrors CameraCapture's support check — see that file for why
// useSyncExternalStore (not useState+useEffect) is what avoids the
// hydration mismatch here.
const noopSubscribe = () => () => {};
function getCameraSupportSnapshot() {
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    (window.isSecureContext || window.location.hostname === "localhost")
  );
}
function getCameraSupportServerSnapshot() {
  return false;
}

type CoachStatus = "good" | "warning" | "danger";
interface CoachFeedback {
  status: CoachStatus;
  message: string;
  at: number;
}

// The vision model's account-level rate limit is ~8000 tokens/minute,
// and one frame costs ~1850 tokens regardless of resolution (fixed
// image tiling — confirmed by direct testing, not a guess). ~4
// requests/minute is the real sustainable ceiling, so 15s is the
// fastest cadence that doesn't routinely 429 rather than an arbitrary
// "feels responsive" number.
const FRAME_INTERVAL_MS = 15000;
const MAX_SESSION_MS = 6 * 60 * 1000; // 6 minutes — bounds vision-API cost per session
const STATUS_STYLES: Record<CoachStatus, string> = {
  good: "border-success bg-success/10 text-success",
  warning: "border-warning bg-warning/10 text-warning",
  danger: "border-danger bg-danger/10 text-danger",
};
const STATUS_LABEL: Record<CoachStatus, { en: string; hi: string }> = {
  good: { en: "Looking good", hi: "बढ़िया चल रहा है" },
  warning: { en: "Heads up", hi: "ध्यान दें" },
  danger: { en: "Stop", hi: "रुकिए" },
};

export interface LiveCoachProps {
  questId: string;
  className?: string;
}

/**
 * "AI has eyes" — a live, opt-in vision coach that watches the camera
 * while a quest is underway and speaks real-time corrections (form,
 * technique, safety) rather than just scoring a final photo. This is
 * genuinely a periodic-snapshot analysis (one frame roughly every 15s,
 * see FRAME_INTERVAL_MS), not literal continuous video understanding —
 * no hosted model does that affordably — but at this cadence it reads
 * as "someone watching you work."
 *
 * Entirely separate from CameraCapture (evidence photo): this never
 * captures or submits anything, it only ever holds one frame in memory
 * long enough to POST it to /api/quests/[id]/coach and immediately
 * discards it. The camera stream stops the instant the session ends,
 * is stopped, or the component unmounts — never left running silently.
 */
export function LiveCoach({ questId, className }: LiveCoachProps) {
  const { enabled: soundEnabled, lang } = useSoundPreference();
  const isSupported = useSyncExternalStore(
    noopSubscribe,
    getCameraSupportSnapshot,
    getCameraSupportServerSnapshot,
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentMessagesRef = useRef<string[]>([]);
  const inFlightRef = useRef(false);

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
    intervalRef.current = null;
    sessionTimeoutRef.current = null;
    stopStream();
    setActive(false);
    setFeedback(null);
  }, [stopStream]);

  // Safety net — never leave the camera running if this unmounts.
  useEffect(() => stop, [stop]);

  const captureAndAnalyze = useCallback(async () => {
    if (inFlightRef.current) return; // never overlap two in-flight analyses
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = canvas.toDataURL("image/jpeg", 0.6);

    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/quests/${questId}/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame, lang, recentMessages: recentMessagesRef.current }),
      });
      if (!res.ok) return; // a missed check-in is fine, next interval retries

      const verdict = (await res.json()) as { status: CoachStatus; message: string };
      setFeedback({ status: verdict.status, message: verdict.message, at: Date.now() });
      recentMessagesRef.current = [...recentMessagesRef.current, verdict.message].slice(-3);

      speak(verdict.message, soundEnabled, lang);
      if (verdict.status === "danger") vibrate([100, 60, 100, 60, 100]);
      else if (verdict.status === "warning") vibrate(100);
    } catch {
      // Network hiccup on one frame isn't worth surfacing — it'll try again.
    } finally {
      inFlightRef.current = false;
    }
  }, [questId, lang, soundEnabled]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      setElapsedMs(0);
      recentMessagesRef.current = [];
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera access was denied — enable it in your browser's site settings to use the Live Coach."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : "Couldn't start the camera. Please try again.",
      );
    } finally {
      setStarting(false);
    }
  }

  // Latest callbacks in refs so the session-lifecycle effect below can
  // depend on `active` alone — re-running it every time captureAndAnalyze
  // is recreated (e.g. the sound/lang preference loads in) would restart
  // the interval and session timer mid-session.
  const captureAndAnalyzeRef = useRef(captureAndAnalyze);
  const stopRef = useRef(stop);
  useEffect(() => {
    captureAndAnalyzeRef.current = captureAndAnalyze;
    stopRef.current = stop;
  }, [captureAndAnalyze, stop]);

  // Attaches the stream once <video> has actually mounted (state ===
  // active render), then starts the analysis loop and the session timer.
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});

    const startedAt = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    intervalRef.current = setInterval(() => captureAndAnalyzeRef.current(), FRAME_INTERVAL_MS);
    // First check-in shortly after start, rather than waiting a full interval.
    const firstCheck = setTimeout(() => captureAndAnalyzeRef.current(), 1500);
    sessionTimeoutRef.current = setTimeout(() => stopRef.current(), MAX_SESSION_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(firstCheck);
    };
  }, [active]);

  if (!isSupported) return null; // silently absent where camera isn't available at all

  const remainingSeconds = Math.max(0, Math.round((MAX_SESSION_MS - elapsedMs) / 1000));
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className={className}>
      {!active && (
        <Button variant="secondary" fullWidth loading={starting} onClick={start}>
          🎥 Start Live AI Coach (Beta)
        </Button>
      )}

      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}

      {active && (
        <div className="space-y-2">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              Live · {mm}:{ss} left
            </div>
            {feedback && (
              <div
                className={`absolute bottom-0 left-0 right-0 border-t px-3 py-2 text-sm backdrop-blur ${STATUS_STYLES[feedback.status]}`}
              >
                <span className="font-semibold">
                  {STATUS_LABEL[feedback.status][lang]}:
                </span>{" "}
                {feedback.message}
              </div>
            )}
          </div>
          <Button variant="secondary" fullWidth onClick={stop}>
            Stop AI Coach
          </Button>
          <p className="text-center text-xs text-muted">
            Advisory only — this doesn&apos;t submit evidence or affect your quest. Frames are
            analyzed live and never saved.
          </p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
