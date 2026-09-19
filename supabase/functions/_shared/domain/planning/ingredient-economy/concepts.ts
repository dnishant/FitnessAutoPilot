import type {
  IngredientBurdenClass,
  IngredientConcept,
  IngredientFootprint,
  LeftoverDisposition,
} from "../../../contracts/index.ts";

/**
 * Normalize free-text culinary ingredient mentions into planning concepts.
 * Used for lightweight footprints — NOT grocery aggregation (see grocery/canonicalize).
 */

const STAPLES = new Set([
  "salt",
  "black pepper",
  "pepper",
  "olive oil",
  "vegetable oil",
  "canola oil",
  "neutral oil",
  "cooking oil",
  "oil",
  "flour",
  "sugar",
  "water",
  "cumin",
  "coriander",
  "turmeric",
  "paprika",
  "oregano",
  "thyme",
  "bay leaf",
  "cinnamon",
  "chili powder",
  "garlic powder",
  "onion powder",
  "soy sauce",
  "vinegar",
  "baking powder",
  "baking soda",
]);

const HIGH_WASTE = new Set([
  "cilantro",
  "parsley",
  "mint",
  "basil",
  "dill",
  "green onion",
  "scallion",
  "fresh herbs",
  "curry leaves",
  "curry leaf",
]);

const SPECIALTY_MARKERS = [
  "pine nut",
  "pine nuts",
  "prosciutto",
  "capers",
  "taggiasca",
  "guajillo",
  "pasilla",
  "ancho",
  "chipotle in adobo",
  "saffron",
  "truffle",
  "pomegranate molasses",
  "fish sauce",
  "mirin",
  "sake",
  "white wine",
  "red wine",
  "sherry",
  "cognac",
  "curry leaves",
  "kaffir",
  "lemongrass",
  "galangal",
  "sumac",
  "zaatar",
  "za'atar",
  "harissa",
  "gochujang",
  "miso",
  "tahini",
];

const PROTEIN_MARKERS = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "salmon",
  "fish",
  "shrimp",
  "tofu",
  "tempeh",
  "eggs",
  "egg",
  "paneer",
  "ground turkey",
  "ground beef",
  "ground chicken",
];

const STARCH_MARKERS = [
  "rice",
  "pasta",
  "tortilla",
  "tortillas",
  "potato",
  "potatoes",
  "bread",
  "quinoa",
  "noodle",
  "noodles",
  "couscous",
  "naan",
  "roti",
  "pita",
];

const PRODUCE_MARKERS = [
  "onion",
  "garlic",
  "tomato",
  "lime",
  "lemon",
  "cilantro",
  "parsley",
  "cabbage",
  "pepper",
  "bell pepper",
  "carrot",
  "cucumber",
  "spinach",
  "lettuce",
  "avocado",
  "ginger",
  "chili",
  "chile",
  "scallion",
  "green onion",
  "shallot",
  "mint",
  "basil",
  "asparagus",
  "broccoli",
  "zucchini",
  "mushroom",
];

const FAMILY_MAP: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /\bonion\b/, family: "onion" },
  { pattern: /\b(scallion|green onion|spring onion)\b/, family: "green_onion" },
  { pattern: /\bgarlic\b/, family: "garlic" },
  { pattern: /\b(tomato|roma tomato|cherry tomato)\b/, family: "tomato" },
  { pattern: /\b(lime|lemon)\b/, family: "citrus" },
  { pattern: /\b(cilantro|coriander leaf|coriander leaves)\b/, family: "cilantro" },
  { pattern: /\bparsley\b/, family: "parsley" },
  { pattern: /\b(bell pepper|capsicum)\b/, family: "bell_pepper" },
  { pattern: /\bchili|chilli|chile\b/, family: "chili" },
  { pattern: /\bchicken\b/, family: "chicken" },
  { pattern: /\bbeef\b/, family: "beef" },
  { pattern: /\brice\b/, family: "rice" },
  { pattern: /\btortilla/, family: "tortilla" },
  { pattern: /\byogurt|yoghurt\b/, family: "yogurt" },
];

export function normalizePlanningConceptKey(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s
    .replace(
      /\b(fresh|finely|minced|chopped|diced|sliced|cloves?|bulbs?|leaves?|ground|dried)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  // Common collapses for planning reuse.
  if (/^extra[-\s]?virgin\s+olive\s+oil$/.test(s) || s === "evoo") return "olive oil";
  if (/garlic/.test(s) && !/powder|paste/.test(s)) return "garlic";
  if (/parsley/.test(s) && !/dried|powder/.test(s)) return "parsley";
  if (/^(kosher|sea|table)?\s*salt$/.test(s) || s === "salt") return "salt";
  if (/black\s+pepper|peppercorns?/.test(s)) return "black pepper";
  if (/cilantro|coriander\s+leaf/.test(s)) return "cilantro";
  if (/^yellow\s+onion$|^white\s+onion$|^onion$/.test(s)) return "onion";
  if (/greek\s+yogurt|plain\s+yogurt|yogurt/.test(s)) return "yogurt";

  return s || raw.toLowerCase().trim();
}

export function inferFamilyKey(conceptKey: string): string | undefined {
  for (const row of FAMILY_MAP) {
    if (row.pattern.test(conceptKey)) return row.family;
  }
  return undefined;
}

export function classifyIngredientBurden(conceptKey: string): IngredientBurdenClass {
  if (STAPLES.has(conceptKey) || isLikelyPantrySpice(conceptKey)) return "common_staple";
  if (HIGH_WASTE.has(conceptKey) || /fresh herb/.test(conceptKey)) return "high_waste_risk";
  if (SPECIALTY_MARKERS.some((m) => conceptKey.includes(m))) return "specialty";
  if (PRODUCE_MARKERS.some((m) => conceptKey.includes(m))) return "common_fresh";
  if (PROTEIN_MARKERS.some((m) => conceptKey.includes(m))) return "reusable_weekly";
  if (STARCH_MARKERS.some((m) => conceptKey.includes(m))) return "reusable_weekly";
  if (/wine|prosciutto|pine|caper|olive(?!\s+oil)|curry leaf/.test(conceptKey)) {
    return "specialty";
  }
  return "reusable_weekly";
}

function isLikelyPantrySpice(conceptKey: string): boolean {
  return /\b(cumin|coriander|turmeric|paprika|oregano|thyme|cinnamon|spice|powder|oil|vinegar|sauce|salt|pepper|bay)\b/.test(
    conceptKey,
  );
}

export function inferLeftoverDisposition(
  burden: IngredientBurdenClass,
): LeftoverDisposition {
  if (burden === "common_staple") return "pantry_carryover";
  if (burden === "high_waste_risk") return "high_waste_risk";
  if (burden === "specialty") return "fridge_carryover";
  if (burden === "common_fresh") return "consume_this_week";
  return "fridge_carryover";
}

export function toIngredientConcept(raw: string): IngredientConcept {
  const conceptKey = normalizePlanningConceptKey(raw);
  const burdenClass = classifyIngredientBurden(conceptKey);
  return {
    conceptKey,
    familyKey: inferFamilyKey(conceptKey),
    label: titleCase(conceptKey),
    burdenClass,
    leftoverDisposition: inferLeftoverDisposition(burdenClass),
  };
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Build a planning footprint from free-text ingredient mentions
 * (LLM estimate or heuristic from plate components / proteins).
 */
export function buildIngredientFootprintFromMentions(input: {
  proteins?: string[];
  starches?: string[];
  produce?: string[];
  flavor?: string[];
  specialty?: string[];
  core?: string[];
  reuseNotes?: string;
}): IngredientFootprint {
  const toList = (items: string[] | undefined) =>
    dedupeConcepts((items ?? []).map(toIngredientConcept));

  const specialty = toList(input.specialty);
  const proteins = toList(input.proteins);
  const starches = toList(input.starches);
  const produce = toList(input.produce);
  const flavor = toList(input.flavor);
  const core = toList(input.core);

  // Ensure specialty items also appear once in the right burden bucket.
  return {
    coreIngredients: core.length > 0 ? core : [...proteins, ...starches, ...produce].slice(0, 12),
    likelyProduce: produce,
    likelyProteins: proteins,
    likelyStarches: starches,
    likelyFlavorIngredients: flavor,
    specialtyIngredients: specialty,
    reuseNotes: input.reuseNotes,
  };
}

/**
 * Heuristic footprint from meal concept plate + discovery tags when LLM
 * footprint is absent. Planning-only — not grocery truth.
 */
export function synthesizeFootprintFromMealSignals(input: {
  primaryProtein?: string | null;
  componentNames?: string[];
  cuisineFamily?: string | null;
  dishName?: string;
}): IngredientFootprint {
  const proteins: string[] = [];
  const starches: string[] = [];
  const produce: string[] = [];
  const flavor: string[] = [];
  const specialty: string[] = [];

  if (input.primaryProtein) proteins.push(input.primaryProtein);

  for (const name of input.componentNames ?? []) {
    const key = normalizePlanningConceptKey(name);
    if (STARCH_MARKERS.some((m) => key.includes(m))) starches.push(name);
    else if (PRODUCE_MARKERS.some((m) => key.includes(m))) produce.push(name);
    else if (SPECIALTY_MARKERS.some((m) => key.includes(m))) specialty.push(name);
    else if (PROTEIN_MARKERS.some((m) => key.includes(m))) proteins.push(name);
    else flavor.push(name);
  }

  // Cuisine-flavored likely aromatics (soft priors — still planning metadata).
  const cuisine = (input.cuisineFamily ?? "").toLowerCase();
  if (/indian|south asian/.test(cuisine)) {
    flavor.push("cumin", "turmeric", "yogurt", "garlic", "ginger");
    produce.push("onion", "cilantro", "lime");
  } else if (/mexican|tex-mex|latin/.test(cuisine)) {
    flavor.push("cumin", "oregano", "chili");
    produce.push("onion", "cilantro", "lime");
    starches.push("tortilla");
  } else if (/mediterranean|italian|greek/.test(cuisine)) {
    flavor.push("olive oil", "garlic", "oregano");
    produce.push("onion", "tomato", "lemon");
  }

  return buildIngredientFootprintFromMentions({
    proteins,
    starches,
    produce,
    flavor,
    specialty,
    reuseNotes: input.dishName
      ? `Heuristic footprint for ${input.dishName}`
      : undefined,
  });
}

export function flattenFootprintConcepts(
  footprint: IngredientFootprint,
): IngredientConcept[] {
  return dedupeConcepts([
    ...footprint.coreIngredients,
    ...footprint.likelyProduce,
    ...footprint.likelyProteins,
    ...footprint.likelyStarches,
    ...footprint.likelyFlavorIngredients,
    ...footprint.specialtyIngredients,
  ]);
}

function dedupeConcepts(concepts: IngredientConcept[]): IngredientConcept[] {
  const seen = new Set<string>();
  const out: IngredientConcept[] = [];
  for (const c of concepts) {
    if (seen.has(c.conceptKey)) continue;
    seen.add(c.conceptKey);
    out.push(c);
  }
  return out;
}
