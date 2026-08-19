import { describe, it, expect } from "vitest";
import { isFriday, fridayAdjustedMinutes } from "./fridayShortening";

describe("isFriday", () => {
  it("identifies Friday by UTC day", () => {
    expect(isFriday(new Date("2026-08-21T12:00:00Z"))).toBe(true); // Friday
    expect(isFriday(new Date("2026-08-20T12:00:00Z"))).toBe(false); // Thursday
  });
});

describe("fridayAdjustedMinutes", () => {
  it("caps long quests down to the Friday max", () => {
    expect(fridayAdjustedMinutes(45, new Date("2026-08-21T12:00:00Z"))).toBe(10);
  });

  it("leaves already-short quests untouched on Friday", () => {
    expect(fridayAdjustedMinutes(5, new Date("2026-08-21T12:00:00Z"))).toBe(5);
  });

  it("leaves quests untouched on any other day", () => {
    expect(fridayAdjustedMinutes(45, new Date("2026-08-20T12:00:00Z"))).toBe(45);
  });
});
