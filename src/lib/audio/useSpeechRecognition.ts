"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { VoiceLang } from "./sound";

/**
 * Thin wrapper around the Web Speech API's SpeechRecognition — the
 * "listen" half of a real voice conversation (lib/audio/sound.ts's
 * `speak` is the "talk" half). Chrome/Edge/Safari ship this under a
 * `webkit`-prefixed global; Firefox doesn't implement it at all, so
 * every consumer must check `isSupported` and fall back to text input
 * — never assume a microphone or this API exists.
 *
 * Mirrors the feature-detection pattern used for camera/motion
 * (useSyncExternalStore for the SSR-safe support check) and never
 * requests mic access until the caller explicitly starts listening —
 * same "permission only after an explicit user click" rule as camera.
 */

// Minimal ambient types — this API has no official TS lib entry.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const LANG_TAGS: Record<VoiceLang, string> = { en: "en-US", hi: "hi-IN" };

const noopSubscribe = () => () => {};
function getSupportSnapshot() {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
function getSupportServerSnapshot() {
  return false;
}

export function useSpeechRecognition(lang: VoiceLang) {
  const isSupported = useSyncExternalStore(noopSubscribe, getSupportSnapshot, getSupportServerSnapshot);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef<(transcript: string) => void>(() => {});

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (onFinalResult: (transcript: string) => void) => {
      if (!isSupported || listening) return;
      const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Ctor) return;

      onResultRef.current = onFinalResult;
      setError(null);

      const recognition = new Ctor();
      recognition.lang = LANG_TAGS[lang];
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onresult = (e) => {
        const result = e.results[e.results.length - 1];
        if (result?.isFinal) {
          onResultRef.current(result[0].transcript);
        }
      };
      recognition.onerror = (e) => {
        const name = (e as Event & { error?: string }).error;
        setError(
          name === "not-allowed" || name === "service-not-allowed"
            ? "Microphone access was denied — enable it in your browser's site settings."
            : name === "no-speech"
              ? "Didn't catch that — try again."
              : "Voice input isn't available right now.",
        );
      };
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    },
    [isSupported, listening, lang],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { isSupported, listening, error, start, stop };
}
