import { describe, expect, it } from "vitest";
import {
  buildPreferenceFingerprint,
  checkpointResumeProgressStage,
  isCheckpointUsable,
  parsePlanGenerationCheckpoint,
  type PlanGenerationCheckpointV1,
} from "./plan-generation-checkpoint";

function baseCheckpoint(
  overrides: Partial<PlanGenerationCheckpointV1> = {},
): PlanGenerationCheckpointV1 {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    weekStart: "2026-09-15",
    preferenceFingerprint: "fp-1",
    completedStage: "composed",
    lunchCandidates: [],
    dinnerCandidates: [],
    lunchRanked: [],
    dinnerRanked: [],
    conceptsByCandidateId: { a: {} as never },
    ...overrides,
  };
}

describe("plan generation checkpoint", () => {
  it("builds a stable preference fingerprint", () => {
    const a = buildPreferenceFingerprint({
      nutritionTargetId: "nt-1",
      cuisines: ["mexican", "indian"],
      allergies: ["peanuts"],
      varietyLevel: "balanced",
    });
    const b = buildPreferenceFingerprint({
      nutritionTargetId: "nt-1",
      cuisines: ["indian", "mexican"],
      allergies: ["peanuts"],
      varietyLevel: "balanced",
    });
    expect(a).toBe(b);
  });

  it("rejects stale or mismatched checkpoints", () => {
    const fresh = baseCheckpoint();
    expect(
      isCheckpointUsable({
        checkpoint: fresh,
        preferenceFingerprint: "fp-1",
        weekStart: "2026-09-15",
      }),
    ).toBeTruthy();

    expect(
      isCheckpointUsable({
        checkpoint: fresh,
        preferenceFingerprint: "other",
        weekStart: "2026-09-15",
      }),
    ).toBeNull();

    expect(
      isCheckpointUsable({
        checkpoint: baseCheckpoint({
          savedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        }),
        preferenceFingerprint: "fp-1",
        weekStart: "2026-09-15",
      }),
    ).toBeNull();
  });

  it("parses valid checkpoint JSON and maps resume progress stage", () => {
    const raw = JSON.stringify(baseCheckpoint({ completedStage: "strategy" }));
    const parsed = parsePlanGenerationCheckpoint(raw);
    expect(parsed?.completedStage).toBe("strategy");
    expect(checkpointResumeProgressStage("ranked")).toBe("building_complete_meals");
    expect(checkpointResumeProgressStage("strategy")).toBe("finalizing_recipes");
  });
});
