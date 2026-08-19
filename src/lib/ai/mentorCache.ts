import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** Lowercased, trimmed, whitespace-collapsed — deliberately crude so
 *  near-duplicate phrasings of the same common question still hit the
 *  same cache row (roadmap item A: "cache top FAQ mentor answers by
 *  normalized string"). Punctuation is stripped too since "what should
 *  i do today?" and "what should i do today" are the same question. */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export async function getCachedMentorAnswer(
  admin: SupabaseClient<Database>,
  question: string,
): Promise<string | null> {
  const normalized = normalizeQuestion(question);
  const { data } = await admin
    .from("mentor_faq_cache")
    .select("id, answer, hit_count")
    .eq("normalized_question", normalized)
    .maybeSingle();

  if (!data) return null;

  // Best-effort hit-count bump — never block the actual answer on this.
  void admin
    .from("mentor_faq_cache")
    .update({ hit_count: data.hit_count + 1, updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return data.answer;
}

export async function cacheMentorAnswer(
  admin: SupabaseClient<Database>,
  question: string,
  answer: string,
): Promise<void> {
  const normalized = normalizeQuestion(question);
  // Only worth caching genuinely generic questions — a question
  // referencing personal context (their actual goal/quest history)
  // would give a stale or wrong-sounding cached answer to the next
  // person who asks something superficially similar. Heuristic: only
  // cache short, generic-sounding questions (no quoted specifics).
  if (normalized.length > 80) return;
  await admin
    .from("mentor_faq_cache")
    .upsert({ normalized_question: normalized, answer }, { onConflict: "normalized_question" });
}
