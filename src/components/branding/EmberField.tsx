/**
 * The app's signature ambient background layer — small glowing embers
 * drifting upward from the bottom of the screen, forever. This is what
 * was actually missing from every logged-in page: the landing page had
 * a nice ambient glow (defined on `body`), but AppShell's own opaque
 * background was painting over it everywhere else, so the whole app
 * past login read as flat and static. Mounted once in the root layout
 * so it's behind every page, including the ones AppShell doesn't wrap.
 *
 * Particle positions are deterministic (index-based integer math, not
 * Math.random()) — this is a Server Component rendered during SSR, and
 * anything randomized per-render would cause the exact hydration
 * mismatch the logo emblem hit earlier (see components/branding/Logo.tsx).
 */

const PARTICLE_COUNT = 20;

const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  left: (i * 41 + 7) % 100, // spread 0-99, deliberately non-uniform stride
  size: 2 + (i % 4), // 2-5px
  duration: 10 + (i % 7), // 10-16s
  delay: (i * 1.7) % 14,
  drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 4), // px sideways sway
}));

export function EmberField() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="animate-ember-rise absolute bottom-0 rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: "radial-gradient(circle, #fff3c4 0%, #ffc531 55%, transparent 100%)",
            boxShadow: "0 0 6px 1px rgba(255, 197, 49, 0.55)",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            // @ts-expect-error -- custom property consumed by the ember-rise keyframes
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
