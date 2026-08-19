/**
 * Groq free-tier limits — read from console.groq.com/docs/rate-limits
 * on 2026-08-19, not guessed. Confirmed empirically too: qwen3.6-27b's
 * TPM=8000 matches the exact 429 error message hit while building the
 * Live AI Coach feature ("Limit 8000, Used ...").
 *
 * CRITICAL: these apply at the ORGANIZATION level, not per-user — one
 * shared pool across every EMBER user. With ~200 users, RPD is the
 * binding constraint (see the math in gateway.ts's doc comment and the
 * load-test script's output) — TPM/TPD have more headroom by
 * comparison for this app's typical request sizes.
 */
export const GROQ_LIMITS = {
  "openai/gpt-oss-120b": {
    rpm: 30,
    rpd: 1000,
    tpm: 8000,
    tpd: 200000,
  },
  "qwen/qwen3.6-27b": {
    rpm: 30,
    rpd: 1000,
    tpm: 8000,
    tpd: 200000,
  },
} as const;

export type GroqModel = keyof typeof GROQ_LIMITS;
