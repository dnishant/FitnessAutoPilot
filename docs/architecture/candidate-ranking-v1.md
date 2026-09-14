# Candidate ranking v1 (PLAN-006)

## Purpose

Take already-discovered PLAN-005 culinary candidates and produce a **ranked, diverse, trustworthy pool** for a future weekly planner.

Ranking answers: “Which of these discovered dishes should survive into the candidate pool?” — not “What should Monday’s dinner be?”

## Flow

```text
PLAN-005 Lunch Discovery ─┐
                          ├─→ candidate-ranking-v1 ─→ selected + deprioritized pools
PLAN-005 Dinner Discovery ┘
                                   ↓
                              PLAN-007 (not in this slice)
```

No Gemini call. Ranking is a pure domain function over PLAN-005 metadata.

## Policy version

`candidate-ranking-v1`

Lunch and dinner only. Breakfast and snacks are out of scope.

Default `targetPoolSize = 12`. This is a target, not a quota. Fewer strong candidates is success; the engine does not pad with weak dishes.

## Score

```text
score =
  userPreferenceFit
+ culinaryInterest
+ sourceQuality
+ prepFit
+ fitnessAdaptability
+ novelty
- repetitionPenalty
- similarityPenalty
```

Weights live in `CANDIDATE_RANKING_WEIGHTS`. Component scores are 0–1. The composed score is scaled to 0–100.

Absence of a cuisine/protein/experience preference is **neutral**. Unselected cuisines are not treated as dislikes. Explicit dislikes are negative. Hard allergies/restrictions remain an upstream PLAN-005 concern.

## Similarity and selection

`CULINARY_SIMILARITY_WEIGHTS` compare flavor, technique, dish format, cuisine, region, texture, experience, and protein. Protein is the smallest dimension.

- `NEAR_DUPLICATE_THRESHOLD` → keep the stronger candidate, mark the weaker `duplicate`
- `SIMILARITY_PENALTY_THRESHOLD` → both may survive; the later pick is penalized

Selection is iterative (maximal marginal relevance style): pick the best remaining candidate, re-score the rest against the selected set, repeat. There are no rigid cuisine or protein quotas.

## Trust model

- Deterministic, explainable reasons generated from score components
- Source quality is a coarse host/name heuristic (high / medium / lower / unknown). Unknown domains are neutral, not zero. YouTube is scored, not rejected.
- Edge Function `rank-culinary-candidates` re-validates the request with Zod and runs the same domain engine (optional; uses CORS + `requireUser()`, `verify_jwt = false`)
- The mobile preview ranks **in-process** via `candidate-ranking-v1`. Ranking does not need Gemini or a hosted function, so a missing `rank-culinary-candidates` deploy cannot cause a browser CORS error

## Non-goals

- Weekly planning / Monday–Sunday assignment (PLAN-007)
- Breakfast or snack ranking
- Recipe extraction, USDA, macros, groceries, prep-session optimization
- Persistent candidate library or meal history
- A second Gemini ranking call
