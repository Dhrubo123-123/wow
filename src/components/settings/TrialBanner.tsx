"use client";

import { useEffect } from "react";
import { Badge, Card, CardContent, CardDescription, CardTitle } from "@/components/ui";
import { track } from "@/lib/events/track";
import { EVENT } from "@/lib/events/names";
import type { TrialStatus } from "@/lib/trial/entitlements";

/**
 * Roadmap item T — tracking-only trial banner. Shown regardless of
 * days remaining (even at 0) since nothing here actually restricts
 * access yet; it's an honest status readout, not a paywall gate.
 */
export function TrialBanner({ status }: { status: TrialStatus }) {
  useEffect(() => {
    if (status.plan === "trial") track(EVENT.PAYWALL_SHOWN, { daysRemaining: status.daysRemaining });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, not on every status object identity change
  }, []);

  if (status.plan === "full") return null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Trial access</CardTitle>
          <CardDescription>
            {status.isExpired
              ? "Your trial has ended — you still have full access for now."
              : `${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"} left on your trial.`}
          </CardDescription>
        </div>
        <Badge
          variant={status.isExpired ? "warning" : "default"}
          onClick={() => track(EVENT.PAYWALL_CLICKED, { daysRemaining: status.daysRemaining })}
        >
          Trial
        </Badge>
      </CardContent>
    </Card>
  );
}
