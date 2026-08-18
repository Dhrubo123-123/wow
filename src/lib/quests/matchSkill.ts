import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Maps the AI's free-text `skill` field (e.g. "Running", "Strength") to
 * a real row in the `skills` config table (Phase 16), so quests actually
 * feed the skill tree instead of leaving skill_id permanently null. A
 * case-insensitive substring match against name/key is deliberately
 * loose — the AI won't reliably reproduce our exact skill names, and a
 * missed match (falls through to `null`) is harmless, just an
 * unattributed quest, not an error.
 */
export async function matchSkillId(
  admin: SupabaseClient<Database>,
  aiSkillName: string,
): Promise<string | null> {
  const { data: skills } = await admin.from("skills").select("id, key, name");
  if (!skills || skills.length === 0) return null;

  const needle = aiSkillName.trim().toLowerCase();
  const exact = skills.find(
    (s) => s.name.toLowerCase() === needle || s.key.toLowerCase() === needle,
  );
  if (exact) return exact.id;

  const partial = skills.find(
    (s) => needle.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(needle),
  );
  return partial?.id ?? null;
}
