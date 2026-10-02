const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
export const canonicalJson = (value: unknown) => JSON.stringify(canonical(value));

/** Compact deterministic corruption/edit detector; not a security primitive. */
export function deterministicFingerprint(value: unknown) {
  const text = canonicalJson(value); let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index++) { hash ^= BigInt(text.charCodeAt(index)); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, '0');
}
