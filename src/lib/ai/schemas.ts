import { z } from "zod";

/**
 * The AI JSON contracts (brief §14/§23). Every AI response is parsed
 * against one of these before it's trusted or persisted — see
 * providers/cerebras.ts's retry-once-then-controlled-error flow.
 */

export const QuestGenerationSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  objective: z.string().min(1).max(500),
  difficulty: z.number().int().min(1).max(5),
  estimated_minutes: z.number().int().min(1).max(480),
  skill: z.string().min(1).max(60),
  xp_reward: z.number().int().min(0).max(2000),
  evidence_required: z.boolean(),
  evidence_type: z.enum(["text", "image", "file", "url"]),
  success_criteria: z.array(z.string().min(1)).min(1).max(10),
  instructions: z.array(z.string().min(1)).min(1).max(20),
});
export type QuestGeneration = z.infer<typeof QuestGenerationSchema>;

export const AIEvaluationSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1)).max(10),
  improvements: z.array(z.string().min(1)).max(10),
  xp_awarded: z.number().int().min(0),
  skill_xp_awarded: z.number().int().min(0),
  next_action: z.string().min(1).max(500),
  // Roadmap item 3 — the "evaluation ceremony" names ONE concrete thing
  // the GM actually saw/read in the evidence (e.g. "the dumbbell rack
  // in the corner", "the phrase 'still procrastinating'"), not generic
  // praise. Makes evaluation feel witnessed, not templated.
  observed_detail: z.string().min(1).max(200),
});
export type AIEvaluation = z.infer<typeof AIEvaluationSchema>;

export const GoalPlanSchema = z.object({
  milestones: z.array(z.string().min(1)).min(1).max(8),
  weekly_objectives: z.array(z.string().min(1)).min(1).max(12),
  // Only the next useful set of quests — never hundreds at once (brief §15).
  initial_quests: z.array(QuestGenerationSchema).min(1).max(3),
});
export type GoalPlan = z.infer<typeof GoalPlanSchema>;

export const MentorResponseSchema = z.object({
  message: z.string().min(1).max(2000),
});
export type MentorResponse = z.infer<typeof MentorResponseSchema>;

export const DifficultyAdjustmentSchema = z.object({
  difficulty: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(500),
});
export type DifficultyAdjustment = z.infer<typeof DifficultyAdjustmentSchema>;

/**
 * Live AI Coach (post-launch engagement pass) — one verdict on a single
 * camera frame captured while a quest is in progress. Advisory only:
 * never touches XP or quest status, so there's no "AI awards unlimited
 * XP" concern here the way there is for AIEvaluationSchema.
 */
export const LiveCoachSchema = z.object({
  status: z.enum(["good", "warning", "danger"]),
  // Short and spoken-friendly on purpose — this gets read aloud by TTS,
  // not displayed as a paragraph.
  message: z.string().min(1).max(220),
});
export type LiveCoachVerdict = z.infer<typeof LiveCoachSchema>;
