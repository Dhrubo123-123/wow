"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

export interface BottomNavigationProps {
  items: NavItem[];
}

/**
 * Fixed bottom tab bar for the mobile-first shell. Height + safe-area
 * padding keep it clear of iOS home-indicator / Android gesture bar.
 */
export function BottomNavigation({ items }: BottomNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted hover:text-foreground",
                )}
              >
                {item.icon({ className: "h-5 w-5" })}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
