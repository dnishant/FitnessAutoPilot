import { describe, expect, it } from "vitest";
import { kgToLb, lbToKg } from "./units";

describe("kg/lb conversion", () => {
  it("round-trips 180 lb through kilograms", () => {
    const kg = lbToKg(180);
    expect(kgToLb(kg)).toBeCloseTo(180, 10);
  });

  it("uses the international pound", () => {
    expect(lbToKg(1)).toBe(0.45359237);
    expect(kgToLb(0.45359237)).toBeCloseTo(1, 10);
  });
});
