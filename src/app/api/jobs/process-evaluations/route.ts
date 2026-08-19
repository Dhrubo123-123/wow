import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQuestEvaluation } from "@/lib/quests";
import { isOrgBudgetNearlyExhausted } from "@/lib/ai/budget";
import { logError } from "@/lib/observability/logger";

const TEXT_MODEL = "openai/gpt-oss-120b" as const;

// A quest attempt this old and still "submitted" is either genuinely
// stuck in the graceful-degradation queue (roadmap item A) or the
// client's synchronous evaluate call never fired/failed silently —
// either way, this sweep is the safety net for both. 90s is well past
// any normal synchronous evaluate call's duration, so it never races
// a legitimate in-flight request.
const STALE_AFTER_MS = 90_000;
// Keep each run small and budget-aware — this is a background sweep,
// not a burst; it re-checks org budget before every single item and
// stops the moment it's tight, leaving the rest for the next run.
const BATCH_SIZE = 10;

/**
 * Vercel Cron (vercel.json, every 10 min) → roadmap item A3. This is
 * what makes the evaluate route's "graceful degradation" a genuine
 * deferred retry instead of just an honest-sounding promise: anything
 * left sitting in `submitted` past the grace window gets a real
 * evaluation attempt here, XP and all.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data: staleAttempts, error } = await admin
    .from("quest_attempts")
    .select("quest_id, user_id, submitted_at")
    .eq("status", "submitted")
    .lt("submitted_at", cutoff)
    .order("submitted_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    logError("db", error, { scope: "process-evaluations" });
    return NextResponse.json({ error: "Failed to query stale evaluations." }, { status: 500 });
  }

  const results = { processed: 0, skippedBudget: 0, failed: 0, total: staleAttempts?.length ?? 0 };

  for (const attempt of staleAttempts ?? []) {
    // Re-check org budget before EVERY item, not just once at the top
    // of the run — if the org crosses the threshold mid-sweep, stop
    // spending immediately rather than finishing the batch regardless.
    const orgNearLimit = await isOrgBudgetNearlyExhausted(admin, TEXT_MODEL);
    if (orgNearLimit) {
      results.skippedBudget += 1;
      continue;
    }

    try {
      // Re-verify the quest is still actually "submitted" — another
      // request could have picked it up between the query above and
      // now (a real user retrying manually, most likely).
      const { data: quest } = await admin
        .from("quests")
        .select("status")
        .eq("id", attempt.quest_id)
        .single();
      if (quest?.status !== "submitted") continue;

      await runQuestEvaluation(admin, attempt.quest_id, attempt.user_id);
      results.processed += 1;
    } catch (err) {
      logError("ai_evaluation", err, { scope: "process-evaluations", questId: attempt.quest_id });
      results.failed += 1;
    }
  }

  return NextResponse.json(results);
}
