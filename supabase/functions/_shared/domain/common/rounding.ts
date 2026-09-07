/** Shared rounding helpers for authoritative nutrition math. */

export function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON) / factor;
}

export function roundKcal(value: number): number {
  return roundHalfUp(value, 0);
}

export function roundMacroG(value: number): number {
  return roundHalfUp(value, 1);
}

export function roundGrams(value: number): number {
  return roundHalfUp(value, 0);
}
