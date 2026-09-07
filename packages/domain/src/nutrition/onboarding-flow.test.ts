import { describe, expect, it } from "vitest";
import {
  chooseOnboardingRmrSource,
  createOnboardingView,
  submitOnboardingBasics,
  submitOnboardingDexa,
} from "./onboarding-flow";

const asOf = new Date("2026-09-07T00:00:00.000Z");

const validBasics = {
  dateOfBirth: "1990-03-01",
  biologicalSex: "male" as const,
  heightCm: "180",
  weightKg: "80",
};

describe("RMR onboarding flow", () => {
  it("walks the estimated path to a labeled result", () => {
    let view = createOnboardingView(validBasics);
    view = submitOnboardingBasics(view, asOf);
    expect(view.step).toBe("source");
    expect(view.error).toBeNull();

    view = chooseOnboardingRmrSource(view, false, asOf);
    expect(view.step).toBe("result");
    expect(view.result?.rmrKcal).toBe(1750);
    expect(view.result?.formattedRmr).toBe("1,750 kcal/day");
    expect(view.result?.source).toBe("estimated_mifflin_st_jeor");
    expect(view.result?.sourceLabel).toBe("Estimated using Mifflin-St Jeor");
    expect(view.result?.explanation).toMatch(/energy your body uses at rest/);
  });

  it("walks the DEXA path to a labeled result", () => {
    let view = createOnboardingView({
      ...validBasics,
      reportedRmrKcal: "1782",
      reportDate: "2026-01-15",
    });
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, true, asOf);
    expect(view.step).toBe("dexa_details");

    view = submitOnboardingDexa(view, asOf);
    expect(view.step).toBe("result");
    expect(view.result?.rmrKcal).toBe(1782);
    expect(view.result?.formattedRmr).toBe("1,782 kcal/day");
    expect(view.result?.source).toBe("user_reported_dexa");
    expect(view.result?.sourceLabel).toBe("From your DEXA/body-composition report");
  });

  it("surfaces validation errors on basics", () => {
    let view = createOnboardingView({
      ...validBasics,
      dateOfBirth: "2027-01-01",
    });
    view = submitOnboardingBasics(view, asOf);
    expect(view.step).toBe("basics");
    expect(view.error).toMatch(/future/i);
  });

  it("surfaces validation errors on the DEXA form", () => {
    let view = createOnboardingView({
      ...validBasics,
      reportedRmrKcal: "1782",
      reportDate: "2026-12-01",
    });
    view = submitOnboardingBasics(view, asOf);
    view = chooseOnboardingRmrSource(view, true, asOf);
    view = submitOnboardingDexa(view, asOf);
    expect(view.step).toBe("dexa_details");
    expect(view.error).toMatch(/future/i);
    expect(view.result).toBeNull();
  });
});
