import Image from "next/image";
import { cn } from "@/lib/utils/cn";

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  levelBadge?: number;
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Falls back to initials when no image is set, since profile.avatar_url
 * is optional at signup (Phase 2/3).
 */
export function Avatar({ src, name, size = 40, className, levelBadge }: AvatarProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={`${size}px`}
          className="rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary"
          aria-label={name}
        >
          {initialsFrom(name)}
        </span>
      )}
      {typeof levelBadge === "number" && (
        <span
          className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-accent px-1 text-[10px] font-bold text-accent-foreground"
          aria-label={`Level ${levelBadge}`}
        >
          {levelBadge}
        </span>
      )}
    </span>
  );
}
