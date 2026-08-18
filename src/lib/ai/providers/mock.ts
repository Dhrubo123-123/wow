import type { AIProvider } from "../types";
import type {
  GenerateQuestInput,
  EvaluateQuestInput,
  GenerateGoalPlanInput,
  MentorContext,
  AdjustDifficultyInput,
} from "../types";
import type { QuestGeneration, AIEvaluation, GoalPlan, DifficultyAdjustment } from "../schemas";

/**
 * Deterministic, network-free provider for local dev without an API key
 * and for tests (Phase 23). Mirrors the same JSON contracts the real
 * provider is validated against, so callers can't tell the difference
 * except for content quality.
 */
export class MockAIProvider implements AIProvider {
  async generateQuest(input: GenerateQuestInput): Promise<QuestGeneration> {
    return {
      title: `Take one concrete step toward: ${input.goalTitle}`,
      description: `A small, well-defined action that moves "${input.goalTitle}" forward today.`,
      objective: `Make measurable progress on ${input.goalTitle}.`,
      difficulty: Math.min(5, Math.max(1, input.skillLevel)) as QuestGeneration["difficulty"],
      estimated_minutes: 30,
      skill: input.domain === "culinary" ? "Technique" : "Execution",
      xp_reward: 100,
      evidence_required: true,
      evidence_type: "text",
      success_criteria: ["The described action was actually completed"],
      instructions: ["Do the thing.", "Write a short summary of what you did."],
    };
  }

  async evaluateQuest(input: EvaluateQuestInput): Promise<AIEvaluation> {
    const passed = input.evidenceSummary.trim().length > 10;
    return {
      passed,
      score: passed ? 82 : 35,
      feedback: passed
        ? "Solid, concrete evidence that the objective was met."
        : "The evidence provided is too thin to confirm the objective was met.",
      strengths: passed ? ["Clear description of the completed action"] : [],
      improvements: passed ? ["Add a photo next time for stronger evidence"] : ["Provide more detail"],
      xp_awarded: passed ? 100 : 0,
      skill_xp_awarded: passed ? 15 : 0,
      next_action: passed ? "Move on to the next quest." : "Resubmit with more detail.",
    };
  }

  async generateGoalPlan(input: GenerateGoalPlanInput): Promise<GoalPlan> {
    return {
      milestones: [`Establish a routine for ${input.goalTitle}`, `Hit the first measurable checkpoint`],
      weekly_objectives: [`Week 1: lay the groundwork for ${input.goalTitle}`],
      initial_quests: [
        await this.generateQuest({
          goalTitle: input.goalTitle,
          primaryObjective: null,
          occupation: input.occupation,
          skillLevel: input.skillLevel,
          recentQuestTitles: [],
        }),
      ],
    };
  }

  async generateMentorResponse(input: MentorContext): Promise<string> {
    return `You're level ${input.level} with ${input.xp} XP. ${
      input.currentGoalTitle
        ? `Keep pushing on "${input.currentGoalTitle}" — pick your next quest and go.`
        : "Set a goal to get your first quest."
    }`;
  }

  async adjustDifficulty(input: AdjustDifficultyInput): Promise<DifficultyAdjustment> {
    const difficulty = Math.min(
      5,
      Math.max(1, input.recentPassRate > 0.8 ? input.currentDifficulty + 1 : input.currentDifficulty),
    ) as DifficultyAdjustment["difficulty"];
    return { difficulty, reason: "Adjusted based on recent pass rate." };
  }
}
