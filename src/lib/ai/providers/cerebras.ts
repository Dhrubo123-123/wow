import "server-only";
import { OpenAICompatibleProvider } from "./openai-compatible";

const CEREBRAS_ENDPOINT = "https://api.cerebras.ai/v1/chat/completions";

/** Primary provider per the brief (§3, §13) — model gpt-oss-120b. */
export class CerebrasProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string = "gpt-oss-120b") {
    super({ providerName: "Cerebras", endpoint: CEREBRAS_ENDPOINT, apiKey, model });
  }
}
