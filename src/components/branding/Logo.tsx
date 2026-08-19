/**
 * EMBER's brand mark — a golden emblem in the spirit of an epic-legend
 * seal (an ascending flame over a sunburst, ringed like an old coin or
 * temple medallion), plus a matching gold-gradient wordmark. Fully
 * vector (no external font/image asset), so it's crisp at any size and
 * themeable from one place. Kept intentionally symbolic rather than a
 * literal illustration — the "wow" is in the seal-like craftsmanship,
 * not a mascot.
 */

const GOLD_LIGHT = "#fff3c4";
const GOLD_MID = "#ffc531"; // matches --accent, the app's existing XP/reward gold
const GOLD_DEEP = "#a9660b";

// Math.cos/Math.sin can differ in their last floating-point digit between
// Node's SSR pass and the browser's V8 (different builds, same spec) —
// rendered straight into JSX that comes out to e.g. "14.817583288938657"
// server-side vs "...664" client-side, which React's hydration diff flags
// as a mismatch even though it's visually identical. Rounding to 3
// decimal places is well below anything visible at this icon size and
// makes both sides produce the exact same string.
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function LogoMark({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const gradId = "ember-gold";
  const softId = "ember-gold-soft";
  const bgId = "ember-mark-bg";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="EMBER"
    >
      <defs>
        <radialGradient id={bgId} cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#2a1806" />
          <stop offset="100%" stopColor="#0c0602" />
        </radialGradient>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={GOLD_LIGHT} />
          <stop offset="45%" stopColor={GOLD_MID} />
          <stop offset="100%" stopColor={GOLD_DEEP} />
        </linearGradient>
        <linearGradient id={softId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={GOLD_LIGHT} stopOpacity="0.95" />
          <stop offset="100%" stopColor={GOLD_MID} stopOpacity="0" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="48" fill={`url(#${bgId})`} stroke={`url(#${gradId})`} strokeWidth="2" />
      <circle cx="50" cy="50" r="41.5" fill="none" stroke={`url(#${gradId})`} strokeWidth="0.75" opacity="0.55" />

      {/* Engraved tick marks — the "old seal / coin" detail. */}
      {Array.from({ length: 28 }).map((_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const x1 = round(50 + Math.cos(angle) * 45);
        const y1 = round(50 + Math.sin(angle) * 45);
        const x2 = round(50 + Math.cos(angle) * 41.5);
        const y2 = round(50 + Math.sin(angle) * 41.5);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={`url(#${gradId})`}
            strokeWidth="0.8"
            opacity="0.45"
          />
        );
      })}

      {/* Sunburst rays behind the flame. */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const x1 = round(50 + Math.cos(angle) * 15);
        const y1 = round(50 + Math.sin(angle) * 15);
        const x2 = round(50 + Math.cos(angle) * 32);
        const y2 = round(50 + Math.sin(angle) * 32);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={`url(#${gradId})`}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        );
      })}

      {/* The ascending flame — literal reading of "EMBER" — fire, rising. */}
      <path
        d="M50 18 C55 29 64 38 61 51 C59.5 59 53.5 63.5 50 70 C46.5 63.5 40.5 59 39 51 C36 38 45 29 50 18 Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M50 25 C53 31.5 57.5 36.5 56 45 C55 50 52.5 53.5 50 58 C47.5 53.5 45 50 44 45 C42.5 36.5 47 31.5 50 25 Z"
        fill={`url(#${softId})`}
      />

      {/* Base flourish — an arc like a drawn bow, closing the seal. */}
      <path
        d="M27 66 Q50 79 73 66"
        stroke={`url(#${gradId})`}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="50" cy="75" r="2.1" fill={`url(#${gradId})`} />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <div className={`inline-flex flex-col items-center ${className ?? ""}`}>
      <span
        className="font-display text-4xl font-black tracking-[0.18em] sm:text-5xl"
        style={{
          backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD_MID} 45%, ${GOLD_DEEP} 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(0 2px 10px rgba(255, 197, 49, 0.35))",
        }}
      >
        EMBER
      </span>
      <span
        aria-hidden="true"
        className="mt-1.5 h-px w-28 sm:w-36"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD_MID}, transparent)`,
        }}
      />
    </div>
  );
}

export function Logo({
  size = 72,
  className,
  tagline,
}: {
  size?: number;
  className?: string;
  tagline?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ""}`}>
      <LogoMark size={size} />
      <LogoWordmark />
      {tagline && (
        <p className="text-[0.65rem] uppercase tracking-[0.35em] text-muted">{tagline}</p>
      )}
    </div>
  );
}
