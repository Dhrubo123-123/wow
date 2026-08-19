import type { QuestStatus, QuestAttemptStatus } from "./types";

/**
 * Quest lifecycle (Phase 5 of the brief):
 *
 *   available -> accepted -> in_progress -> submitted -> under_review -> completed / failed
 *
 * This is the single source of truth for legal transitions — both the
 * DB's RLS check constraint (supabase/migrations/0001_init.sql,
 * `quests_update_own_lifecycle`) and any UI/server code should agree
 * with this graph. If they ever diverge, this file is wrong or the
 * migration is; keep them in sync by hand until Phase 23 adds a test
 * that reads the migration and asserts against this table.
 */
const QUEST_TRANSITIONS: Record<QuestStatus, QuestStatus[]> = {
  available: ["accepted"],
  accepted: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["under_review"],
  under_review: ["completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
};

/** Statuses a user is allowed to set directly (RLS-enforced server-side too). */
export const USER_SETTABLE_QUEST_STATUSES: QuestStatus[] = [
  "accepted",
  "in_progress",
  "submitted",
];

export function canTransitionQuest(from: QuestStatus, to: QuestStatus): boolean {
  return QUEST_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalQuestStatus(status: QuestStatus): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}

const QUEST_ATTEMPT_TRANSITIONS: Record<QuestAttemptStatus, QuestAttemptStatus[]> = {
  in_progress: ["submitted"],
  submitted: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionQuestAttempt(
  from: QuestAttemptStatus,
  to: QuestAttemptStatus,
): boolean {
  return QUEST_ATTEMPT_TRANSITIONS[from]?.includes(to) ?? false;
}
