# AGENTS.md — Fitness Autopilot

Engineering rules for AI coding agents working in this repository.

## Product mission

Fitness Autopilot helps users reach fitness goals with minimal planning overhead.

Core promise: **“You set the goal. We manage the process.”**

Home experience answers: **“What should I do now?”**

Do not turn the product into a generic fitness metrics dashboard.

## Current scope

Foundation + meal-planning vertical slices through weekly meal-prep execution:

profile → goal → wearable TDEE → deterministic RMR → pace → starting calorie target → food/cooking preferences → culinary discovery → four-meal weekly strategy → recipe resolution → personalized portions (PLAN-010) → finalization (PLAN-011) → groceries (PLAN-012) → meal-prep execution plan (PLAN-013) → Today / Plan / Grocery screens.

Do **not** build: pantry inventory, store integrations, Action Engine / PLAN-014 “what should I do now?”, notifications, weekly review, recovery adaptation, analytics dashboards, workouts, or wearable APIs.

## Architecture

Modular monolith. Dependency direction:

```
UI → application/domain services → domain logic → infrastructure
```

Authoritative nutrition calculations must never run in React Native UI code as the source of truth. Server-side (Edge Functions) must re-validate before persisting prescriptions.

## DO

- Read `docs/architecture/` and `docs/adr/` before editing domain or persistence boundaries.
- Preserve deterministic business rules; keep algorithm versions explicit (`nutrition-target-v1`, etc.).
- Write unit tests alongside deterministic domain logic (Vitest).
- Create explicit Supabase SQL migrations for schema changes.
- Preserve historical versions of goals, nutrition targets, recipes, and meal prescriptions.
- Reuse shared domain packages (`packages/domain`) instead of duplicating formulas.
- Explain architecture changes in ADRs when boundaries or trust models change.
- Use typed `Result` / failure unions for expected domain failures.
- Keep UUID identifiers and `created_at` / `updated_at` where appropriate.
- Enforce PostgreSQL RLS on every user-owned table.

## DO NOT

- Calculate authoritative macros in React components.
- Trust client-supplied calorie or macro totals when persisting prescriptions.
- Call OpenAI (or any LLM) from the mobile client.
- Expose Supabase service-role or OpenAI credentials to Expo.
- Bypass RLS or rely only on frontend filtering.
- Duplicate nutrition formulas across packages or UI.
- Silently mutate historical prescriptions (overwrite WHAT WE RECOMMENDED).
- Invent authoritative nutrition values with AI.
- Add microservices, Kubernetes, Kafka, Redis, GraphQL, event sourcing, CQRS, or generic repository abstractions without a measured need.
- Expand into out-of-scope product areas listed above.

## Working method

Before each meaningful feature:

1. Restate the user problem
2. Identify affected domain entities
3. Describe the simplest architecture
4. Identify deterministic logic and safety concerns
5. Define acceptance criteria and tests
6. Implement, run tests, fix failures

If ambiguous: choose the simplest conservative implementation and document the assumption.
