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
export function deterministicUint32(seed: string, key: SimulationRandomKey): number {
  const input = [seed, key.system, key.entityId, key.date, key.tick, key.eventKey].map(encodePart).join('|');
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

export const deterministicFloat = (seed: string, key: SimulationRandomKey) => deterministicUint32(seed, key) / 0x1_0000_0000;

export function deterministicInteger(seed: string, key: SimulationRandomKey, minInclusive: number, maxExclusive: number) {
  if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive) || maxExclusive <= minInclusive) throw new Error('Invalid deterministic integer range.');
  return minInclusive + (deterministicUint32(seed, key) % (maxExclusive - minInclusive));
}
