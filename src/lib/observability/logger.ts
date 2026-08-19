import "server-only";

/**
 * Minimal structured logging (Phase 25). Just `console.error`/`console.log`
 * under the hood — Vercel/Cloudflare both capture stdout/stderr as
 * queryable logs without needing a separate logging service for an MVP.
 *
 * What it exists to enforce: every call site names a `scope` (so
 * failures are greppable — "ai_evaluation", "mentor", "goal_plan",
 * "auth", "upload") and never logs the values the brief explicitly
 * forbids: API keys, passwords, full evidence/free-text content, or
 * other unnecessary personal data. `meta` is redacted defensively —
 * known-sensitive key names are stripped even if a caller forgets.
 */

const REDACTED_KEYS = new Set([
  "apikey",
  "api_key",
  "password",
  "token",
  "secret",
  "authorization",
  "content",
  "evidence",
  "evidencesummary",
]);

function redact(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

export type LogScope =
  | "auth"
  | "ai_provider"
  | "ai_evaluation"
  | "goal_plan"
  | "mentor"
  | "upload"
  | "db"
  | "quest_generation"
  | "push";

export function logError(scope: LogScope, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message,
      meta: redact(meta),
      timestamp: new Date().toISOString(),
    }),
  );
}
