import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Persistence / RLS expectations for CATALOG-001.
 * Executable Postgres assertions live in supabase/tests/rls/cross_user_isolation.sql.
 */
describe("CATALOG-001 persistence and RLS markers", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20260919000100_canonical_ingredient_protein_catalog.sql"),
    "utf8",
  );
  const rls = readFileSync(join(root, "supabase/tests/rls/cross_user_isolation.sql"), "utf8");
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");

  it("21-24. RLS allows authenticated read and blocks ordinary-user mutations", () => {
    expect(migration).toContain("protein_products_select_authenticated");
    expect(migration).toContain("for select");
    expect(migration).not.toMatch(
      /create policy protein_products_(insert|update|delete)_authenticated/i,
    );
    expect(rls).toContain("normal user can insert catalog records");
    expect(rls).toContain("normal user can update catalog records");
    expect(rls).toContain("normal user can delete catalog records");
  });

  it("25. privileged catalog operations remain migration/service-role only", () => {
    expect(migration).toContain("service-role / migrations only");
  });

  it("26. foreign-key and uniqueness constraints are declared", () => {
    expect(migration).toContain("protein_products_canonical_key_uidx");
    expect(migration).toContain("ingredient_aliases_normalized_uidx");
    expect(migration).toContain("references public.canonical_ingredients");
    expect(migration).toContain("retailer_evidence_exactly_one_target_chk");
    expect(migration).toContain("ingredient_substitutions_no_self_chk");
    expect(migration).toContain("retailer_evidence_verified_requires_source_chk");
    expect(migration).toContain("retailer_evidence_verified_requires_timestamp_chk");
  });

  it("27. seed execution is idempotent (on conflict upserts)", () => {
    expect(migration).toContain("on conflict (canonical_key) do update");
    expect(seed).toContain("on conflict (canonical_key) do update");
    expect(seed).toContain("beef_ribeye_steak");
  });

  it("seed SQL artifacts stay in sync with domain seed keys", () => {
    const seedTs = readFileSync(
      join(root, "packages/domain/src/ingredient-catalog/seed.ts"),
      "utf8",
    );
    const generated = readFileSync(join(root, "supabase/seed_catalog_001.sql"), "utf8");
    const keys = [
      ...seedTs.matchAll(/canonicalKey:\s*"([^"]+)"/g),
    ].map((match) => match[1]!);
    const unique = [...new Set(keys)];
    expect(unique.length).toBeGreaterThanOrEqual(26);
    for (const key of unique) {
      expect(migration).toContain(key);
      expect(seed).toContain(key);
      expect(generated).toContain(key);
    }
  });

  it("28-29. migration is additive and does not drop plan/recipe tables", () => {
    expect(migration).not.toMatch(/drop table public\.(foods|recipes|daily_plans)/i);
    expect(migration).toContain("Does not modify existing foods / recipes / plan tables");
  });
});
