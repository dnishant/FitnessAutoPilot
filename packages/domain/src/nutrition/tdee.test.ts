import { describe, expect, it } from "vitest";
import { TdeeValidationPolicy } from "@fitness-autopilot/contracts";
import {
  appendTdeeEstimate,
  createTdeeFromWearable,
  formatTdeeKcalPerDay,
  selectCurrentTdee,
  TDEE_ALGORITHM_NAME,
  TDEE_ALGORITHM_VERSION,
  tdeeHomeSourceLabel,
  tdeeResultSourceLabel,
} from "./tdee";

const asOf = new Date("2026-09-07T00:00:00.000Z");

describe("createTdeeFromWearable", () => {
  it("uses Whoop average daily calories as TDEE", () => {
    const result = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      asOf,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        tdeeKcal: 2800,
        source: "whoop_daily_calories",
        wearable: "whoop",
        wearableCaloriesKcal: 2800,
        rmrKcalUsed: null,
        algorithmName: null,
        algorithmVersion: null,
        inputSnapshot: {
          wearable: "whoop",
          wearableCaloriesKcal: 2800,
          rmrKcal: 1750,
          rmrSource: "estimated_mifflin_st_jeor",
          goalType: "muscle_gain",
        },
        calculatedAt: asOf.toISOString(),
      },
    });
  });

  it("adds Apple Watch active calories to the established RMR", () => {
    // 650 + 1750 = 2400
    const result = createTdeeFromWearable({
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.tdeeKcal).toBe(2400);
    expect(result.value.source).toBe("apple_watch_active_plus_rmr");
    expect(result.value.rmrKcalUsed).toBe(1750);
    expect(result.value.algorithmName).toBe(TDEE_ALGORITHM_NAME);
    expect(result.value.algorithmVersion).toBe(TDEE_ALGORITHM_VERSION);
  });

  it("uses a DEXA RMR when that is the established current RMR", () => {
    // 400 + 1782 = 2182
    const result = createTdeeFromWearable({
      wearable: "apple_watch",
      wearableCaloriesKcal: 400,
      rmrKcal: 1782,
      rmrSource: "user_reported_dexa",
      goalType: "recomposition",
      asOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.tdeeKcal).toBe(2182);
    expect(result.value.inputSnapshot.rmrSource).toBe("user_reported_dexa");
  });

  it("rounds a fractional Whoop daily-calorie input half-up", () => {
    const result = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2800.5,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "recomposition",
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.wearableCaloriesKcal).toBe(2801);
      expect(result.value.tdeeKcal).toBe(2801);
    }
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      wearable: "apple_watch" as const,
      wearableCaloriesKcal: 650,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor" as const,
      goalType: "muscle_gain" as const,
      asOf,
    };
    expect(createTdeeFromWearable(input)).toEqual(createTdeeFromWearable(input));
  });

  it("rejects calories below the supported range", () => {
    const result = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: TdeeValidationPolicy.wearableCaloriesKcal.min - 1,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("wearableCaloriesKcal");
    }
  });

  it("rejects calories above the supported range", () => {
    const result = createTdeeFromWearable({
      wearable: "apple_watch",
      wearableCaloriesKcal: TdeeValidationPolicy.wearableCaloriesKcal.max + 1,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive calorie input", () => {
    const result = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 0,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("wearableCaloriesKcal");
    }
  });
});

describe("TDEE history", () => {
  it("appends a new estimate without mutating the previous record", () => {
    const first = createTdeeFromWearable({
      wearable: "whoop",
      wearableCaloriesKcal: 2800,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "muscle_gain",
      asOf,
    });
    const second = createTdeeFromWearable({
      wearable: "apple_watch",
      wearableCaloriesKcal: 650,
      rmrKcal: 1750,
      rmrSource: "estimated_mifflin_st_jeor",
      goalType: "fat_loss",
      asOf: new Date("2026-09-07T01:00:00.000Z"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const history = appendTdeeEstimate([], first.value);
    const snapshot = structuredClone(history[0]);
    const next = appendTdeeEstimate(history, second.value);

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(snapshot);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(snapshot);
    expect(selectCurrentTdee(next)?.source).toBe("apple_watch_active_plus_rmr");
    expect(selectCurrentTdee(next)?.tdeeKcal).toBe(2400);
  });
});

describe("TDEE display copy", () => {
  it("formats kcal/day and source labels", () => {
    expect(formatTdeeKcalPerDay(2400)).toBe("2,400 kcal/day");
    expect(tdeeResultSourceLabel("whoop_daily_calories")).toBe(
      "From your Whoop average daily calories",
    );
    expect(tdeeResultSourceLabel("apple_watch_active_plus_rmr")).toBe("Active calories + your RMR");
    expect(tdeeHomeSourceLabel("whoop_daily_calories")).toBe("Whoop");
    expect(tdeeHomeSourceLabel("apple_watch_active_plus_rmr")).toBe("Apple Watch + RMR");
  });
});
