import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardXP, updateSkillXP, updateStreak, unlockAchievement } from "@/lib/progression";
import { evidenceMeetsStarterBar, STARTER_QUEST_XP } from "@/lib/onboarding/starterQuests";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { logError } from "@/lib/observability/logger";

const RequestSchema = z.object({
  questId: z.string().uuid(),
  evidenceType: z.enum(["image", "text"]),
  content: z.string().max(2000).optional(),
  storagePath: z.string().max(500).optional(),
});

/**
 * Roadmap item 2 — deterministic (not AI-judged) completion of the
 * day-one starter quest. Intentional: the very first evaluation a
 * brand-new user ever sees should never be an AI rejecting their
 * effort — the bar (evidenceMeetsStarterBar) is "did something real
 * happen", not quality. Real AI evaluation starts on quest 2, once the
 * account already has a genuine win banked.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId: string = user.id; // captured once — TS can't narrow `user` across the `grant()` closure below

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("starter_quest_completed_at")
    .eq("id", userId)
    .maybeSingle();

  // "1 starter eval per anon session" — the hard gate.
  if (profile?.starter_quest_completed_at) {
    return NextResponse.json({ error: "You've already completed your starter quest." }, { status: 409 });
  }

  const { data: quest, error: questError } = await admin
    .from("quests")
    .select("id, xp_reward, skill_id")
    .eq("id", parsed.data.questId)
    .eq("user_id", userId)
    .single();

  if (questError || !quest) {
    return NextResponse.json({ error: "Starter quest not found." }, { status: 404 });
  }

  if (!evidenceMeetsStarterBar(parsed.data.evidenceType, parsed.data.content ?? null)) {
    return NextResponse.json(
      { error: parsed.data.evidenceType === "text" ? "Just a sentence is enough — try again." : "Please attach a photo." },
      { status: 400 },
    );
  }

  const { data: attempt } = await admin
    .from("quest_attempts")
    .select("id")
    .eq("quest_id", quest.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    if (attempt) {
      await admin.from("quest_evidence").insert({
        quest_attempt_id: attempt.id,
        user_id: userId,
        evidence_type: parsed.data.evidenceType,
        content: parsed.data.content ?? null,
        storage_path: parsed.data.storagePath ?? null,
        mime_type: parsed.data.evidenceType === "image" ? "image/jpeg" : null,
      });
      await admin
        .from("quest_attempts")
        .update({ status: "completed", submitted_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("id", attempt.id);
    }

    await admin.from("quests").update({ status: "completed" }).eq("id", quest.id);

    const clampedXp = Math.min(STARTER_QUEST_XP, quest.xp_reward);
    const xpResult = await awardXP(admin, {
      userId: userId,
      amount: clampedXp,
      sourceType: "quest_evaluation",
      sourceId: quest.id,
      skillId: quest.skill_id ?? undefined,
    });

    if (quest.skill_id) {
      await updateSkillXP(admin, { userId: userId, skillId: quest.skill_id, amount: 50 });
    }

    const streak = await updateStreak(admin, userId);

    const newAchievements: { key: string; name: string; description: string | null }[] = [];
    async function grant(key: string) {
      const { data: achievement } = await admin
        .from("achievements")
        .select("id, name, description")
        .eq("key", key)
        .maybeSingle();
      const result = await unlockAchievement(admin, { userId: userId, achievementKey: key });
      if (result.granted && achievement) {
        newAchievements.push({ key, name: achievement.name, description: achievement.description });
      }
    }
    await grant("FIRST_QUEST");
    await grant("FIRST_WIN");
    await grant("FIRST_EMBER");

    await admin
      .from("profiles")
      .update({ starter_quest_completed_at: new Date().toISOString() })
      .eq("id", userId);

    await logEvent(admin, userId, EVENT.EVALUATION_RETURNED, {
      questId: quest.id,
      passed: true,
      score: 100,
      xpAwarded: clampedXp,
      tier: null as "bronze" | "silver" | "gold" | null,
      starter: true,
    });

    return NextResponse.json({
      passed: true,
      xpAwarded: clampedXp,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      streak,
      newAchievements,
    });
  } catch (err) {
    logError("db", err, { scope: "onboarding-complete-starter", userId: userId, questId: quest.id });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
