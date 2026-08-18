"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ascend:install-prompt-dismissed";

// localStorage doesn't exist during SSR — read it through
// useSyncExternalStore (server snapshot: dismissed) rather than a
// render-time check, same hydration-mismatch fix as Phase 10/11/15.
const noopSubscribe = () => () => {};
function getDismissedSnapshot() {
  return localStorage.getItem(DISMISS_KEY) === "1";
}
function getDismissedServerSnapshot() {
  return true;
}

/**
 * Registers the service worker (offline shell, Phase 19) and shows a
 * custom "Install ASCEND" banner using the native `beforeinstallprompt`
 * event where the browser supports it (Chrome/Android/desktop; iOS
 * Safari never fires this — there, "Add to Home Screen" is manual via
 * the share sheet, which no web API can trigger).
 */
export function PWAProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const storedDismissed = useSyncExternalStore(
    noopSubscribe,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );
  const [dismissedOverride, setDismissedOverride] = useState(false);
  const dismissed = storedDismissed || dismissedOverride;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — the app works without offline support, it just
        // won't have the offline fallback shell.
      });
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissedOverride(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 border-t border-border bg-surface-raised p-3 shadow-lg sm:bottom-4 sm:rounded-lg sm:border">
      <p className="text-sm">Install ASCEND for the full-screen experience.</p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Button size="sm" onClick={install}>
          Install
        </Button>
      </div>
    </div>
  );
}
