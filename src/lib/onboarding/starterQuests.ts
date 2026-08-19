/**
 * Day-one guaranteed win (roadmap item 2) — a hand-authored, zero-AI
 * starter quest per category. Deliberately NOT AI-generated: this is
 * the single most important first impression in the app, and it must
 * never fail, never be slow, and never cost anything against the AI
 * budget that roadmap item A exists to protect. Evaluation is
 * deterministic too (see the /api/onboarding/complete-starter route) —
 * any real evidence submitted passes, no AI judgment call on someone's
 * very first action in the app.
 */

export type GoalCategory = "fitness" | "cooking" | "learning" | "productivity" | "other";

export const GOAL_CATEGORIES: { value: GoalCategory; label: string; emoji: string }[] = [
  { value: "fitness", label: "Fitness", emoji: "💪" },
  { value: "cooking", label: "Cooking", emoji: "🍳" },
  { value: "learning", label: "Learning", emoji: "📚" },
  { value: "productivity", label: "Productivity", emoji: "✅" },
  { value: "other", label: "Something else", emoji: "✨" },
];

export interface StarterQuest {
  goalTitle: string;
  skillKey: string;
  title: string;
  objective: string;
  instructions: string[];
  successCriteria: string[];
  evidenceType: "image" | "text";
  evidencePrompt: string;
  estimatedMinutes: number;
}

// skillKey values match public.skills.key (seeded in 0001_init.sql /
// 0002_more_skills.sql) — a real, existing skill lights up immediately,
// not a placeholder.
export const STARTER_QUESTS: Record<GoalCategory, StarterQuest> = {
  fitness: {
    goalTitle: "Get moving, consistently",
    skillKey: "strength",
    title: "Scout Your Training Ground",
    objective: "Photograph the space where you'll actually train.",
    instructions: [
      "Find the spot — a room, a yard, a gym, a sidewalk — wherever you'll actually do this.",
      "Take one photo of it, right now.",
    ],
    successCriteria: ["A photo of a real, specific space"],
    evidenceType: "image",
    evidencePrompt: "Photograph where you'll train.",
    estimatedMinutes: 3,
  },
  cooking: {
    goalTitle: "Cook with confidence",
    skillKey: "creativity",
    title: "Meet Your Kitchen",
    objective: "Photograph your kitchen workspace and one ingredient you already have.",
    instructions: [
      "Stand in your kitchen (or wherever you cook).",
      "Pick up one ingredient you already own.",
      "Photograph your counter/workspace with that ingredient in frame.",
    ],
    successCriteria: ["A photo of a real kitchen workspace with an ingredient visible"],
    evidenceType: "image",
    evidencePrompt: "Photograph your workspace and one ingredient.",
    estimatedMinutes: 3,
  },
  learning: {
    goalTitle: "Learn something real",
    skillKey: "learning",
    title: "Write Your First Sentence",
    objective: "Write one sentence: what do you want to learn, and why?",
    instructions: [
      "No essay. One honest sentence.",
      "What you want to learn, and the real reason you want to learn it.",
    ],
    successCriteria: ["One genuine sentence about a real learning goal"],
    evidenceType: "text",
    evidencePrompt: "Write one sentence about what you want to learn and why.",
    estimatedMinutes: 2,
  },
  productivity: {
    goalTitle: "Build a real system",
    skillKey: "focus",
    title: "Clear One Square Foot",
    objective: "Photograph your workspace, then clear one small area of it.",
    instructions: [
      "Photograph your desk/workspace as it is right now — no tidying first.",
      "Clear just one small area — one square foot is plenty.",
    ],
    successCriteria: ["A photo of a real workspace"],
    evidenceType: "image",
    evidencePrompt: "Photograph your workspace before you clear it.",
    estimatedMinutes: 3,
  },
  other: {
    goalTitle: "Make real progress",
    skillKey: "execution",
    title: "Name Your Quest",
    objective: "Write one sentence describing what you're setting out to do.",
    instructions: ["One sentence. What are you actually trying to do?"],
    successCriteria: ["One genuine sentence describing a real goal"],
    evidenceType: "text",
    evidencePrompt: "Write one sentence describing your goal.",
    estimatedMinutes: 2,
  },
};

// Deterministic, no AI: any evidence past a trivial length is accepted.
// The bar is "did something real happen", not "was it good" — that
// judgment starts on quest 2, once the account already has a win.
export function evidenceMeetsStarterBar(evidenceType: "image" | "text", content: string | null): boolean {
  if (evidenceType === "image") return true; // a captured photo is evidence enough
  return (content?.trim().length ?? 0) >= 8;
}

// Flat 100 XP — calculateXPForLevel(1) in lib/progression/levels.ts is
// exactly 100, so this guarantees Level 2, not "usually" or "probably".
export const STARTER_QUEST_XP = 100;
