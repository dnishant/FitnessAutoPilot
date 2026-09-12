import { describe, expect, it } from "vitest";
import { assertNoJsonSchemaRefs } from "./json-schema";
import { geminiRecipeResponseJsonSchema } from "./schema";
import { geminiWeeklyStrategyResponseJsonSchema } from "./weekly-strategy-schema";

describe("geminiRecipeResponseJsonSchema", () => {
  it("returns an inlined object schema (not a dangling $ref)", () => {
    const schema = geminiRecipeResponseJsonSchema();
    expect(schema.$ref).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    expect(schema.$schema).toBeUndefined();
    expect(() => assertNoJsonSchemaRefs(schema)).not.toThrow();
  });
});

describe("geminiWeeklyStrategyResponseJsonSchema", () => {
  it("returns an inlined object schema (not a dangling $ref)", () => {
    const schema = geminiWeeklyStrategyResponseJsonSchema();
    expect(schema.$ref).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    expect(schema.$schema).toBeUndefined();
    expect(() => assertNoJsonSchemaRefs(schema)).not.toThrow();
  });

  it("does not emit anyOf null unions Gemini rejects", () => {
    const schema = geminiWeeklyStrategyResponseJsonSchema();
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('"anyOf"');
    expect(serialized).not.toContain('"type":"null"');
    expect(serialized).not.toContain("exclusiveMinimum");
  });
});

describe("geminiRecipeResponseJsonSchema exclusive bounds", () => {
  it("does not emit exclusiveMinimum Gemini rejects", () => {
    const schema = geminiRecipeResponseJsonSchema();
    expect(JSON.stringify(schema)).not.toContain("exclusiveMinimum");
  });
});
