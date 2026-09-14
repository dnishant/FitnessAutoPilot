# ADR-017: Deterministic culinary candidate ranking (PLAN-006)

## Status

Accepted

## Context

PLAN-005 / PLAN-005.1 can return grounded culinary candidates, but raw discovery still contains protein-swapped clones (tikka variants) and does not explain why one dish should survive into a weekly pool. PLAN-007 will eventually compose a week from candidate IDs. Ranking must be inspectable before that planner exists.

A second Gemini call would hide the similarity model and make tests depend on a live model.

## Decision

- Add a provider-independent `rankCulinaryCandidates` engine in `packages/domain`.
- Version the policy as `candidate-ranking-v1` with centralized score weights, similarity weights, and duplicate thresholds.
- Rank lunch and dinner only. Do not call Gemini.
- Use iterative diversity selection (MMR-style) instead of isolated sort or cuisine/protein quotas.
- Reuse PLAN-005 candidate types, PLAN-001 preference strings, PLAN-002 cooking-style fields, and PLAN-005 recent-concept shapes.
- Expose ranking via Edge Function `rank-culinary-candidates` (CORS + in-function JWT, same as ADR-014) and a development preview. The preview ranks in-process because ranking needs no LLM credentials and must not fail on an undeployed function CORS preflight.

## Consequences

- Discovery and ranking can be judged independently.
- Protein-swapped clones can be marked duplicate while culinarily different fish dishes can all survive.
- PLAN-006.1 keeps `candidate-ranking-v1` after validation: iterative selection was already MMR-style; diagnostics, culinary-interest discrimination, and novelty neutralization were hardened without changing weights or thresholds.
- PLAN-007 can later consume selected candidate IDs without inventing recipes freely.
- Source-quality classification is a coarse heuristic, not a reputation database.
