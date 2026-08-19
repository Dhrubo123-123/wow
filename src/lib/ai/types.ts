import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  QuestGeneration,
  AIEvaluation,
  GoalPlan,
  DifficultyAdjustment,
} from "./schemas";

/**
 * Optional per-call context for gateway logging (roadmap item A) — who
 * the call is for and which admin client to log the `ai_call_logged`
 * event with. Optional everywhere: callers that don't pass it (tests,
 * MockAIProvider, cache-warming) just don't get a logged event, they
 * don't break.
 */
export interface AICallContext {
  userId?: string | null;
  admin?: SupabaseClient<Database> | null;
}

export interface GenerateQuestInput {
  goalTitle: string;
  primaryObjective: string | null;
  occupation: string | null;
  skillLevel: number;
  recentQuestTitles: string[];
  /** Culinary mode context (ARCHITECTURE.md §7), optional — only present
   *  once that vertical exists (Phase 5+ follow-up, not yet built). */
  domain?: "general" | "culinary";
}

export interface EvaluateQuestInput {
  questTitle: string;
  questObjective: string;
  successCriteria: string[];
  evidenceType: string;
  evidenceSummary: string;
  goalTitle: string;
}

export interface GenerateGoalPlanInput {
  goalTitle: string;
  targetDays: number | null;
  skillLevel: number;
  occupation: string | null;
}

export interface MentorContext {
  name: string;
  level: number;
  xp: number;
  currentGoalTitle: string | null;
  recentQuestTitles: string[];
  recentFailureTitles: string[];
  recentAchievementNames: string[];
  question: string;
}

export interface AdjustDifficultyInput {
  currentDifficulty: number;
  recentScoreAvg: number;
  recentPassRate: number;
}

/**
 * Provider abstraction (brief §13) so the AI backend can be swapped
 * without touching call sites. All methods return already-validated,
 * already-typed data — a provider implementation is responsible for
 * retry-then-controlled-error on invalid model output; callers never see
 * raw/untrusted JSON.
 */
export interface AIProvider {
  generateQuest(input: GenerateQuestInput, ctx?: AICallContext): Promise<QuestGeneration>;
  evaluateQuest(input: EvaluateQuestInput, ctx?: AICallContext): Promise<AIEvaluation>;
  generateGoalPlan(input: GenerateGoalPlanInput, ctx?: AICallContext): Promise<GoalPlan>;
  generateMentorResponse(input: MentorContext, ctx?: AICallContext): Promise<string>;
  adjustDifficulty(input: AdjustDifficultyInput, ctx?: AICallContext): Promise<DifficultyAdjustment>;
}

/** Thrown after a schema-validated retry still fails — a controlled,
 *  user-safe error per Phase 24 ("THE GAME MASTER IS TEMPORARILY
 *  UNAVAILABLE"), never a raw parse error. */
export class AIProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
  }
}
