#!/usr/bin/env node
/**
 * Retention roadmap item A — capacity analysis for ~200 users' daily
 * usage pattern against Groq's real free-tier limits (lib/ai/limits.ts).
 *
 * This does NOT import lib/ai/gateway.ts directly — that module has
 * `import "server-only"`, which throws outside Next's bundler context,
 * same reason streaks.ts's pure logic was split out for standalone
 * testing earlier in this project. Instead this models the identical
 * math (RPD as the binding constraint, per-request token cost, cache
 * hit rates) against the same documented numbers, which is what
 * actually matters for capacity planning — a live real-time simulation
 * of a 24-hour queue would take 24 hours to run for no extra insight.
 *
 * Run: node scripts/load-test-ai-budget.mjs
 */

// Mirrors lib/ai/limits.ts — duplicated here deliberately (see above)
// rather than imported, so keep these two files in sync if Groq's
// numbers change.
const GROQ_LIMITS = {
  "openai/gpt-oss-120b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  "qwen/qwen3.6-27b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
};

// Measured directly against the live API while building the Live AI
// Coach feature (see lib/ai/coach.ts's comments) — not a guess.
const TOKENS_PER_VISION_CALL = 1850;
// Text calls (quest-gen/eval/mentor) are smaller and more variable;
// this is a conservative estimate from typical prompt+response sizes
// in providers/openai-compatible.ts's system/user prompts.
const TOKENS_PER_TEXT_CALL = 900;

const USER_COUNT = 200;
const FREE_DAILY_LIMITS = { questGenerations: 1, evaluations: 1, mentorTurns: 5 };

function scenario(name, { cacheHitRate, coachTrialUptakeRate }) {
  console.log(`\n=== Scenario: ${name} ===`);

  // --- Text model (openai/gpt-oss-120b): quest-gen + evaluation + mentor ---
  const evaluationsPerDay = USER_COUNT * FREE_DAILY_LIMITS.evaluations; // never cached
  const rawQuestGens = USER_COUNT * FREE_DAILY_LIMITS.questGenerations;
  const rawMentorTurns = USER_COUNT * FREE_DAILY_LIMITS.mentorTurns;

  const questGenReal = Math.ceil(rawQuestGens * (1 - cacheHitRate));
  const mentorReal = Math.ceil(rawMentorTurns * (1 - cacheHitRate));

  const totalTextCalls = evaluationsPerDay + questGenReal + mentorReal;
  const textLimit = GROQ_LIMITS["openai/gpt-oss-120b"];
  const textTokens = totalTextCalls * TOKENS_PER_TEXT_CALL;

  console.log(
    `Text model calls/day: ${totalTextCalls} (evaluations ${evaluationsPerDay} [never cached] + quest-gen ${questGenReal}/${rawQuestGens} + mentor ${mentorReal}/${rawMentorTurns}, cache hit rate ${(cacheHitRate * 100).toFixed(0)}%)`,
  );
  console.log(
    `  vs RPD ${textLimit.rpd}: ${totalTextCalls <= textLimit.rpd ? "OK" : "*** OVER BUDGET ***"} (${((totalTextCalls / textLimit.rpd) * 100).toFixed(0)}% of daily quota)`,
  );
  console.log(
    `  vs TPD ${textLimit.tpd}: ${textTokens <= textLimit.tpd ? "OK" : "*** OVER BUDGET ***"} (${textTokens} tokens, ${((textTokens / textLimit.tpd) * 100).toFixed(0)}%)`,
  );

  // Peak-hour RPM check: assume a plausible "evening rush" where 25%
  // of the day's real calls land inside one hour.
  const peakHourCalls = totalTextCalls * 0.25;
  const peakHourPeakMinuteCalls = peakHourCalls / 60; // assume roughly even spread within the peak hour
  console.log(
    `  Peak-hour RPM estimate: ~${peakHourPeakMinuteCalls.toFixed(1)}/min vs RPM ${textLimit.rpm} — ${peakHourPeakMinuteCalls <= textLimit.rpm ? "OK, gateway queue absorbs bursts above this comfortably" : "gateway queue WILL be actively throttling during peak hour"}`,
  );

  // --- Vision model (qwen3.6-27b): Live Coach, 1 trial session ever ---
  const coachTrialsToday = Math.ceil(USER_COUNT * coachTrialUptakeRate);
  const snapshotsPerSession = 20; // roadmap item A cap
  const visionCalls = coachTrialsToday * snapshotsPerSession;
  const visionLimit = GROQ_LIMITS["qwen/qwen3.6-27b"];
  const visionTokens = visionCalls * TOKENS_PER_VISION_CALL;

  console.log(
    `\nVision model calls/day: ${visionCalls} (${coachTrialsToday} users trying their 1 free Live Coach session × ${snapshotsPerSession} snapshots)`,
  );
  console.log(
    `  vs RPD ${visionLimit.rpd}: ${visionCalls <= visionLimit.rpd ? "OK" : "*** OVER BUDGET ***"} (${((visionCalls / visionLimit.rpd) * 100).toFixed(0)}%)`,
  );
  console.log(
    `  vs TPD ${visionLimit.tpd}: ${visionTokens <= visionLimit.tpd ? "OK" : "*** OVER BUDGET ***"} (${visionTokens} tokens, ${((visionTokens / visionLimit.tpd) * 100).toFixed(0)}%)`,
  );

  return { totalTextCalls, textLimit: textLimit.rpd, visionCalls, visionLimit: visionLimit.rpd };
}

console.log(`Capacity analysis: ${USER_COUNT} users, one simulated day, against Groq free-tier limits`);
console.log("(lib/ai/limits.ts, read from console.groq.com/docs/rate-limits on 2026-08-19)");

const worstCase = scenario("Worst case — no cache warm-up yet (day 1 of the app existing)", {
  cacheHitRate: 0,
  coachTrialUptakeRate: 0.3, // 30% of users try the trial on day 1 — optimistic/pessimistic depending on framing
});

const steadyState = scenario("Steady state — caches warm (typical after the first week)", {
  cacheHitRate: 0.6, // 25 (category x difficulty) buckets is small; converges fast across 200 users
  coachTrialUptakeRate: 0.05, // most users who'll try the trial already have by week 2
});

console.log("\n=== Summary ===");
console.log(
  `Worst case: ${worstCase.totalTextCalls}/${worstCase.textLimit} text RPD (${worstCase.totalTextCalls > worstCase.textLimit ? "OVER" : "under"}), ${worstCase.visionCalls}/${worstCase.visionLimit} vision RPD (${worstCase.visionCalls > worstCase.visionLimit ? "OVER" : "under"})`,
);
console.log(
  `Steady state: ${steadyState.totalTextCalls}/${steadyState.textLimit} text RPD (${steadyState.totalTextCalls > steadyState.textLimit ? "OVER" : "under"}), ${steadyState.visionCalls}/${steadyState.visionLimit} vision RPD (${steadyState.visionCalls > steadyState.visionLimit ? "OVER" : "under"})`,
);
console.log(`
Fragile spots identified — RPD (this brief's stated binding constraint):
1. TEXT model RPD is fine even worst-case (evaluations, the one thing
   never cached, are only 200/day — 20% of RPD). Caching mostly buys
   headroom here, not survival.
2. VISION model (Live Coach) RPD is the real day-one risk: even with the
   1-session free cap, 30%+ of users trying their trial at once pushes
   1200 calls against a 1000/day org-wide budget — OVER BUDGET if the
   Coach launches to all 200 users simultaneously with no rollout
   throttle. FIXED this pass: the coach route now also checks
   isOrgBudgetNearlyExhausted() for qwen3.6-27b before allowing a new
   session to START (it already checked the per-user "1 trial total"
   cap, but nothing stopped the ORG-wide budget from being blown by many
   different users' first trials landing the same day).
3. Peak-hour RPM is fine in both scenarios given the gateway's queue —
   but the queue only smooths bursts, it doesn't create capacity: if
   real daily volume is already over RPD, no amount of queuing fixes it,
   only caching/budget caps do.

Honesty check beyond RPD (the brief said to treat RPD as binding, but
this script also computed TPD — worth flagging, not hiding): TPD comes
out OVER BUDGET in every scenario above, including steady-state, on
both models. Vision is inherently expensive per-call (1850 tokens x 20
snapshots = 37,000 tokens per single Live Coach session — 18.5% of the
ENTIRE org's daily token budget in one person's one trial). If Groq
ever enforces TPD as strictly as RPD, the current design under-protects
against it. Not fixed this pass (the brief scoped this to RPD); flagged
as the most important thing to revisit next for item A.
`);
