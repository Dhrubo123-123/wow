"use client";

/**
 * Generative sound effects for celebratory moments (Phase 15 level-up,
 * Phase 17 achievements) — no licensed music or voice assets, since
 * neither can be sourced here. Everything is synthesized in real time
 * with the Web Audio API and the browser's built-in speech synthesis,
 * and every function takes an explicit `enabled` flag: the brief
 * requires sound to be opt-in ("sound only if user enables sound"),
 * never on by default.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, gain = 0.15) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** Short ascending three-note chime — achievement unlock. */
export function playChime(enabled: boolean) {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => tone(ctx, freq, now + i * 0.09, 0.35));
}

/** Bigger ascending major-chord fanfare — level up. */
export function playFanfare(enabled: boolean) {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => tone(ctx, freq, now + i * 0.07, 0.5, 0.18));
  // A final sustained chord for warmth.
  [523.25, 659.25, 783.99].forEach((freq) => tone(ctx, freq, now + 0.32, 0.9, 0.1));
}

/** Quick noise-burst "clap" — used alongside confetti bursts. */
export function playClap(enabled: boolean) {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
}

/**
 * Speaks a short encouraging line via the browser's built-in TTS —
 * the "guided voice" moments. Cancels any in-flight utterance first so
 * rapid events don't queue up and talk over each other.
 */
export function speak(text: string, enabled: boolean) {
  if (!enabled) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1.05;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

/** Vibrates on supported devices — never fatal if unsupported. */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called outside a user gesture — fine to ignore.
  }
}
