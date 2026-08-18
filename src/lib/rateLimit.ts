import "server-only";

/**
 * Minimal in-memory sliding-window rate limiter (Phase 21). Deliberately
 * simple: a `Map` keyed by `${scope}:${identity}`, no external store.
 *
 * Known limitation: this only limits per server *process* — on a
 * multi-instance/serverless deployment (e.g. Vercel with concurrent
 * lambdas) each instance has its own map, so the effective global limit
 * is `limit * instance_count`, not a hard ceiling. That's an acceptable
 * MVP tradeoff (it still stops a single abusive client hammering one
 * connection/instance) but should become a shared store (Upstash Redis,
 * Vercel KV) before this matters for cost control at scale — the AI
 * routes this guards are metered, so the real ceiling that protects the
 * budget is Cerebras/Groq's own account-level rate limits, not this.
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const key = `${scope}:${identity}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const timestamps = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0]!;
    const retryAfterSeconds = Math.ceil((oldest + windowSeconds * 1000 - now) / 1000);
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}
