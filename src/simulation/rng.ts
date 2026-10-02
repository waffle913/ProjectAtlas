export interface SimulationRandomKey {
  system: string;
  entityId?: string;
  date?: string;
  tick?: number;
  eventKey?: string;
}

const encodePart = (value: string | number | undefined) => {
  const text = value === undefined ? '' : String(value);
  return `${text.length}:${text}`;
};

/** A counter-free keyed RNG. Results do not depend on call or render order. */
function deterministicUint32Attempt(seed: string, key: SimulationRandomKey, retry: number): number {
  const base = [seed, key.system, key.entityId, key.date, key.tick, key.eventKey].map(encodePart).join('|');
  const input = retry === 0 ? base : `${base}|retry:${retry}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export const deterministicUint32 = (seed: string, key: SimulationRandomKey) => deterministicUint32Attempt(seed, key, 0);
export const deterministicFloat = (seed: string, key: SimulationRandomKey) => deterministicUint32(seed, key) / 0x1_0000_0000;

export function deterministicInteger(seed: string, key: SimulationRandomKey, minInclusive: number, maxExclusive: number) {
  if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive) || maxExclusive <= minInclusive) throw new Error('Invalid deterministic integer range.');
  const span = BigInt(maxExclusive) - BigInt(minInclusive), uint32Range = 1n << 32n, uint53Range = 1n << 53n;
  if (span > uint53Range) throw new Error('Deterministic integer span exceeds the supported 53-bit range.');
  const range = span <= uint32Range ? uint32Range : uint53Range, limit = range - range % span;
  for (let retry = 0; retry < 128; retry++) {
    const sample = range === uint32Range
      ? BigInt(deterministicUint32Attempt(seed, key, retry))
      : (BigInt(deterministicUint32Attempt(seed, key, retry * 2)) << 21n) | BigInt(deterministicUint32Attempt(seed, key, retry * 2 + 1) >>> 11);
    if (sample < limit) return Number(BigInt(minInclusive) + sample % span);
  }
  throw new Error('Deterministic integer rejection sampling did not converge.');
}
