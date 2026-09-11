import { describe, expect, it } from "vitest";
import { geminiRecipeResponseJsonSchema } from "./schema";

describe("geminiRecipeResponseJsonSchema", () => {
  it("returns an inlined object schema (not a dangling $ref)", () => {
    const schema = geminiRecipeResponseJsonSchema();
    expect(schema.$ref).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    expect(schema.$schema).toBeUndefined();
  });
});
