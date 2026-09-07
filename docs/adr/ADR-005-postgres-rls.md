# ADR-005: Postgres RLS

## Status

Accepted

## Context

User-owned fitness and meal data is sensitive. Frontend filtering alone is insufficient.

## Decision

- Every user-owned table enables PostgreSQL Row Level Security.
- Policies enforce `auth.uid() = user_id` (or equivalent ownership path) for reads/writes.
- Catalog tables (`foods`, `recipes`, `recipe_ingredients`) are readable by authenticated users; writes are migration/service-role only.
- Expo receives only the anon key + user JWT. Service-role keys stay server-side.
- RLS tests prove cross-user access fails.

## Consequences

- Slightly more migration boilerplate.
- Strong baseline security for the modular monolith.
- Edge Functions using service role must still write correct `user_id` and never expose that key to clients.
