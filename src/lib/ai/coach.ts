import "server-only";
import { AIProviderError } from "./types";
import { LiveCoachSchema, type LiveCoachVerdict } from "./schemas";

/**
 * Live AI Coach (post-launch engagement pass) — "AI has eyes" while a
 * quest is underway. Deliberately NOT part of the swappable AIProvider
 * abstraction (lib/ai/index.ts): vision is a genuinely different model
 * capability than the text-only quest/eval/mentor providers, and
 * Cerebras's gpt-oss-120b has no vision input at all. This calls Groq's
 * vision-capable model directly — the only vision model available
 * across either configured provider — and fails with a clear, typed
 * error (never silently falls back to a text model) when Groq isn't
 * configured.
 *
 * Honesty about what this actually is: a periodic-snapshot analysis
 * (one frame every few seconds, driven by the client), not true
 * continuous 30fps video understanding — no hosted model does that
 * affordably today. It reads as "watching" because the cadence is
 * fast enough for a human task, not because it's literally streaming
 * video to the model.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
// The only Groq-hosted model with image input as of this writing —
// see console.groq.com/docs/vision. If Groq changes their vision
// lineup, this is the one line that needs to change.
const VISION_MODEL = "qwen/qwen3.6-27b";

export interface LiveCoachInput {
  /** Full data: URL (e.g. "data:image/jpeg;base64,...") — never written to disk or a DB. */
  frameDataUrl: string;
  questTitle: string;
  questObjective: string;
  successCriteria: string[];
  lang: "en" | "hi";
  /** A short rolling history of recent verdicts, oldest first — keeps
   *  the coach from repeating itself every frame. */
  recentMessages: string[];
}

function buildSystemPrompt(lang: "en" | "hi"): string {
  const languageLine =
    lang === "hi"
      ? "Respond ONLY in Hindi (Devanagari script) for the \"message\" field."
      : "Respond ONLY in English for the \"message\" field.";

  return [
    "You are EMBER's Live AI Coach — you watch a single live camera frame of someone performing a real-world quest (cooking, exercise, a physical task) and give ONE short, real-time spoken correction or encouragement, the way a coach standing next to them would.",
    "Rules:",
    "- Only call out something concrete you can actually see in THIS frame — technique, form, a safety issue, an ingredient that looks off. Never invent detail you can't see.",
    "- If the frame is unclear, poorly framed, or you genuinely can't tell what's happening, say status \"good\" and gently ask them to adjust the camera — don't guess.",
    "- If everything looks fine, a brief, warm encouragement is enough — you don't need to find a problem every frame.",
    "- \"warning\" = a technique/quality issue worth correcting now (e.g. an unsafe grip, a rotten ingredient, poor form). \"danger\" = an actual safety risk (e.g. fingers near a blade, no eye protection near a hazard).",
    "- Keep \"message\" under 2 short sentences — it is read aloud by text-to-speech, not displayed as text.",
    languageLine,
    'Respond with ONLY a JSON object: {"status": "good"|"warning"|"danger", "message": string}.',
  ].join("\n");
}

/**
 * Analyzes one camera frame against the quest's goal and returns a
 * single spoken-coaching verdict. Throws AIProviderError (never a raw
 * error) if Groq isn't configured or the response fails validation
 * after one retry — callers should show the brief's standard "GAME
 * MASTER TEMPORARILY UNAVAILABLE" copy, same as every other AI call.
 */
export async function analyzeLiveFrame(input: LiveCoachInput): Promise<LiveCoachVerdict> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AIProviderError("Live AI Coach requires GROQ_API_KEY (vision-capable model)");
  }

  const userText = [
    `Quest: ${input.questTitle}`,
    `Objective: ${input.questObjective}`,
    input.successCriteria.length
      ? `Success criteria: ${input.successCriteria.join("; ")}`
      : null,
    input.recentMessages.length
      ? `Your last few comments (don't just repeat these): ${input.recentMessages.slice(-3).join(" | ")}`
      : null,
    "Here is the current camera frame:",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system", content: buildSystemPrompt(input.lang) },
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: input.frameDataUrl } },
      ],
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 300,
          // qwen3.6 is a reasoning model by default — without this it
          // spends several hundred tokens "thinking" before the actual
          // JSON, which both blows past a low max_tokens (content comes
          // back empty) and roughly 10x's latency/cost for zero benefit
          // on a task this simple. Confirmed via direct testing against
          // the live API before wiring this up.
          reasoning_effort: "none",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AIProviderError(`Groq vision API error ${res.status}`, body);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new AIProviderError("Groq vision response missing message content", data);
      }
      raw = content;
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
          "That was not valid JSON. Respond again with ONLY a single valid JSON object matching the requested schema.",
      });
      continue;
    }

    const result = LiveCoachSchema.safeParse(parsedJson);
    if (result.success) return result.data;

    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Your JSON did not match the required schema: ${result.error.message}. Respond again with ONLY a corrected JSON object.`,
    });
  }

  throw new AIProviderError("Live AI Coach response failed schema validation after one retry");
}
