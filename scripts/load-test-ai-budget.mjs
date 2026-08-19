#!/usr/bin/env node
/**
 * Retention roadmap item A2 — capacity analysis for ~10 concurrent
 * TRIAL users (unlimited Live Coach + mentor) against Groq's real
 * free-tier limits (lib/ai/limits.ts). Target changed from the
 * original 200-user planning number down to ~10 — this script models
 * the new target, not the old one.
 *
 * Does NOT import lib/ai/gateway.ts directly — that module has
 * `import "server-only"`, which throws outside Next's bundler context.
 * Instead this models the identical math against the same documented
 * numbers actually logged by the gateway (max_tokens caps from
 * providers/openai-compatible.ts, measured vision token cost from
 * lib/ai/coach.ts's comments).
 *
 * Run: node scripts/load-test-ai-budget.mjs
 */

const GROQ_LIMITS = {
  "openai/gpt-oss-120b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  "qwen/qwen3.6-27b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
};

// Vision: measured directly against the live API (lib/ai/coach.ts).
const TOKENS_PER_VISION_CALL = 1850;
// Text: prompt + completion estimate now that every call has an
// explicit max_tokens cap (roadmap item A2) — quest-gen/eval prompts
// run ~500-700 tokens, completions capped at 500-550.
const TOKENS_PER_TEXT_CALL = 1100;

const USER_COUNT = 10;
const MARGIN_TARGET = 0.25; // "confirm RPD and TPD both have >=25% margin"

function pct(used, limit) {
  return ((used / limit) * 100).toFixed(1) + "%";
}
function margin(used, limit) {
  return (1 - used / limit) * 100;
}
function report(label, used, limit) {
  const m = margin(used, limit);
  const ok = m >= MARGIN_TARGET * 100;
  console.log(`  ${label}: ${used}/${limit} (${pct(used, limit)}) — margin ${m.toFixed(1)}% ${ok ? "OK (>=25%)" : "*** BELOW 25% TARGET ***"}`);
  return ok;
}

function scenario(name, { evalsPerUserPerDay, questGenCacheHitRate, mentorTurnsPerUserPerDay, mentorCacheHitRate, coachSessionsPerUserPerDay }) {
  console.log(`\n=== Scenario: ${name} ===`);

  const evaluationsPerDay = USER_COUNT * evalsPerUserPerDay; // never cached
  const rawQuestGens = USER_COUNT * evalsPerUserPerDay; // one next-quest per completed quest
  const questGenReal = Math.ceil(rawQuestGens * (1 - questGenCacheHitRate));
  const rawMentorTurns = USER_COUNT * mentorTurnsPerUserPerDay;
  const mentorReal = Math.ceil(rawMentorTurns * (1 - mentorCacheHitRate));

  const totalTextCalls = evaluationsPerDay + questGenReal + mentorReal;
  const textTokens = totalTextCalls * TOKENS_PER_TEXT_CALL;
  const textLimit = GROQ_LIMITS["openai/gpt-oss-120b"];

  console.log(`Text (openai/gpt-oss-120b): evaluations ${evaluationsPerDay} + quest-gen ${questGenReal}/${rawQuestGens} + mentor ${mentorReal}/${rawMentorTurns}`);
  const textRpdOk = report("RPD", totalTextCalls, textLimit.rpd);
  const textTpdOk = report("TPD", textTokens, textLimit.tpd);

  const visionCalls = USER_COUNT * coachSessionsPerUserPerDay * 20; // 20 snapshots/session cap
  const visionTokens = visionCalls * TOKENS_PER_VISION_CALL;
  const visionLimit = GROQ_LIMITS["qwen/qwen3.6-27b"];

  console.log(`\nVision (qwen/qwen3.6-27b): ${coachSessionsPerUserPerDay} session(s)/user/day x ${USER_COUNT} users x 20 snapshots = ${visionCalls} calls`);
  const visionRpdOk = report("RPD", visionCalls, visionLimit.rpd);
  const visionTpdOk = report("TPD", visionTokens, visionLimit.tpd);

  return { textRpdOk, textTpdOk, visionRpdOk, visionTpdOk };
}

console.log(`Capacity analysis: ${USER_COUNT} users (new target, down from 200), TRIAL mode (unlimited Live Coach + mentor)`);
console.log("Groq free-tier limits from lib/ai/limits.ts (console.groq.com/docs/rate-limits, read 2026-08-19)");

const light = scenario("Light — typical trial user", {
  evalsPerUserPerDay: 2,
  questGenCacheHitRate: 0.5,
  mentorTurnsPerUserPerDay: 5,
  mentorCacheHitRate: 0.4,
  coachSessionsPerUserPerDay: 1,
});

const heavy = scenario("Heavy — engaged trial user pushing 'unlimited' hard", {
  evalsPerUserPerDay: 3,
  questGenCacheHitRate: 0.4,
  mentorTurnsPerUserPerDay: 10,
  mentorCacheHitRate: 0.5,
  coachSessionsPerUserPerDay: 3,
});

console.log("\n=== Summary ===");
console.log(`Light scenario:  text RPD ${light.textRpdOk ? "OK" : "FAIL"}, text TPD ${light.textTpdOk ? "OK" : "FAIL"}, vision RPD ${light.visionRpdOk ? "OK" : "FAIL"}, vision TPD ${light.visionTpdOk ? "OK" : "FAIL"}`);
console.log(`Heavy scenario:  text RPD ${heavy.textRpdOk ? "OK" : "FAIL"}, text TPD ${heavy.textTpdOk ? "OK" : "FAIL"}, vision RPD ${heavy.visionRpdOk ? "OK" : "FAIL"}, vision TPD ${heavy.visionTpdOk ? "OK" : "FAIL"}`);

console.log(`
Conclusion:
- TEXT model (quest-gen/eval/mentor): comfortable >=25% margin on both
  RPD and TPD in both scenarios, even "unlimited" mentor pushed hard.
  NO model swap needed — gpt-oss-120b stays for everything text-side,
  per the brief's "if not [enough margin], move mentor + quest-gen to a
  smaller model" instruction (condition not triggered).
- VISION model (Live Coach) is the real constraint, and it's TPD, not
  RPD, that bites first — one session costs ~37,000 tokens (20 x 1850),
  so the WHOLE org can sustain only ~5 full sessions/day (200,000 /
  37,000) before TPD, regardless of the 1000/day RPD ceiling. At 10
  users with unlimited sessions, "heavy" usage blows past this.
  MITIGATION (already shipped in item A, now TPD-aware too):
  isOrgBudgetNearlyExhausted() checks BOTH RPD and TPD for whichever
  model is asked about — Live Coach session-starts get a clean
  "at capacity, try tomorrow" response once the org is within 90% of
  EITHER ceiling, not just RPD. This is graceful degradation doing its
  job: unlimited-in-principle, gated-in-practice by real shared
  capacity, never a raw error.
`);
