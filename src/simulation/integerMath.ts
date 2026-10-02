export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Cannot round a non-finite value.');
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function scaledRatioSigned(numerator: number, scale: number, denominator: number): number {
  if (![numerator, scale, denominator].every(Number.isSafeInteger) || scale < 0 || denominator <= 0) throw new Error('Invalid exact ratio input.');
  const product = BigInt(numerator) * BigInt(scale), sign = product < 0n ? -1n : 1n;
  const magnitude = product < 0n ? -product : product, divisor = BigInt(denominator);
  const result = Number(sign * ((magnitude + divisor / 2n) / divisor));
  if (!Number.isSafeInteger(result)) throw new Error('Exact ratio exceeds safe integer range.');
  return result;
}
