import { describe, expect, it } from "vitest";
import {
  CompleteRmrOnboardingRequestSchema,
  ProfileBasicsSchema,
  RmrEstimateSchema,
  RmrValidationPolicy,
} from "./rmr";

describe("RmrValidationPolicy", () => {
  it("exposes named bounds rather than medical claims", () => {
    expect(RmrValidationPolicy.heightCm.min).toBeGreaterThan(0);
    expect(RmrValidationPolicy.weightKg.min).toBeGreaterThan(0);
    expect(RmrValidationPolicy.rmrKcal.min).toBeGreaterThan(0);
  });
});

describe("ProfileBasicsSchema", () => {
  it("accepts RMR onboarding fields only", () => {
    const result = ProfileBasicsSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      dateOfBirth: "1990-05-01",
      biologicalSex: "female",
      heightCm: 165,
      weightKg: 68,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported biological sex for RMR", () => {
    const result = ProfileBasicsSchema.safeParse({
      userId: "11111111-1111-1111-1111-111111111111",
      dateOfBirth: "1990-05-01",
      biologicalSex: "other",
      heightCm: 165,
      weightKg: 68,
    });
    expect(result.success).toBe(false);
  });
});

describe("RmrEstimateSchema", () => {
  it("requires null algorithm fields for a DEXA report", () => {
    const result = RmrEstimateSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111112",
      userId: "11111111-1111-1111-1111-111111111111",
      rmrKcal: 1782,
      source: "user_reported_dexa",
      algorithmName: null,
      algorithmVersion: null,
      inputSnapshot: null,
      reportedOrMeasuredAt: "2026-01-15",
      calculatedAt: "2026-09-07T00:00:00.000Z",
      createdAt: "2026-09-07T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("CompleteRmrOnboardingRequestSchema", () => {
  it("accepts an estimated-path request", () => {
    const result = CompleteRmrOnboardingRequestSchema.safeParse({
      dateOfBirth: "1990-05-01",
      biologicalSex: "male",
      heightCm: 180,
      weightKg: 80,
      source: "estimated_mifflin_st_jeor",
    });
    expect(result.success).toBe(true);
  });
});
