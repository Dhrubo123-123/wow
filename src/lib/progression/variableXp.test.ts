import { describe, it, expect } from "vitest";
import {
  xpTierForScore,
  tierBonusXp,
  isCriticalHit,
  CRIT_BONUS_XP,
  streakMilestoneBonusXp,
} from "./variableXp";

describe("xpTierForScore", () => {
  it("maps score ranges to tiers", () => {
    expect(xpTierForScore(50)).toBe("bronze");
    expect(xpTierForScore(74)).toBe("bronze");
    expect(xpTierForScore(75)).toBe("silver");
    expect(xpTierForScore(89)).toBe("silver");
    expect(xpTierForScore(90)).toBe("gold");
    expect(xpTierForScore(100)).toBe("gold");
  });
});

describe("tierBonusXp", () => {
  it("gives no bonus at bronze", () => {
    expect(tierBonusXp(100, "bronze")).toBe(0);
  });

  it("scales with tier rate", () => {
    expect(tierBonusXp(100, "silver")).toBe(10);
    expect(tierBonusXp(100, "gold")).toBe(20);
  });

  it("never exceeds the absolute cap regardless of base size", () => {
    expect(tierBonusXp(10000, "gold")).toBe(40);
  });
});

describe("isCriticalHit", () => {
  it("hits below the crit chance threshold", () => {
    expect(isCriticalHit(0)).toBe(true);
    expect(isCriticalHit(0.11)).toBe(true);
  });

  it("misses at or above the crit chance threshold", () => {
    expect(isCriticalHit(0.12)).toBe(false);
    expect(isCriticalHit(0.99)).toBe(false);
  });

  it("has a fixed flat bonus", () => {
    expect(CRIT_BONUS_XP).toBe(25);
  });
});

describe("streakMilestoneBonusXp", () => {
  it("pays out only on exact milestone days", () => {
    expect(streakMilestoneBonusXp(7)).toBe(50);
    expect(streakMilestoneBonusXp(30)).toBe(150);
    expect(streakMilestoneBonusXp(100)).toBe(500);
  });

  it("is zero on any other day", () => {
    expect(streakMilestoneBonusXp(6)).toBe(0);
    expect(streakMilestoneBonusXp(8)).toBe(0);
    expect(streakMilestoneBonusXp(0)).toBe(0);
  });
});
