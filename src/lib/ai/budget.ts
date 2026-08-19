import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { EVENT } from "@/lib/events/names";
import { GROQ_LIMITS, type GroqModel } from "./limits";

/**
 * Per-user daily AI budget (roadmap item A) — deliberately derived
 * from the existing `events` log rather than a new usage-counter
 * table: each budgeted action already logs an event
 * (evaluation_returned, ai_call_logged with purpose=mentor, etc.), so
 * "how many times today" is just a count query against data that
 * already exists. No new table, no dual-write-can-drift risk.
 *
 * Soft budget, not a hard security boundary — a race between two
 * simultaneous requests could both pass the check right at the limit.
 * Acceptable here: the existing per-route rate limits (lib/rateLimit.ts,
 * 5-10/min) already bound how fast that race could even be attempted,
 * and going 1 over budget occasionally costs nothing worse than one
 * extra Groq call.
 */
// Keys deliberately match BudgetKind's own spelling exactly (snake_case,
// not camelCase) — checkBudget indexes this object directly by `kind`,
// and a mismatched key silently returns `undefined` rather than a type
// error, which is exactly the bug this comment is here to prevent
// reintroducing (found via live testing: `0 < undefined` is `false` in
// JS, so a misspelled key here made every mentor/quest-gen budget check
// permanently report "exhausted", not "unlimited" — the failure mode
// looks like a stricter budget, not a broken one, which is why it
// wasn't obvious from the symptom alone).
export const FREE_DAILY_LIMITS = {
  quest_generations: 1,
  evaluations: 1,
  mentor_turns: 5,
} as const;

// Not daily — "1 trial session total", lifetime, until roadmap item B
// (Pro) removes the cap entirely.
export const FREE_COACH_SESSIONS_TOTAL = 1;

export type BudgetKind = "quest_generations" | "evaluations" | "mentor_turns" | "coach_sessions";

export interface BudgetStatus {
  allowed: boolean;
  used: number;
  limit: number;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Checks whether the user has budget left for `kind` today (or ever,
 * for coach_sessions). Does NOT consume/reserve anything — the actual
 * event that gets logged when the action succeeds is what "counts" it
 * for the next check, same as any other event-derived metric.
 */
export async function checkBudget(
  admin: SupabaseClient<Database>,
  userId: string,
  kind: BudgetKind,
): Promise<BudgetStatus> {
  if (kind === "coach_sessions") {
    // Sessions, not frames — a session is many frames (up to 20, one
    // roughly every 45s). Only the frame explicitly tagged
    // sessionStart:true (see the coach route) counts toward this, or
    // "1 trial session" would really mean "1 frame".
    const { count } = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("name", EVENT.AI_CALL_LOGGED)
      .contains("props", { purpose: "coach", sessionStart: true });
    const used = count ?? 0;
    return { allowed: used < FREE_COACH_SESSIONS_TOTAL, used, limit: FREE_COACH_SESSIONS_TOTAL };
  }

  const today = todayUTC();
  const startOfDay = `${today}T00:00:00.000Z`;

  let query = admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay);

  if (kind === "evaluations") {
    query = query.eq("name", EVENT.EVALUATION_RETURNED);
  } else if (kind === "mentor_turns") {
    query = query.eq("name", EVENT.AI_CALL_LOGGED).contains("props", { purpose: "mentor" });
  } else {
    // quest_generations — counts both the onboarding goal-plan call and
    // any ai_call_logged with purpose=quest_generation (the "next
    // quest" auto-generation after an evaluation).
    query = query.eq("name", EVENT.AI_CALL_LOGGED).contains("props", { purpose: "quest_generation" });
  }

  const { count } = await query;
  const used = count ?? 0;
  const limit = FREE_DAILY_LIMITS[kind as keyof typeof FREE_DAILY_LIMITS];
  return { allowed: used < limit, used, limit };
}

const ORG_BUDGET_DEGRADE_THRESHOLD = 0.9; // ">90% daily model budget"

/**
 * The actual binding constraint, per the brief: Groq's RPD is shared
 * across the WHOLE org, not per-user (see limits.ts) — checked
 * independent of, and in addition to, any single user's own per-user
 * budget.
 *
 * Also checks TPD, not just RPD — added after this app's own
 * capacity-analysis script (scripts/load-test-ai-budget.mjs) found TPD
 * is the ACTUAL binding constraint for the vision model specifically:
 * one Live Coach session costs ~37,000 tokens (20 snapshots × ~1850
 * each), so the org can sustain only ~5 full sessions/day before
 * hitting TPD (200,000) — RPD (1000) would never be the thing that
 * stops it. Checking RPD alone would have let TPD blow past 500%+ of
 * budget while this function kept saying "fine". Whichever ceiling is
 * closer is the one that matters, so both are checked and either one
 * tripping triggers degradation.
 */
export async function isOrgBudgetNearlyExhausted(
  admin: SupabaseClient<Database>,
  model: GroqModel,
): Promise<boolean> {
  const today = todayUTC();
  const startOfDay = `${today}T00:00:00.000Z`;

  const { data, count } = await admin
    .from("events")
    .select("props", { count: "exact" })
    .eq("name", EVENT.AI_CALL_LOGGED)
    .gte("created_at", startOfDay)
    .contains("props", { model });

  const used = count ?? 0;
  const limits = GROQ_LIMITS[model];
  if (used >= limits.rpd * ORG_BUDGET_DEGRADE_THRESHOLD) return true;

  const tokensUsed = (data ?? []).reduce((sum, row) => {
    const tokens = (row.props as { tokens?: number } | null)?.tokens;
    return sum + (typeof tokens === "number" ? tokens : 0);
  }, 0);
  return tokensUsed >= limits.tpd * ORG_BUDGET_DEGRADE_THRESHOLD;
}
