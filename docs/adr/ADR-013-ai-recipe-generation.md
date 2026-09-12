# ADR-013: Provider-independent AI recipe generation (PLAN-003)

## Status

Accepted

## Context

PLAN-001 and PLAN-002 capture food and cooking preference intent. The next vertical slice needs a single AI-generated recipe candidate with exact gram quantities and measurement states so a later USDA resolution + portioning pipeline can compute authoritative nutrition.

The mobile client must never call an LLM or hold provider credentials. Nutrition invented by a model must never be treated as truth.

## Decision

- Introduce a provider-independent `RecipeGenerator` interface in `packages/domain`.
- Implement `GeminiRecipeGenerator` in `packages/llm` using the official `@google/genai` SDK with structured JSON schema output, then re-validate with Zod.
- Configure the provider through server-only env vars: `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Expose generation via Supabase Edge Function `generate-recipe` (`POST`). One recipe per call.
- Carry `varietyLevel` as generation context only. Do not map it to recipe counts.
- Stamp provenance as `{ type: "ai_original", provider, model }`. Future provenance kinds (`food_blog`, `creator`, `editorial`, `inspired_by`, `adapted`) may extend the contract later.
- Version prompts as `recipe-generation-v1`.

## Consequences

- Domain/contracts stay free of Gemini SDK types.
- Future `OpenAIRecipeGenerator` / `AnthropicRecipeGenerator` can be added without changing recipe-domain logic.
- USDA resolution, portion solving, and weekly UI remain later stories.
- Weekly meal *strategy* (concepts only) is PLAN-004 / ADR-015.
