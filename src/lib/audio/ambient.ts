"use client";

/**
 * Generative "magical" ambient background music — no licensed track can
 * be sourced here, so this synthesizes an evolving pad + slow pentatonic
 * arpeggio in real time with the Web Audio API, run through a small
 * algorithmic reverb. Entirely opt-in (brief's "sound only if user
 * enables sound" pattern, mirrored here as its own separate toggle from
 * SFX) and safe to start/stop repeatedly — everything is idempotent and
 * cleans itself up.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let reverbSend: GainNode | null = null;
let padNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let filterNode: BiquadFilterNode | null = null;
let lfo: OscillatorNode | null = null;
let arpTimer: ReturnType<typeof setTimeout> | null = null;
let playing = false;

// A calm pentatonic scale (A minor pentatonic, a couple of octaves) —
// any combination of these notes sounds consonant together, which is
// what makes a *random* arpeggio still feel intentional and "magical"
// rather than random.
const PENTATONIC = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
// The pad chord underneath — A minor add9, spread across octaves.
const PAD_CHORD = [110.0, 164.81, 220.0, 261.63, 329.63];

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Small feedback-delay-network reverb — no impulse response file needed. */
function buildReverb(audioCtx: AudioContext, destination: AudioNode) {
  const send = audioCtx.createGain();
  send.gain.value = 0.5;
  [0.31, 0.42, 0.53].forEach((delayTime) => {
    const delay = audioCtx.createDelay(1.5);
    delay.delayTime.value = delayTime;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.42;
    const damp = audioCtx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2000;
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(destination);
  });
  return send;
}

function startPad(audioCtx: AudioContext) {
  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.frequency.value = 900;
  filterNode.Q.value = 0.6;
  filterNode.connect(masterGain!);

  // A slow LFO breathing the filter cutoff — the "shimmer" that keeps a
  // static pad from feeling frozen.
  lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain);
  lfoGain.connect(filterNode.frequency);
  lfo.start();

  padNodes = PAD_CHORD.map((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 6; // subtle detune = warmth
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(filterNode!);
    osc.start();
    // Fade each voice in independently and staggered for a "blooming" entrance.
    const now = audioCtx.currentTime;
    gain.gain.linearRampToValueAtTime(0.045, now + 2 + i * 0.6);
    return { osc, gain };
  });
}

function scheduleArpeggio(audioCtx: AudioContext) {
  if (!playing) return;
  const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]!;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

  const panner = audioCtx.createStereoPanner
    ? audioCtx.createStereoPanner()
    : null;
  if (panner) panner.pan.value = Math.random() * 1.4 - 0.7;

  osc.connect(gain);
  if (panner) {
    gain.connect(panner);
    panner.connect(masterGain!);
    panner.connect(reverbSend!);
  } else {
    gain.connect(masterGain!);
    gain.connect(reverbSend!);
  }
  osc.start(now);
  osc.stop(now + 2.3);

  arpTimer = setTimeout(() => scheduleArpeggio(audioCtx), 900 + Math.random() * 1400);
}

/** Starts the ambient loop. Safe to call repeatedly — no-ops if already playing. */
export function startAmbientMusic() {
  if (playing) return;
  const audioCtx = getCtx();
  if (!audioCtx) return;
  playing = true;

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  const reverbOut = audioCtx.createGain();
  reverbOut.gain.value = 0.35;
  reverbOut.connect(audioCtx.destination);
  reverbSend = buildReverb(audioCtx, reverbOut);

  // Fade the whole ambience in gently rather than snapping to volume —
  // an abrupt start would undercut the "magical" feel this exists for.
  masterGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 2.5);

  startPad(audioCtx);
  scheduleArpeggio(audioCtx);
}

/** Stops and fully tears down the ambient loop. Safe to call when already stopped. */
export function stopAmbientMusic() {
  if (!playing) return;
  playing = false;

  if (arpTimer) {
    clearTimeout(arpTimer);
    arpTimer = null;
  }

  const audioCtx = ctx;
  if (audioCtx && masterGain) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
  }

  const nodesToStop = [...padNodes.map((p) => p.osc), lfo].filter(
    (n): n is OscillatorNode => !!n,
  );
  setTimeout(() => {
    nodesToStop.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // Already stopped — fine.
      }
    });
  }, 1300);

  padNodes = [];
  filterNode = null;
  lfo = null;
  masterGain = null;
  reverbSend = null;
}

export function isAmbientPlaying() {
  return playing;
}
