import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { logEvent } from "@/lib/events/log";
import { EVENT } from "@/lib/events/names";
import { GROQ_LIMITS, type GroqModel } from "./limits";

/**
 * Every Groq call in the app routes through here — that's the point:
 * one shared per-model token bucket (RPM), a small concurrency queue,
 * retry-with-backoff on 429/5xx, a hard timeout, and one place that
 * logs `ai_call_logged` so /admin/metrics can see real usage against
 * the real limits in limits.ts.
 *
 * Why this matters at ~200 users: Groq's free-tier RPD (1000/day,
 * shared org-wide — see limits.ts) is the binding constraint. If every
 * user did just their budgeted 1 quest-gen + 1 evaluation + 5 mentor
 * turns uncached, that's up to 1400 gpt-oss-120b calls/day against a
 * 1000/day pool — already over budget before caching. This gateway is
 * the backstop (queue + backoff instead of hard failures); the actual
 * fix is combining it with per-user daily budgets and caching
 * (budget.ts, quest/mentor caches) so most days never get close.
 *
 * In-memory state, scoped to one serverless function instance's
 * lifetime — same documented limitation as lib/rateLimit.ts. Good
 * enough to smooth bursts within an instance; the per-user budget
 * checks (backed by the DB) are the real ceiling, not this queue.
 */

const MAX_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

interface QueueSlot {
  release: () => void;
}

let activeCount = 0;
const waiters: (() => void)[] = [];

async function acquireSlot(): Promise<QueueSlot> {
  if (activeCount < MAX_CONCURRENCY) {
    activeCount++;
    return { release: releaseSlot };
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeCount++;
  return { release: releaseSlot };
}

function releaseSlot() {
  activeCount--;
  const next = waiters.shift();
  if (next) next();
}

// Per-model sliding-window RPM tracker — a simple timestamp log pruned
// on each check, not a precise token-bucket, but sufficient to avoid
// bursting past the documented RPM.
const callTimestamps = new Map<string, number[]>();

function isKnownGroqModel(model: string): model is GroqModel {
  return model in GROQ_LIMITS;
}

async function waitForRpmSlot(model: string): Promise<void> {
  // Cerebras (or any future provider) isn't in limits.ts — that table
  // is specifically Groq's documented free-tier numbers, not a guess
  // extended to cover models nobody's measured. Skip throttling for
  // anything unrecognized rather than applying an invented limit.
  if (!isKnownGroqModel(model)) return;
  const limit = GROQ_LIMITS[model].rpm;
  for (;;) {
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (callTimestamps.get(model) ?? []).filter((t) => t > windowStart);
    callTimestamps.set(model, timestamps);
    if (timestamps.length < limit) {
      timestamps.push(now);
      return;
    }
    // Wait until the oldest call in the window ages out.
    const waitMs = timestamps[0]! + 60_000 - now + 50;
    await new Promise((resolve) => setTimeout(resolve, Math.max(50, waitMs)));
  }
}

export interface GatewayCallOptions {
  model: string;
  endpoint: string;
  apiKey: string;
  requestBody: Record<string, unknown>;
  purpose: "quest_generation" | "evaluation" | "mentor" | "coach" | "difficulty_adjustment";
  /** For ai_call_logged — null for system/cache-warming calls with no specific user. */
  userId: string | null;
  /** Admin client to log the event with — pass null to skip logging (e.g. in tests). */
  admin: SupabaseClient<Database> | null;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limited" | "timeout" | "http_error" | "network_error",
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Makes one Groq chat-completions call through the shared queue +
 * rate limiter + retry policy, and logs the result. Returns the parsed
 * JSON response body on success; throws GatewayError otherwise (the
 * caller — providers/openai-compatible.ts, coach.ts — maps that to
 * their own AIProviderError for the "GAME MASTER UNAVAILABLE" copy).
 */
export async function gatewayCall(opts: GatewayCallOptions): Promise<unknown> {
  const slot = await acquireSlot();
  const startedAt = Date.now();
  let lastError: GatewayError | null = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await waitForRpmSlot(opts.model);

      let res: Response;
      try {
        res = await fetchWithTimeout(
          opts.endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify(opts.requestBody),
          },
          REQUEST_TIMEOUT_MS,
        );
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastError = new GatewayError(
          isAbort ? "Groq request timed out" : "Groq network error",
          isAbort ? "timeout" : "network_error",
        );
        await backoff(attempt);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new GatewayError(`Groq returned ${res.status}`, "rate_limited");
        await backoff(attempt);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        await logCall(opts, startedAt, "error", null);
        throw new GatewayError(`Groq API error ${res.status}: ${body}`, "http_error");
      }

      const json = await res.json();
      const tokens = (json as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? null;
      await logCall(opts, startedAt, "success", tokens);
      return json;
    }

    await logCall(opts, startedAt, lastError?.kind ?? "error", null);
    throw lastError ?? new GatewayError("Groq call failed after retries", "network_error");
  } finally {
    slot.release();
  }
}

async function backoff(attempt: number) {
  const delayMs = Math.min(4000, 250 * 2 ** attempt) + Math.random() * 100;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function logCall(
  opts: GatewayCallOptions,
  startedAt: number,
  outcome: string,
  tokens: number | null,
) {
  // events.user_id is a foreign key to auth.users — skip logging
  // rather than insert a placeholder ID that doesn't exist (would
  // just fail the insert and spam error logs for every system-level
  // call, e.g. cache warming with no specific user attached).
  if (!opts.admin || !opts.userId) return;
  await logEvent(opts.admin, opts.userId, EVENT.AI_CALL_LOGGED, {
    model: opts.model,
    purpose: opts.purpose,
    tokens,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
    outcome,
  });
}
