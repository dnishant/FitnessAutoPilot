import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assertNoJsonSchemaRefs,
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
