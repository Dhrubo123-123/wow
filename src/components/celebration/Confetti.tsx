"use client";

import { useState, useSyncExternalStore } from "react";

interface Particle {
  id: number;
  left: number; // vw
  delay: number; // s
  duration: number; // s
  rotation: number; // deg
  color: string;
  size: number; // px
}

const COLORS = ["#6d5bff", "#22d3ee", "#ffc531", "#2ee6a6", "#ff8a3d"];

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 1.6 + Math.random() * 1.2,
    rotation: Math.random() * 360,
    color: COLORS[id % COLORS.length]!,
    size: 6 + Math.random() * 6,
  }));
}

/**
 * Pure CSS/JS confetti burst — no external assets or libraries. Skips
 * entirely under `prefers-reduced-motion` (brief §15: "Respect
 * reduced-motion settings"), rather than just slowing down.
 */
function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReducedMotionServerSnapshot() {
  return true; // safest default until we know the client's preference
}

export function Confetti({ count = 60 }: { count?: number }) {
  const [particles] = useState(() => makeParticles(count));
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10px] rounded-sm animate-confetti-fall"
          style={{
            left: `${p.left}vw`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}
