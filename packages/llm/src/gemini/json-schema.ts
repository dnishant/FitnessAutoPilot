import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Convert a Zod schema into a Gemini-compatible JSON Schema root object.
 *
 * Gemini structured output is picky. Known failure modes we normalize here:
 * - Passing `name` to zod-to-json-schema → `{ $ref, definitions }`; stripping
 *   definitions leaves a dangling `$ref` → immediate LLM_PROVIDER_ERROR.
 * - Zod `.nullable()` → `anyOf: [{ type: T }, { type: "null" }]`, which Gemini
 *   often rejects with opaque `400 INVALID_ARGUMENT`. Prefer
 *   `{ type: T, nullable: true }` (OpenAPI-style) instead.
 * - Zod `.positive()` → `exclusiveMinimum`, which Gemini often rejects; rewrite
 *   to inclusive `minimum`.
 *
 * Rules:
 * - Never pass `name`
 * - Always `$refStrategy: "none"`
 * - Strip meta keys (`$schema` / `definitions` / `$defs` / `$id`)
 * - Normalize nullables + exclusive bounds
 * - Fail loud if any `$ref` remains
 */
export function zodToGeminiJsonSchema(
  zodSchema: ZodTypeAny,
): Record<string, unknown> {
  const schema = zodToJsonSchema(zodSchema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

  const sanitized = sanitizeGeminiJsonSchema(schema) as Record<string, unknown>;
  assertNoJsonSchemaRefs(sanitized);
  return sanitized;
}

export function sanitizeGeminiJsonSchema(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGeminiJsonSchema(item));
  }

  const input = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    if (
      key === "$schema" ||
      key === "definitions" ||
      key === "$defs" ||
      key === "$id"
    ) {
      continue;
    }
    next[key] = sanitizeGeminiJsonSchema(child);
  }

  rewriteExclusiveBounds(next);
  rewriteNullableTypeArray(next);
  rewriteNullableAnyOf(next);

  return next;
}

function rewriteExclusiveBounds(schema: Record<string, unknown>): void {
  if (typeof schema.exclusiveMinimum === "number") {
    if (typeof schema.minimum !== "number") {
      schema.minimum = schema.exclusiveMinimum;
    }
    delete schema.exclusiveMinimum;
  }
  if (typeof schema.exclusiveMaximum === "number") {
    if (typeof schema.maximum !== "number") {
      schema.maximum = schema.exclusiveMaximum;
    }
    delete schema.exclusiveMaximum;
  }
}

/** `{ type: ["string", "null"] }` → `{ type: "string", nullable: true }` */
function rewriteNullableTypeArray(schema: Record<string, unknown>): void {
  if (!Array.isArray(schema.type)) {
    return;
  }
  const types = schema.type.filter((t): t is string => typeof t === "string");
  const nonNull = types.filter((t) => t !== "null");
  if (types.includes("null") && nonNull.length === 1) {
    schema.type = nonNull[0];
    schema.nullable = true;
  }
}

/**
 * Zod nullable unions:
 *   anyOf: [ { type: "string", ... }, { type: "null" } ]
 * → { type: "string", ..., nullable: true }
 */
function rewriteNullableAnyOf(schema: Record<string, unknown>): void {
  if (!Array.isArray(schema.anyOf) || schema.anyOf.length !== 2) {
    return;
  }

  const branches = schema.anyOf as unknown[];
  const nullBranch = branches.find(
    (branch) =>
      branch !== null &&
      typeof branch === "object" &&
      !Array.isArray(branch) &&
      (branch as Record<string, unknown>).type === "null",
  );
  const valueBranch = branches.find((branch) => branch !== nullBranch);

  if (
    nullBranch === undefined ||
    valueBranch === null ||
    typeof valueBranch !== "object" ||
    Array.isArray(valueBranch)
  ) {
    return;
  }

  const valueSchema = valueBranch as Record<string, unknown>;
  delete schema.anyOf;
  Object.assign(schema, valueSchema);
  schema.nullable = true;
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
