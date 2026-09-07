# ADR-003: Immutable Prescriptions

## Status

Accepted

## Context

We must preserve the ability to analyze:

WHAT WE RECOMMENDED + WHAT THE USER ACTUALLY DID + WHAT OUTCOME OCCURRED

## Decision

- Goals, nutrition targets, daily plans, and meal instances are append-oriented historical records.
- Meal instances store an immutable ingredient-quantity / nutrition snapshot at prescription time.
- Do not recalculate historical prescriptions from the latest recipe version.
- Do not overwrite historical rows in a way that erases prior recommendations.

## Consequences

- Recipe versioning is required.
- Storage grows over time (acceptable for this product stage).
- Adaptation engines later compare recommendation vs adherence using stable history.
