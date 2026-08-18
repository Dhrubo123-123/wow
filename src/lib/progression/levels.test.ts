import { describe, it, expect } from "vitest";
import {
  calculateXPForLevel,
  calculateTotalXPForLevel,
  calculateLevel,
  calculateProgress,
  xpForNextLevel,
} from "./levels";

describe("calculateXPForLevel", () => {
  it("grows by 50 per level, starting at 100", () => {
    expect(calculateXPForLevel(1)).toBe(100);
    expect(calculateXPForLevel(2)).toBe(150);
    expect(calculateXPForLevel(3)).toBe(200);
  });

  it("rejects level < 1", () => {
    expect(() => calculateXPForLevel(0)).toThrow();
  });
});

describe("calculateLevel", () => {
  it("stays at level 1 below the first threshold", () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(99)).toBe(1);
  });

  it("advances exactly at each cumulative threshold", () => {
    expect(calculateLevel(100)).toBe(2);
    expect(calculateLevel(249)).toBe(2);
    expect(calculateLevel(250)).toBe(3); // 100 + 150
  });

  it("clamps negative XP to 0 (never a negative level)", () => {
    expect(calculateLevel(-50)).toBe(1);
  });
});

describe("calculateTotalXPForLevel", () => {
  it("is 0 for level 1", () => {
    expect(calculateTotalXPForLevel(1)).toBe(0);
  });

  it("matches the sum of prior levels' requirements", () => {
    expect(calculateTotalXPForLevel(3)).toBe(250); // 100 + 150
  });
});

describe("calculateProgress", () => {
  it("reports exact in-level progress", () => {
    const progress = calculateProgress(120);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(20);
    expect(progress.xpNeeded).toBe(150);
    expect(progress.progressPct).toBe(Math.round((20 / 150) * 100));
  });

  it("never exceeds 100%", () => {
    const progress = calculateProgress(0);
    expect(progress.progressPct).toBeLessThanOrEqual(100);
  });
});

describe("xpForNextLevel", () => {
  it("matches calculateProgress for a consistent (totalXp, level) pair", () => {
    const totalXp = 320;
    const full = calculateProgress(totalXp);
    const quick = xpForNextLevel(totalXp, full.level);
    expect(quick.xpIntoLevel).toBe(full.xpIntoLevel);
    expect(quick.xpNeeded).toBe(full.xpNeeded);
  });
});
