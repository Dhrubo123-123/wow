import "server-only";
import type { ZodType } from "zod";
import { AIProviderError, type AIProvider, type AICallContext } from "../types";
import type {
  GenerateQuestInput,
  EvaluateQuestInput,
  GenerateGoalPlanInput,
  MentorContext,
  AdjustDifficultyInput,
} from "../types";
import {
  QuestGenerationSchema,
  AIEvaluationSchema,
  GoalPlanSchema,
  MentorResponseSchema,
  DifficultyAdjustmentSchema,
  type QuestGeneration,
  type AIEvaluation,
  type GoalPlan,
  type DifficultyAdjustment,
} from "../schemas";
import { gatewayCall, GatewayError } from "../gateway";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type Purpose = "quest_generation" | "evaluation" | "mentor" | "difficulty_adjustment";

// Roadmap item A2: every call now has a hard max_tokens ceiling — there
// wasn't one before, which meant a single verbose completion could cost
// far more than the ~900 tokens these tasks actually need. Sized to the
// JSON shape each call returns (evaluation has the most fields, mentor
// the least).
const MAX_TOKENS: Record<Purpose, number> = {
  quest_generation: 550,
  evaluation: 500,
  mentor: 350,
  difficulty_adjustment: 150,
};

export interface OpenAICompatibleConfig {
  /** Shown in error messages / logs so multi-provider failures are traceable. */
  providerName: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * Shared implementation for any Chat-Completions-compatible provider
 * (Cerebras, Groq, and any future addition — brief §13's "AI provider
 * abstraction so the backend can be changed later"). Cerebras and Groq
 * both expose an OpenAI-shaped `/chat/completions` endpoint with
 * `response_format: {type: "json_object"}` JSON mode, so the request
 * plumbing, retry-once-then-controlled-error validation, and all five
 * AIProvider methods live here exactly once.
 *
 * Roadmap item A: every actual network call now goes through
 * lib/ai/gateway.ts (queue + rate limit + retry + logging) instead of
 * a raw `fetch` — this is the one choke point all Groq usage passes
 * through.
 */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  private async callChat(messages: ChatMessage[], purpose: Purpose, ctx?: AICallContext): Promise<string> {
    let data: unknown;
    try {
      data = await gatewayCall({
        model: this.config.model,
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        requestBody: {
          model: this.config.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: MAX_TOKENS[purpose],
        },
        purpose,
        userId: ctx?.userId ?? null,
        admin: ctx?.admin ?? null,
      });
    } catch (err) {
      if (err instanceof GatewayError) {
        throw new AIProviderError(`${this.config.providerName} API error: ${err.message}`, err);
      }
      throw err;
    }

    const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message
      ?.content;
    if (typeof content !== "string") {
      throw new AIProviderError(`${this.config.providerName} response missing message content`, data);
    }
    return content;
  }

  /**
   * Calls the model, validates the JSON response against `schema`. On
   * failure (bad JSON or schema mismatch), retries exactly once with a
   * correction prompt appended. If that also fails, throws a controlled
   * AIProviderError — invalid output is never returned to the caller
   * and never stored (brief §14).
   */
  private async generateValidated<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: ZodType<T>,
    purpose: Purpose,
    ctx?: AICallContext,
  ): Promise<T> {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: string;
      try {
        raw = await this.callChat(messages, purpose, ctx);
      } catch (err) {
        if (attempt === 1) throw err;
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content:
            "Not valid JSON. Respond again with ONLY a single valid JSON object — no markdown, no commentary.",
        });
        continue;
      }

      const result = schema.safeParse(parsedJson);
      if (result.success) return result.data;

      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `Schema mismatch: ${result.error.message}. Respond again with ONLY a corrected JSON object.`,
      });
    }

    throw new AIProviderError(
      "AI response failed schema validation after one retry",
    );
  }

  async generateQuest(input: GenerateQuestInput, ctx?: AICallContext): Promise<QuestGeneration> {
    const system = [
      "You are the Game Master of EMBER — real-life goals become RPG quests.",
      "Generate ONE quest as JSON:",
      '{"title": string, "description": string, "objective": string, "difficulty": 1-5, "estimated_minutes": number, "skill": string, "xp_reward": number, "evidence_required": boolean, "evidence_type": "text"|"image"|"file"|"url", "success_criteria": string[], "instructions": string[]}',
      "Concrete, achievable, real-world action — not vague advice. Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Goal: ${input.goalTitle}`,
      input.primaryObjective ? `Primary objective: ${input.primaryObjective}` : null,
      input.occupation ? `Occupation: ${input.occupation}` : null,
      `Skill level (1=beginner, 4=advanced): ${input.skillLevel}`,
      input.recentQuestTitles.length
        ? `Recently completed quests (don't repeat): ${input.recentQuestTitles.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return this.generateValidated(system, user, QuestGenerationSchema, "quest_generation", ctx);
  }

  async evaluateQuest(input: EvaluateQuestInput, ctx?: AICallContext): Promise<AIEvaluation> {
    const system = [
      "You are the Game Master of EMBER, evaluating submitted quest evidence.",
      "Return JSON:",
      '{"passed": boolean, "score": 0-100, "feedback": string, "strengths": string[], "improvements": string[], "xp_awarded": number, "skill_xp_awarded": number, "next_action": string}',
      "Honest, specific, encouraging. xp_awarded/skill_xp_awarded are proposals only — the server clamps them, so propose reasonably. Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Quest: ${input.questTitle}`,
      `Objective: ${input.questObjective}`,
      `Success criteria: ${input.successCriteria.join("; ")}`,
      `Goal this quest serves: ${input.goalTitle}`,
      `Evidence type: ${input.evidenceType}`,
      `Evidence: ${input.evidenceSummary}`,
    ].join("\n");

    return this.generateValidated(system, user, AIEvaluationSchema, "evaluation", ctx);
  }

  async generateGoalPlan(input: GenerateGoalPlanInput, ctx?: AICallContext): Promise<GoalPlan> {
    const system = [
      "You are the Game Master of EMBER, decomposing a user's goal into a plan.",
      "Return JSON:",
      '{"milestones": string[], "weekly_objectives": string[], "initial_quests": QuestGeneration[]}',
      "Each initial_quests item: {title, description, objective, difficulty(1-5), estimated_minutes, skill, xp_reward, evidence_required, evidence_type, success_criteria, instructions}.",
      "ONLY the next useful set of quests (1-3), never hundreds. Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Goal: ${input.goalTitle}`,
      input.targetDays ? `Timeframe: ${input.targetDays} days` : null,
      `Skill level (1=beginner, 4=advanced): ${input.skillLevel}`,
      input.occupation ? `Occupation: ${input.occupation}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return this.generateValidated(system, user, GoalPlanSchema, "quest_generation", ctx);
  }

  async generateMentorResponse(input: MentorContext, ctx?: AICallContext): Promise<string> {
    // Note on "trim mentor history to last 4 turns" (roadmap item A2):
    // there is no conversation history in this prompt at all — each
    // question has always been answered fresh from compact profile
    // context (name/level/xp/goal/recent quests), never from prior
    // chat turns. Nothing to trim; already the minimum. If turn-based
    // memory is added later, cap it at 4 turns then.
    const system = [
      "You are the AI Mentor in EMBER. Answer directly and helpfully.",
      'Return JSON: {"message": string}.',
      "Use only the compact context given — never invent facts about the user. Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Name: ${input.name}`,
      `Level: ${input.level}, XP: ${input.xp}`,
      input.currentGoalTitle ? `Current goal: ${input.currentGoalTitle}` : "No active goal.",
      input.recentQuestTitles.length
        ? `Recent quests: ${input.recentQuestTitles.join(", ")}`
        : null,
      input.recentFailureTitles.length
        ? `Recent failures: ${input.recentFailureTitles.join(", ")}`
        : null,
      input.recentAchievementNames.length
        ? `Recent achievements: ${input.recentAchievementNames.join(", ")}`
        : null,
      `Question: ${input.question}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.generateValidated(system, user, MentorResponseSchema, "mentor", ctx);
    return result.message;
  }

  async adjustDifficulty(input: AdjustDifficultyInput, ctx?: AICallContext): Promise<DifficultyAdjustment> {
    const system = [
      "You are EMBER's adaptive difficulty engine.",
      'Return JSON: {"difficulty": 1-5, "reason": string}. Respond with ONLY the JSON object.',
    ].join("\n");

    const user = [
      `Current difficulty: ${input.currentDifficulty}`,
      `Recent average score: ${input.recentScoreAvg}`,
      `Recent pass rate: ${input.recentPassRate}`,
    ].join("\n");

    return this.generateValidated(system, user, DifficultyAdjustmentSchema, "difficulty_adjustment", ctx);
  }
}
