import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("RECIPE-001 persistence markers", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20260920000100_versioned_recipe_catalog.sql"),
    "utf8",
  );
  const rls = readFileSync(join(root, "supabase/tests/rls/cross_user_isolation.sql"), "utf8");
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");

  it("41-49. migration, RLS, seed markers and legacy preservation", () => {
    expect(migration).toContain("catalog_recipes");
    expect(migration).toContain("catalog_recipe_versions");
    expect(migration).toContain("catalog_recipe_step_ingredient_usages");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("catalog_recipe_versions_select_authenticated");
    expect(migration).toContain("status = 'published'");
    expect(migration).not.toMatch(
      /create policy catalog_recipes_(insert|update|delete)_authenticated/i,
    );
    expect(migration).toContain("Does not modify existing foods / recipes / plan tables");
    expect(migration).not.toMatch(/drop table public\.(foods|recipes|daily_plans)/i);
    expect(migration).toContain("on conflict");
    expect(seed).toContain("egg_avocado_whole_grain_toast");
    expect(seed).toContain("ground_chicken_kheema_bowl");
    expect(seed).toContain("greek_yogurt_berries_walnuts");
    expect(rls).toContain("normal user can insert recipe catalog records");
    expect(rls).toContain("normal user can update recipe catalog records");
    expect(rls).toContain("authenticated user cannot read unpublished recipe versions");
  });
});
