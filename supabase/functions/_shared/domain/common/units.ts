/** International avoirdupois pound. 1 lb = 0.45359237 kg exactly. */
export const KG_PER_LB = 0.45359237;

export function kgToLb(weightKg: number): number {
  return weightKg / KG_PER_LB;
}

export function lbToKg(weightLb: number): number {
  return weightLb * KG_PER_LB;
}
