import { describe, it, expect } from "vitest";
import { nextStreakState, describeStreakRisk, type StreakRecord } from "./streakLogic";

function record(overrides: Partial<StreakRecord>): StreakRecord {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    freezesAvailable: 1,
    lastStreakBeforeBreak: null,
    streakBreakExpiresAt: null,
    earnbackRedemptions: 0,
    ...overrides,
  };
}

describe("nextStreakState", () => {
  it("starts a new streak at 1 for a first-ever activity", () => {
    const result = nextStreakState(null, "2026-08-18");
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.freezesAvailable).toBe(1);
  });

  it("does not double-count activity on the same day", () => {
    const result = nextStreakState(
      record({ currentStreak: 3, longestStreak: 5, lastActivityDate: "2026-08-18" }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(3);
  });

  it("continues the streak exactly one day later", () => {
    const result = nextStreakState(
      record({ currentStreak: 3, longestStreak: 5, lastActivityDate: "2026-08-17" }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(4);
    expect(result.freezeUsed).toBe(false);
  });

  it("resets to 1 after an unbridgeable gap with no freeze available", () => {
    const result = nextStreakState(
      record({
        currentStreak: 6,
        longestStreak: 6,
        lastActivityDate: "2026-08-10",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(1);
  });

  it("tracks the longest streak independently of the current one resetting", () => {
    const result = nextStreakState(
      record({
        currentStreak: 6,
        longestStreak: 6,
        lastActivityDate: "2026-08-10",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.longestStreak).toBe(6);
  });

  it("raises the longest streak when the current one surpasses it", () => {
    const result = nextStreakState(
      record({ currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-08-17" }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(7);
    expect(result.longestStreak).toBe(7);
  });

  it("spends a freeze to silently bridge exactly one missed day", () => {
    const result = nextStreakState(
      record({
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: "2026-08-16", // 2 days before "today" = one missed day
        freezesAvailable: 1,
      }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(6);
    expect(result.freezeUsed).toBe(true);
    expect(result.freezesAvailable).toBe(0);
  });

  it("does not spend a freeze that isn't available — resets instead", () => {
    const result = nextStreakState(
      record({
        currentStreak: 5,
        longestStreak: 5,
        lastActivityDate: "2026-08-16",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(1);
    expect(result.freezeUsed).toBe(false);
  });

  it("opens an earn-back window when a meaningful streak breaks", () => {
    const result = nextStreakState(
      record({
        currentStreak: 10,
        longestStreak: 10,
        lastActivityDate: "2026-08-01",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(1);
    expect(result.lastStreakBeforeBreak).toBe(10);
    expect(result.streakBreakExpiresAt).toBe("2026-08-20");
    expect(result.earnbackRedemptions).toBe(0);
  });

  it("does not open an earn-back window for a trivial (1-day) streak breaking", () => {
    const result = nextStreakState(
      record({
        currentStreak: 1,
        longestStreak: 3,
        lastActivityDate: "2026-08-01",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.lastStreakBeforeBreak).toBeNull();
    expect(result.streakBreakExpiresAt).toBeNull();
  });

  it("requires a SECOND redemption before restoring a broken streak", () => {
    const first = nextStreakState(
      record({
        currentStreak: 1,
        longestStreak: 10,
        lastActivityDate: "2026-08-18",
        lastStreakBeforeBreak: 10,
        streakBreakExpiresAt: "2026-08-20",
        earnbackRedemptions: 0,
      }),
      "2026-08-19",
    );
    // One redemption isn't enough — no free ride.
    expect(first.streakEarnedBack).toBe(false);
    expect(first.currentStreak).toBe(1);
    expect(first.earnbackRedemptions).toBe(1);
    expect(first.lastStreakBeforeBreak).toBe(10); // window stays open

    const second = nextStreakState(
      record({
        currentStreak: 1,
        longestStreak: 10,
        lastActivityDate: "2026-08-19",
        lastStreakBeforeBreak: first.lastStreakBeforeBreak,
        streakBreakExpiresAt: first.streakBreakExpiresAt,
        earnbackRedemptions: first.earnbackRedemptions,
      }),
      "2026-08-19", // same day — both quests done in one sitting
    );
    expect(second.streakEarnedBack).toBe(true);
    expect(second.currentStreak).toBe(11);
    expect(second.lastStreakBeforeBreak).toBeNull();
    expect(second.earnbackRedemptions).toBe(0);
  });

  it("does not restore a broken streak once the earn-back window has expired", () => {
    const result = nextStreakState(
      record({
        currentStreak: 1,
        longestStreak: 10,
        lastActivityDate: "2026-08-18",
        lastStreakBeforeBreak: 10,
        streakBreakExpiresAt: "2026-08-19",
      }),
      "2026-08-21", // past the window
    );
    expect(result.streakEarnedBack).toBe(false);
    expect(result.currentStreak).toBe(1);
  });

  it("replenishes a freeze (capped at 2) every 7-day streak milestone", () => {
    const result = nextStreakState(
      record({
        currentStreak: 6,
        longestStreak: 6,
        lastActivityDate: "2026-08-17",
        freezesAvailable: 0,
      }),
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(7);
    expect(result.freezesAvailable).toBe(1);
  });

  it("never grows freezes past the cap of 2", () => {
    const result = nextStreakState(
      record({
        currentStreak: 6,
        longestStreak: 6,
        lastActivityDate: "2026-08-17",
        freezesAvailable: 2,
      }),
      "2026-08-18",
    );
    expect(result.freezesAvailable).toBe(2);
  });
});

describe("describeStreakRisk", () => {
  it("is safe for a brand-new user", () => {
    expect(describeStreakRisk(null, "2026-08-18").level).toBe("safe");
  });

  it("is safe once today's activity is already logged", () => {
    const risk = describeStreakRisk(
      record({ currentStreak: 5, lastActivityDate: "2026-08-18" }),
      "2026-08-18",
    );
    expect(risk.level).toBe("safe");
  });

  it("is safe the normal day after activity, before today's quest is done", () => {
    const risk = describeStreakRisk(
      record({ currentStreak: 5, lastActivityDate: "2026-08-17" }),
      "2026-08-18",
    );
    expect(risk.level).toBe("safe");
  });

  it("shows the freeze-will-cover message when a freeze can bridge today — never a panic message", () => {
    const risk = describeStreakRisk(
      record({ currentStreak: 5, lastActivityDate: "2026-08-16", freezesAvailable: 1 }),
      "2026-08-18",
    );
    expect(risk.level).toBe("freeze-will-cover");
    expect(risk.message).toContain("❄️");
    expect(risk.message.toLowerCase()).not.toContain("no freeze");
  });

  it("shows an at-risk message when no freeze is available to cover today", () => {
    const risk = describeStreakRisk(
      record({ currentStreak: 5, lastActivityDate: "2026-08-16", freezesAvailable: 0 }),
      "2026-08-18",
    );
    expect(risk.level).toBe("at-risk");
  });

  it("shows earn-back progress instead of a generic at-risk message when a window is open", () => {
    const risk = describeStreakRisk(
      record({
        currentStreak: 1,
        lastActivityDate: "2026-08-18",
        lastStreakBeforeBreak: 10,
        streakBreakExpiresAt: "2026-08-20",
        earnbackRedemptions: 0,
      }),
      "2026-08-19",
    );
    expect(risk.level).toBe("earnback-in-progress");
    expect(risk.message).toContain("10-day streak");
  });

  it("is safe once the gap is too large for a freeze to matter (past saving today specifically)", () => {
    const risk = describeStreakRisk(
      record({ currentStreak: 5, lastActivityDate: "2026-08-10", freezesAvailable: 1 }),
      "2026-08-18",
    );
    expect(risk.level).toBe("safe");
  });
});
