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

export type VoiceLang = "en" | "hi";

const LANG_TAGS: Record<VoiceLang, string> = { en: "en-US", hi: "hi-IN" };

let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const list = window.speechSynthesis.getVoices();
  if (list.length) cachedVoices = list;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  refreshVoices();
  // Most browsers load voices asynchronously on first access.
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

/**
 * Picks the best available system voice for a language — prefers a
 * local (on-device) voice for lower latency, falls back to any voice
 * whose lang tag matches, then to the browser default so speech still
 * happens (just in the wrong accent) rather than silently failing when
 * e.g. no Hindi voice is installed on this device.
 */
function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | null {
  refreshVoices();
  const tag = LANG_TAGS[lang];
  const prefix = tag.split("-")[0];
  const matches = cachedVoices.filter((v) => v.lang?.toLowerCase().startsWith(prefix));
  return matches.find((v) => v.localService) ?? matches[0] ?? null;
}

/**
 * Speaks a short encouraging line via the browser's built-in TTS —
 * the "guided voice" moments. Cancels any in-flight utterance first so
 * rapid events don't queue up and talk over each other. Supports both
 * English and Hindi narration; falls back to whatever voice the browser
 * has if the requested language isn't installed on this device rather
 * than staying silent.
 */
export function speak(text: string, enabled: boolean, lang: VoiceLang = "en") {
  if (!enabled) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = LANG_TAGS[lang];
  // Slower than the default (1.0) on purpose — a guide reading each
  // step a little unhurried reads as "patient", not "sluggish", the
  // same way a good narrator paces themselves below conversational speed.
  utterance.rate = 0.88;
  utterance.pitch = 1.05;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

/** Camera shutter click — a bright transient tick, not a noise burst. */
export function playShutter(enabled: boolean) {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 1800, now, 0.045, 0.12);
  tone(ctx, 900, now + 0.02, 0.06, 0.08);
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
