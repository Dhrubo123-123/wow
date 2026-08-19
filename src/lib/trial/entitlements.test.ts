import { describe, it, expect } from "vitest";
import { getTrialStatus } from "./entitlements";

describe("getTrialStatus", () => {
  it("counts down whole days remaining", () => {
    const now = new Date("2026-08-19T00:00:00Z");
    const status = getTrialStatus("trial", "2026-08-22T00:00:00Z", now);
    expect(status.daysRemaining).toBe(3);
    expect(status.isExpired).toBe(false);
  });

  it("floors remaining days at 0 and marks expired trials", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    const status = getTrialStatus("trial", "2026-08-22T00:00:00Z", now);
    expect(status.daysRemaining).toBe(0);
    expect(status.isExpired).toBe(true);
  });

  it("never reports a full plan as expired regardless of trial_ends_at", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    const status = getTrialStatus("full", "2026-08-22T00:00:00Z", now);
    expect(status.isExpired).toBe(false);
  });
});
