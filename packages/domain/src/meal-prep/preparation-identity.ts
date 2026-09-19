import type { PrepCutForm } from "@fitness-autopilot/contracts";

/**
 * Normalize free-text ingredient preparation into a cut form.
 * Incompatible forms (minced vs sliced) must not consolidate final knife work.
 */
export function inferCutForm(preparation: string | null | undefined): PrepCutForm {
  if (!preparation) return "other";
  const p = preparation.toLowerCase();
  if (/\bmince|\bminced|\bfinely\s+chop/.test(p)) return "minced";
  if (/\bcube|\bcubed|\bdice\b|\bdiced\b/.test(p)) {
    if (/\bcube|\bcubed/.test(p)) return "cubed";
    return "diced";
  }
  if (/\bjulienne/.test(p)) return "julienned";
  if (/\bgrate|\bgrated|\bshred/.test(p)) return "grated";
  if (/\bcrush|\bcrushed/.test(p)) return "crushed";
  if (/\bslice|\bsliced|\bthinly\s+sliced|\bwedges?\b/.test(p)) return "sliced";
  if (/\bchop|\bchopped/.test(p)) return "chopped";
  if (/\bpeel|\bpeeled/.test(p)) return "peeled";
  if (/\bwash|\brinse|\bwashed/.test(p)) return "washed";
  if (/\btrim|\btrimmed/.test(p)) return "trimmed";
  if (/\bportion|\bcut into/.test(p)) return "portioned";
  if (/\bwhole\b|\bintact\b/.test(p)) return "whole";
  if (/\bmix|\bcombine|\bwhisk/.test(p)) return "mixed";
  return "other";
}

/**
 * Higher-level shared prep that can precede incompatible final cuts.
 * Example: peel onions → then dice vs slice remain separate.
 */
export function sharedUpstreamCutForm(cut: PrepCutForm): PrepCutForm | null {
  switch (cut) {
    case "diced":
    case "minced":
    case "sliced":
    case "cubed":
    case "chopped":
    case "julienned":
      return "peeled";
    default:
      return null;
  }
}

export function cutFormVerb(cut: PrepCutForm): string {
  switch (cut) {
    case "minced":
      return "Mince";
    case "diced":
      return "Dice";
    case "sliced":
      return "Slice";
    case "cubed":
      return "Cube";
    case "chopped":
      return "Chop";
    case "julienned":
      return "Julienne";
    case "grated":
      return "Grate";
    case "crushed":
      return "Crush";
    case "peeled":
      return "Peel";
    case "washed":
      return "Wash";
    case "trimmed":
      return "Trim";
    case "portioned":
      return "Portion";
    case "mixed":
      return "Mix";
    case "whole":
      return "Prepare";
    default:
      return "Prep";
  }
}

export function normalizeIngredientKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

/** Detect marinade / advance-prep semantics from free text. */
export function looksLikeMarinade(text: string): boolean {
  return /\bmarinat|\bbrine|\bsoak\b|\brest\b.*dough|\bproof\b/i.test(text);
}

export function looksLikeSauceOrDressing(text: string): boolean {
  return /\bsauce\b|\bchutney\b|\bdressing\b|\bmarinade\b|\brub\b/i.test(text);
}

export function extractPassiveMinutesFromText(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:\+|–|-)?\s*(?:min|minutes?)/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 60) : undefined;
}

export function extractOvenTempF(text: string): number | undefined {
  const match = text.match(/(\d{3})\s*°?\s*F/i) ?? text.match(/(\d{3})\s*degrees/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 200 && n <= 550 ? n : undefined;
}
