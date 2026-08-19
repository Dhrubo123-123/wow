import "server-only";
import type { ZodType } from "zod";
import { AIProviderError, type AIProvider } from "../types";
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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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
 */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  private async callChat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AIProviderError(
        `${this.config.providerName} API error ${res.status}`,
        body,
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AIProviderError(
        `${this.config.providerName} response missing message content`,
        data,
      );
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
  ): Promise<T> {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: string;
      try {
        raw = await this.callChat(messages);
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
            "That was not valid JSON. Respond again with ONLY a single valid JSON object matching the requested schema — no markdown, no commentary.",
        });
        continue;
      }

      const result = schema.safeParse(parsedJson);
      if (result.success) return result.data;

      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `Your JSON did not match the required schema: ${result.error.message}. Respond again with ONLY a corrected JSON object.`,
      });
    }

    throw new AIProviderError(
      "AI response failed schema validation after one retry",
    );
  }

  async generateQuest(input: GenerateQuestInput): Promise<QuestGeneration> {
    const system = [
      "You are the Game Master of EMBER, an app that turns real-life goals into RPG quests.",
      "Generate exactly ONE quest as a single JSON object with this shape:",
      '{"title": string, "description": string, "objective": string, "difficulty": 1-5, "estimated_minutes": number, "skill": string, "xp_reward": number, "evidence_required": boolean, "evidence_type": "text"|"image"|"file"|"url", "success_criteria": string[], "instructions": string[]}',
      "The quest must be a concrete, achievable real-world action — not vague advice.",
      "Respond with ONLY the JSON object.",
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

    return this.generateValidated(system, user, QuestGenerationSchema);
  }

  async evaluateQuest(input: EvaluateQuestInput): Promise<AIEvaluation> {
    const system = [
      "You are the Game Master of EMBER, evaluating submitted quest evidence.",
      "Return a single JSON object with this shape:",
      '{"passed": boolean, "score": 0-100, "feedback": string, "strengths": string[], "improvements": string[], "xp_awarded": number, "skill_xp_awarded": number, "next_action": string}',
      "Be honest, specific, and encouraging. xp_awarded and skill_xp_awarded are your proposal only — the server independently clamps them against a maximum, so propose a reasonable value, not an inflated one.",
      "Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Quest: ${input.questTitle}`,
      `Objective: ${input.questObjective}`,
      `Success criteria: ${input.successCriteria.join("; ")}`,
      `Goal this quest serves: ${input.goalTitle}`,
      `Evidence type: ${input.evidenceType}`,
      `Evidence: ${input.evidenceSummary}`,
    ].join("\n");

    return this.generateValidated(system, user, AIEvaluationSchema);
  }

  async generateGoalPlan(input: GenerateGoalPlanInput): Promise<GoalPlan> {
    const system = [
      "You are the Game Master of EMBER, decomposing a user's goal into a plan.",
      "Return a single JSON object with this shape:",
      '{"milestones": string[], "weekly_objectives": string[], "initial_quests": QuestGeneration[]}',
      "Each item in initial_quests has the shape: {title, description, objective, difficulty(1-5), estimated_minutes, skill, xp_reward, evidence_required, evidence_type, success_criteria, instructions}.",
      "Generate ONLY the next useful set of quests (1-3) — never generate hundreds of quests at once.",
      "Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Goal: ${input.goalTitle}`,
      input.targetDays ? `Timeframe: ${input.targetDays} days` : null,
      `Skill level (1=beginner, 4=advanced): ${input.skillLevel}`,
      input.occupation ? `Occupation: ${input.occupation}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return this.generateValidated(system, user, GoalPlanSchema);
  }

  async generateMentorResponse(input: MentorContext): Promise<string> {
    const system = [
      "You are the AI Mentor in EMBER, a real-life RPG app. Answer the user's question directly and helpfully.",
      'Return a single JSON object: {"message": string}.',
      "Base your answer only on the compact context provided — do not invent facts about the user.",
      "Respond with ONLY the JSON object.",
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

    const result = await this.generateValidated(system, user, MentorResponseSchema);
    return result.message;
  }

  async adjustDifficulty(input: AdjustDifficultyInput): Promise<DifficultyAdjustment> {
    const system = [
      "You are EMBER's adaptive difficulty engine.",
      'Return a single JSON object: {"difficulty": 1-5, "reason": string}.',
      "Respond with ONLY the JSON object.",
    ].join("\n");

    const user = [
      `Current difficulty: ${input.currentDifficulty}`,
      `Recent average score: ${input.recentScoreAvg}`,
      `Recent pass rate: ${input.recentPassRate}`,
    ].join("\n");

    return this.generateValidated(system, user, DifficultyAdjustmentSchema);
  }
}
