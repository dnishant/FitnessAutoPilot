# ADR-014: Edge Function CORS and in-function JWT verification

## Status

Accepted

## Context

The Expo web app on Vercel (`https://fitness-auto-pilot.vercel.app`) calls hosted Edge Functions via `supabase.functions.invoke`. Browsers send a CORS preflight `OPTIONS` request without `Authorization`.

With gateway `verify_jwt = true`, the API gateway rejects that preflight before the function can add `Access-Control-Allow-Origin`. The browser then reports a CORS failure even when the POST handler is correct.

## Decision

- Disable gateway JWT verification for Edge Functions (`verify_jwt = false` in `supabase/config.toml`).
- Answer `OPTIONS` with CORS headers and attach the same headers to every function response.
- Keep authenticating POST/GET inside the worker with `requireUser()` (user JWT + anon/publishable key). Service-role keys stay server-side. Postgres RLS remains the data boundary.

## Consequences

- Unauthenticated requests reach the worker and receive `401` JSON instead of a gateway rejection. Browsers can read that response.
- Hosted functions must be redeployed (`npx supabase functions deploy`) for the JWT + CORS change to take effect. A Vercel rebuild is not required.
- CORS is not an authorization control. Do not treat allowed origins as a substitute for JWT or RLS.
