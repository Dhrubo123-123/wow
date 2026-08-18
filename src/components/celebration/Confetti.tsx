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

interface FireworkParticle {
  id: number;
  originX: number; // vw
  originY: number; // vh
  angle: number; // rad
  distance: number; // px
  delay: number; // s
  duration: number; // s
  color: string;
  size: number; // px
}

const COLORS = ["#6d5bff", "#22d3ee", "#ffc531", "#2ee6a6", "#ff8a3d"];
const FIREWORK_COLORS = ["#ffc531", "#ff8a3d", "#22d3ee", "#6d5bff", "#ffffff", "#2ee6a6"];

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

// A handful of launch origins spread across the upper screen, each
// spawning a radial ring of particles — reads as actual fireworks
// rather than a single static burst.
function makeFireworks(burstCount: number, particlesPerBurst: number): FireworkParticle[] {
  const origins = Array.from({ length: burstCount }, () => ({
    x: 15 + Math.random() * 70,
    y: 20 + Math.random() * 35,
  }));

  return origins.flatMap((origin, burstIndex) =>
    Array.from({ length: particlesPerBurst }, (_, i) => {
      const angle = (i / particlesPerBurst) * Math.PI * 2 + Math.random() * 0.3;
      return {
        id: burstIndex * particlesPerBurst + i,
        originX: origin.x,
        originY: origin.y,
        angle,
        distance: 60 + Math.random() * 90,
        delay: burstIndex * 0.35 + Math.random() * 0.1,
        duration: 0.9 + Math.random() * 0.5,
        color: FIREWORK_COLORS[(burstIndex * particlesPerBurst + i) % FIREWORK_COLORS.length]!,
        size: 4 + Math.random() * 5,
      };
    }),
  );
}

/**
 * Pure CSS/JS confetti / fireworks burst — no external assets or
 * libraries. Skips entirely under `prefers-reduced-motion` (brief §15:
 * "Respect reduced-motion settings"), rather than just slowing down.
 *
 * `variant="fireworks"` is the bigger "wow" moment reserved for level-up
 * — multiple radial bursts instead of a single falling shower.
 */
export function Confetti({
  count = 60,
  variant = "confetti",
}: {
  count?: number;
  variant?: "confetti" | "fireworks";
}) {
  const [particles] = useState(() => makeParticles(count));
  const [fireworks] = useState(() => makeFireworks(4, 16));
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  if (reducedMotion) return null;

  if (variant === "fireworks") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
        {fireworks.map((p) => (
          <span
            key={p.id}
            className="animate-firework absolute rounded-full"
            style={
              {
                left: `${p.originX}vw`,
                top: `${p.originY}vh`,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 6px 1px ${p.color}`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                "--fx": `${Math.cos(p.angle) * p.distance}px`,
                "--fy": `${Math.sin(p.angle) * p.distance}px`,
              } as React.CSSProperties
            }
          />
        ))}
        {particles.slice(0, 30).map((p) => (
          <span
            key={`fall-${p.id}`}
            className="absolute top-[-10px] rounded-sm animate-confetti-fall"
            style={{
              left: `${p.left}vw`,
              width: p.size,
              height: p.size * 0.4,
              backgroundColor: p.color,
              animationDelay: `${0.6 + p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        ))}
      </div>
    );
  }

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
