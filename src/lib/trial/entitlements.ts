/**
 * Roadmap item T — trial-mode entitlement facts. Pure and testable
 * (no Date.now() inside — `now` is always passed in), same split as
 * streakLogic.ts. Tracking only: nothing here gates functionality, it
 * just answers "how much trial is left" for the settings banner.
 */

export type Plan = "trial" | "full";

export interface TrialStatus {
  plan: Plan;
  /** Whole days remaining, floored at 0. Meaningless (but harmless) once plan is "full". */
  daysRemaining: number;
  isExpired: boolean;
}

export function getTrialStatus(plan: Plan, trialEndsAt: string, now: Date): TrialStatus {
  const msRemaining = new Date(trialEndsAt).getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  return {
    plan,
    daysRemaining,
    isExpired: plan === "trial" && msRemaining <= 0,
  };
}
