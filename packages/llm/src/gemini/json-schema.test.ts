import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assertNoJsonSchemaRefs,
  sanitizeGeminiJsonSchema,
  zodToGeminiJsonSchema,
} from "./json-schema";

describe("zodToGeminiJsonSchema", () => {
  it("returns an inlined object schema without meta wrappers", () => {
    const schema = zodToGeminiJsonSchema(
      z.object({
        name: z.string().min(1),
        tags: z.array(z.string()).optional(),
      }),
    );

    expect(schema.$ref).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    expect(schema.$schema).toBeUndefined();
  });

  it("inlines nested object schemas (no $ref anywhere)", () => {
    const nested = z.object({ id: z.string().min(1) });
    const schema = zodToGeminiJsonSchema(
      z.object({
        items: z.array(nested).min(1),
      }),
    );

    expect(() => assertNoJsonSchemaRefs(schema)).not.toThrow();
    const properties = schema.properties as Record<string, unknown>;
    const items = properties.items as Record<string, unknown>;
    expect(items.$ref).toBeUndefined();
  });

  it("rewrites Zod nullable unions to OpenAPI nullable", () => {
    const schema = zodToGeminiJsonSchema(
      z.object({
        repeatOfConceptId: z.string().min(1).max(80).nullable().optional(),
      }),
    );

    const properties = schema.properties as Record<string, unknown>;
    const field = properties.repeatOfConceptId as Record<string, unknown>;
    expect(field.anyOf).toBeUndefined();
    expect(field.type).toBe("string");
    expect(field.nullable).toBe(true);
    expect(JSON.stringify(schema)).not.toContain('"anyOf"');
  });

  it("rewrites exclusiveMinimum from positive() to minimum", () => {
    const schema = zodToGeminiJsonSchema(
      z.object({
        quantityGrams: z.number().positive(),
      }),
    );

    const properties = schema.properties as Record<string, unknown>;
    const field = properties.quantityGrams as Record<string, unknown>;
    expect(field.exclusiveMinimum).toBeUndefined();
    expect(field.minimum).toBe(0);
  });
});

describe("sanitizeGeminiJsonSchema", () => {
  it("collapses anyOf string|null branches", () => {
    const sanitized = sanitizeGeminiJsonSchema({
      type: "object",
      properties: {
        id: {
          anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
        },
      },
    }) as Record<string, unknown>;

    const properties = sanitized.properties as Record<string, unknown>;
    const id = properties.id as Record<string, unknown>;
    expect(id).toEqual({ type: "string", minLength: 1, nullable: true });
  });

  it("collapses type arrays that include null", () => {
    const sanitized = sanitizeGeminiJsonSchema({
      type: ["string", "null"],
      minLength: 1,
    }) as Record<string, unknown>;

    expect(sanitized).toEqual({
      type: "string",
      minLength: 1,
      nullable: true,
    });
  });

  it("strips maxItems which Gemini 3.x responseJsonSchema rejects", () => {
    const sanitized = sanitizeGeminiJsonSchema({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 12,
    }) as Record<string, unknown>;

    expect(sanitized.maxItems).toBeUndefined();
    expect(sanitized.minItems).toBe(1);
    expect(sanitized.type).toBe("array");
  });
});

describe("assertNoJsonSchemaRefs", () => {
  it("throws when a dangling $ref is present", () => {
    expect(() =>
      assertNoJsonSchemaRefs({
        $ref: "#/definitions/Payload",
      }),
    ).toThrow(/\$ref at \$/);
  });

  it("throws when a nested $ref is present", () => {
    expect(() =>
      assertNoJsonSchemaRefs({
        type: "object",
        properties: {
          day: { $ref: "#/definitions/Day" },
        },
      }),
    ).toThrow(/\$ref at \$\.properties\.day/);
  });
});
