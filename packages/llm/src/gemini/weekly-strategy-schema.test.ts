import { describe, expect, it } from "vitest";
import { geminiWeeklyStrategyResponseJsonSchema } from "./weekly-strategy-schema";

describe("geminiWeeklyStrategyResponseJsonSchema", () => {
  it("returns an inlined object schema (not a dangling $ref)", () => {
    const schema = geminiWeeklyStrategyResponseJsonSchema();
    expect(schema.$ref).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    expect(schema.$schema).toBeUndefined();

    const properties = schema.properties as Record<string, unknown>;
    expect(properties.strategySummary).toBeDefined();
    expect(properties.days).toBeDefined();
    expect(properties.sharedIngredientIntents).toBeDefined();
  });
});
