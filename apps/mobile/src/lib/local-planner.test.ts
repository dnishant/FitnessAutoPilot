import { describe, expect, it } from "vitest";
import { createEstimatedRmr, createUserReportedRmr } from "@fitness-autopilot/domain";
import { ensureLocalUser, localSaveProfile, localSaveRmrEstimate } from "./local-planner";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("local RMR persistence", () => {
  it("stores algorithm metadata and does not mutate prior rows", () => {
    const store = ensureLocalUser("rmr-history@example.com", "test-password");
    localSaveProfile(store.userId, {
      userId: store.userId,
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
    });

    const firstDraft = createEstimatedRmr({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      asOf,
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) {
      return;
    }
    const first = localSaveRmrEstimate(store.userId, firstDraft.value);
    const firstSnapshot = structuredClone(first);

    expect(first.algorithmVersion).toBe("rmr-v1");
    expect(first.inputSnapshot).toEqual({
      dateOfBirth: "1990-03-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      ageYears: 36,
    });

    const secondDraft = createUserReportedRmr({
      rmrKcal: 1782,
      reportDate: "2026-01-15",
      asOf: new Date("2026-09-07T02:00:00.000Z"),
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) {
      return;
    }
    localSaveRmrEstimate(store.userId, secondDraft.value);

    expect(store.rmrHistory).toHaveLength(2);
    expect(store.rmrHistory[0]).toEqual(firstSnapshot);
    expect(store.currentRmr?.source).toBe("user_reported_dexa");
    expect(store.currentRmr?.rmrKcal).toBe(1782);
  });
});
