# ADR-006: Safety Gate

## Status

Accepted

## Context

Autonomous calorie deficit/surplus prescriptions are inappropriate for some populations (pregnancy, eating disorders, clinically significant underweight, certain diseases, serious injury, etc.). We must not attempt medical diagnosis.

## Decision

- Introduce `RecommendationEligibility = allowed | restricted(reason)` in domain code.
- Evaluate eligibility before generating autonomous nutrition targets.
- Restricted profiles receive a controlled domain failure; no silent prescription.
- AI must never override the safety gate.
- This is an eligibility architecture, not a diagnostic system.

## Consequences

- Some users cannot use autonomous planning until a clinician-aware workflow exists.
- Product copy must communicate that restrictions block autonomous targets for safety.
- Future workflows can add supervised/manual modes without rewriting the gate interface.
