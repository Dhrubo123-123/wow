import { describe, it, expect } from "vitest";
import { nextStreakState } from "./streakLogic";

describe("nextStreakState", () => {
  it("starts a new streak at 1 for a first-ever activity", () => {
    const result = nextStreakState(null, "2026-08-18");
    expect(result).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it("does not double-count activity on the same day", () => {
    const result = nextStreakState(
      { currentStreak: 3, longestStreak: 5, lastActivityDate: "2026-08-18" },
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(3);
  });

  it("continues the streak exactly one day later", () => {
    const result = nextStreakState(
      { currentStreak: 3, longestStreak: 5, lastActivityDate: "2026-08-17" },
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(4);
  });

  it("resets to 1 after a gap bigger than one day", () => {
    const result = nextStreakState(
      { currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-08-10" },
      "2026-08-18",
    );
    expect(result.currentStreak).toBe(1);
  });

  it("tracks the longest streak independently of the current one resetting", () => {
    const result = nextStreakState(
      { currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-08-10" },
      "2026-08-18",
    );
    expect(result.longestStreak).toBe(6);
  });

  it("raises the longest streak when the current one surpasses it", () => {
    const result = nextStreakState(
      { currentStreak: 6, longestStreak: 6, lastActivityDate: "2026-08-17" },
      "2026-08-18",
    );
    expect(result).toEqual({ currentStreak: 7, longestStreak: 7 });
  });
});
