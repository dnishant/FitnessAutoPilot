import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Convert a Zod schema into a Gemini-compatible JSON Schema root object.
 *
 * Gemini structured output requires an inlined object schema. Passing `name`
 * to zod-to-json-schema returns `{ $ref, definitions }` — deleting
 * `definitions` then leaves a dangling top-level `$ref`, which Gemini rejects
 * immediately (~100–200ms LLM_PROVIDER_ERROR).
 *
 * Rules:
 * - Never pass `name` (forces a definition wrapper)
 * - Always use `$refStrategy: "none"` (inline nested schemas)
 * - Strip `$schema` / `definitions` / `$defs` meta keys Gemini rejects
 * - Fail loud if any `$ref` remains anywhere in the tree
 */
export function zodToGeminiJsonSchema(
  zodSchema: ZodTypeAny,
): Record<string, unknown> {
  const schema = zodToJsonSchema(zodSchema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

  delete schema.$schema;
  delete schema.definitions;
  delete schema.$defs;

  assertNoJsonSchemaRefs(schema);

  return schema;
}

export function assertNoJsonSchemaRefs(
  value: unknown,
  path = "$",
): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoJsonSchemaRefs(value[i], `${path}[${i}]`);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.$ref !== undefined) {
    throw new Error(
      `Gemini response schema must be fully inlined; found $ref at ${path}.`,
    );
  }

  for (const [key, child] of Object.entries(record)) {
    assertNoJsonSchemaRefs(child, `${path}.${key}`);
  }
}
