import { describe, it, expect } from "vitest";
import {
  canTransitionQuest,
  canTransitionQuestAttempt,
  isTerminalQuestStatus,
  USER_SETTABLE_QUEST_STATUSES,
} from "./transitions";

describe("canTransitionQuest", () => {
  it("allows every legal forward step in the lifecycle", () => {
    expect(canTransitionQuest("available", "accepted")).toBe(true);
    expect(canTransitionQuest("accepted", "in_progress")).toBe(true);
    expect(canTransitionQuest("in_progress", "submitted")).toBe(true);
    expect(canTransitionQuest("submitted", "under_review")).toBe(true);
    expect(canTransitionQuest("under_review", "completed")).toBe(true);
    expect(canTransitionQuest("under_review", "failed")).toBe(true);
  });

  it("rejects skipping a step", () => {
    expect(canTransitionQuest("available", "in_progress")).toBe(false);
    expect(canTransitionQuest("available", "completed")).toBe(false);
    expect(canTransitionQuest("submitted", "completed")).toBe(false);
  });

  it("rejects reversal", () => {
    expect(canTransitionQuest("in_progress", "accepted")).toBe(false);
    expect(canTransitionQuest("completed", "available")).toBe(false);
  });

  it("has no transitions out of a terminal state", () => {
    expect(canTransitionQuest("completed", "failed")).toBe(false);
    expect(canTransitionQuest("failed", "completed")).toBe(false);
  });
});

describe("isTerminalQuestStatus", () => {
  it("is true only for completed/failed", () => {
    expect(isTerminalQuestStatus("completed")).toBe(true);
    expect(isTerminalQuestStatus("failed")).toBe(true);
    expect(isTerminalQuestStatus("available")).toBe(false);
    expect(isTerminalQuestStatus("under_review")).toBe(false);
  });
});

describe("USER_SETTABLE_QUEST_STATUSES", () => {
  it("excludes the server-only outcomes (matches the RLS check constraint)", () => {
    expect(USER_SETTABLE_QUEST_STATUSES).not.toContain("completed");
    expect(USER_SETTABLE_QUEST_STATUSES).not.toContain("failed");
    expect(USER_SETTABLE_QUEST_STATUSES).not.toContain("under_review");
    expect(USER_SETTABLE_QUEST_STATUSES).not.toContain("available");
  });
});

describe("canTransitionQuestAttempt", () => {
  it("allows the legal steps", () => {
    expect(canTransitionQuestAttempt("in_progress", "submitted")).toBe(true);
    expect(canTransitionQuestAttempt("submitted", "completed")).toBe(true);
    expect(canTransitionQuestAttempt("submitted", "failed")).toBe(true);
  });

  it("rejects skipping straight to a result", () => {
    expect(canTransitionQuestAttempt("in_progress", "completed")).toBe(false);
  });
});
