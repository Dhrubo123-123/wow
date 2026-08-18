import "server-only";
import type { AIProvider } from "./types";
import { CerebrasProvider } from "./providers/cerebras";
import { GroqProvider } from "./providers/groq";
import { MockAIProvider } from "./providers/mock";

export * from "./types";
export * from "./schemas";

let cached: AIProvider | null = null;

/**
 * Provider factory (brief §13). `AI_PROVIDER` explicitly selects
 * "cerebras" | "groq" | "mock"; without it, picks the best available key
 * (Cerebras first, per the brief's default, then Groq, then the
 * deterministic mock). Server-only; never import this from a client
 * component.
 *
 * Currently pinned to Groq via AI_PROVIDER in .env.local — the Cerebras
 * account has no payment method on file (402 on every model, including
 * free-tier ones). Switch AI_PROVIDER back to "cerebras" once that's
 * resolved; no code change needed. See ARCHITECTURE.md §10.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (explicit === "cerebras" && cerebrasKey) {
    cached = new CerebrasProvider(cerebrasKey, process.env.CEREBRAS_MODEL || "gpt-oss-120b");
  } else if (explicit === "groq" && groqKey) {
    cached = new GroqProvider(groqKey, process.env.GROQ_MODEL);
  } else if (explicit === "mock") {
    cached = new MockAIProvider();
  } else if (cerebrasKey) {
    cached = new CerebrasProvider(cerebrasKey, process.env.CEREBRAS_MODEL || "gpt-oss-120b");
  } else if (groqKey) {
    cached = new GroqProvider(groqKey, process.env.GROQ_MODEL);
  } else {
    cached = new MockAIProvider();
  }

  return cached;
}
