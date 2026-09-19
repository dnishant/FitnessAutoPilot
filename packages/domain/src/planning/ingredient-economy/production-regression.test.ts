import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGroceryIdentityKey } from "../../grocery/identity";
import {
  collectExactIngredientUses,
  evaluateExactGroceryComplexity,
} from "./complexity";

describe("production weekly plan regression (tmp/latest-weekly-plan.json)", () => {
  it("canonicalizes garlic aliases and reports complexity metrics", () => {
    const candidates = [
      resolve(process.cwd(), "../../tmp/latest-weekly-plan.json"),
      resolve(process.cwd(), "tmp/latest-weekly-plan.json"),
      resolve(__dirname, "../../../../../tmp/latest-weekly-plan.json"),
    ];
    let plan: {
      recipesByCandidateId?: Record<
        string,
        { candidateId: string; ingredients?: Array<{ name: string }> }
      >;
    } | null = null;
    for (const path of candidates) {
      try {
        plan = JSON.parse(readFileSync(path, "utf8"));
        break;
      } catch {
        // try next
      }
    }
    if (!plan) {
      expect.fail("tmp/latest-weekly-plan.json not found");
      return;
    }

    const recipes = Object.values(plan.recipesByCandidateId ?? {});
    expect(recipes.length).toBeGreaterThan(0);

    const rawNames: string[] = [];
    const rows: Array<{ candidateId: string; ingredientName: string }> = [];
    for (const r of recipes) {
      for (const ing of r.ingredients ?? []) {
        rawNames.push(ing.name);
        rows.push({ candidateId: r.candidateId, ingredientName: ing.name });
      }
    }

    const beforeUnique = new Set(rawNames.map((n) => n.toLowerCase().trim())).size;
    const afterUnique = new Set(
      rawNames.map((n) => buildGroceryIdentityKey({ displayName: n })),
    ).size;
    expect(afterUnique).toBeLessThan(beforeUnique);

    const garlic = rawNames.filter(
      (n) => /garlic/i.test(n) && !/powder|paste|ginger/i.test(n),
    );
    const garlicKeys = new Set(garlic.map((n) => buildGroceryIdentityKey({ displayName: n })));
    expect(garlicKeys.size).toBe(1);

    const metrics = evaluateExactGroceryComplexity({
      ingredientUses: collectExactIngredientUses(rows),
      uniqueMealConcepts: recipes.length,
      varietyLevel: "balanced",
    });

    // This production week is the motivating pathology — exact complexity should
    // still look high (upstream repair is what improves repertoire selection).
    expect(metrics.uniqueCanonicalIngredients).toBeGreaterThan(30);
    expect(metrics.policyVersion).toBe("grocery-complexity-policy-v1");

    // Surface for completion report / tuning.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          rawIngredientRows: rawNames.length,
          beforeUniqueNameStrings: beforeUnique,
          afterCanonicalIdentities: afterUnique,
          metrics,
        },
        null,
        2,
      ),
    );
  });
});
