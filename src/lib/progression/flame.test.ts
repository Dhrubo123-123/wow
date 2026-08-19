import { describe, it, expect } from "vitest";
import { getFlameTier } from "./flame";

describe("getFlameTier", () => {
  it("shows no flame at zero streak", () => {
    expect(getFlameTier(0).label).toBe("No streak yet");
  });

  it("escalates through tiers as the streak grows", () => {
    expect(getFlameTier(1).label).toBe("Spark");
    expect(getFlameTier(6).label).toBe("Spark");
    expect(getFlameTier(7).label).toBe("Fire");
    expect(getFlameTier(13).label).toBe("Fire");
    expect(getFlameTier(14).label).toBe("Blaze");
    expect(getFlameTier(29).label).toBe("Blaze");
    expect(getFlameTier(30).label).toBe("Inferno");
    expect(getFlameTier(99).label).toBe("Inferno");
    expect(getFlameTier(100).label).toBe("Eternal Flame");
    expect(getFlameTier(365).label).toBe("Eternal Flame");
  });

  it("adds the glow-pulse class only at Inferno tier and above", () => {
    expect(getFlameTier(29).className).not.toContain("animate-glow-pulse");
    expect(getFlameTier(30).className).toContain("animate-glow-pulse");
  });
});
