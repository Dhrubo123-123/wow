import type {
  Database,
  QuestStatus,
  QuestAttemptStatus,
  EvidenceType,
} from "@/lib/supabase/types";

export type { QuestStatus, QuestAttemptStatus, EvidenceType };

export type Quest = Database["public"]["Tables"]["quests"]["Row"];
export type QuestInsert = Database["public"]["Tables"]["quests"]["Insert"];
export type QuestAttempt = Database["public"]["Tables"]["quest_attempts"]["Row"];
export type QuestEvidence = Database["public"]["Tables"]["quest_evidence"]["Row"];

/** 1 (trivial) through 5 (very hard) — matches the DB check constraint. */
export type QuestDifficulty = 1 | 2 | 3 | 4 | 5;

export const QUEST_DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  1: "Trivial",
  2: "Easy",
  3: "Moderate",
  4: "Hard",
  5: "Very Hard",
};

export function isQuestDifficulty(value: number): value is QuestDifficulty {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * The generated-quest shape the AI provider must return (Phase 6/14),
 * validated with Zod before it's ever trusted or stored — see
 * lib/ai/schemas.ts. Kept here so the quest domain model and the AI
 * contract can't silently drift apart.
 */
export interface QuestGenerationInput {
  title: string;
  description: string;
  objective: string;
  difficulty: QuestDifficulty;
  estimated_minutes: number;
  skill_key?: string;
  xp_reward: number;
  evidence_required: boolean;
  evidence_type: EvidenceType | null;
  success_criteria: string[];
  instructions: string[];
}
