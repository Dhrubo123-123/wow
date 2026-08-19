import { cn } from "@/lib/utils/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  label?: string;
  showValue?: boolean;
}

/**
 * Generic progress bar used for XP bars, quest timers, and skill mastery.
 * Consumers pass raw value/max; this component never computes XP/level
 * logic itself (see lib/progression in Phase 4).
 */
export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName,
  label,
  showValue,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          {label && <span>{label}</span>}
          {showValue && (
            <span>
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={cn(
            "bg-gradient-accent relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out",
            // A static bar with no fill reads as "broken", not "empty" —
            // skip the shimmer sweep entirely rather than run it over nothing.
            pct > 0 && "animate-shimmer",
            barClassName,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
