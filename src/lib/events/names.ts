/**
 * The full event vocabulary (retention roadmap §0) — keep this in sync
 * with the comment atop supabase/migrations/0007_events_and_metrics.sql.
 * Centralizing names as a const object (not raw strings scattered
 * through the app) is what makes /admin/metrics queries and any future
 * funnel analysis reliable — a typo'd event name is a silent data-loss
 * bug that's expensive to notice.
 */
export const EVENT = {
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
  FIRST_QUEST_ACCEPTED: "first_quest_accepted",
  EVIDENCE_SUBMITTED: "evidence_submitted",
  EVALUATION_RETURNED: "evaluation_returned",
  STREAK_EXTENDED: "streak_extended",
  FREEZE_CONSUMED: "freeze_consumed",
  EARNBACK_STARTED: "earnback_started",
  EARNBACK_SUCCEEDED: "earnback_succeeded",
  EARNBACK_EXPIRED: "earnback_expired",
  // AI-budget protection (roadmap item A) — one call, one event, from
  // every Groq request routed through lib/ai/gateway.ts.
  AI_CALL_LOGGED: "ai_call_logged",
  PAYWALL_SHOWN: "paywall_shown",
  PAYWALL_CLICKED: "paywall_clicked",
  PAYMENT_CAPTURED: "payment_captured",
  // Not wired up yet — reserved for retention roadmap §7 (social layer).
  PARTY_INVITED: "party_invited",
  PARTY_JOINED: "party_joined",
  KUDOS_GIVEN: "kudos_given",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];
