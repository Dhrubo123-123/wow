import "server-only";
import { OpenAICompatibleProvider } from "./openai-compatible";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Temporary stand-in for Cerebras (brief §13's provider abstraction is
 * exactly what makes this a one-file addition) while the Cerebras
 * account has no payment method on file — see ARCHITECTURE.md §10.
 * Free tier, no card required: console.groq.com. Defaults to
 * `openai/gpt-oss-120b` — Groq now hosts the exact model the brief
 * mandates, just on different infrastructure, so switching back to
 * Cerebras later changes nothing about model behavior/quality.
 */
export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string = "openai/gpt-oss-120b") {
    super({ providerName: "Groq", endpoint: GROQ_ENDPOINT, apiKey, model });
  }
}
