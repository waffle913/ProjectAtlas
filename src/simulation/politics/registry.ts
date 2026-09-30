import registryJson from '../../data/political-registry.json';
import type { PoliticalRegistry } from './model';
// Static scenario evidence is intentionally outside SimulationState and serialized saves.
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
export const politicalRegistry = deepFreeze(registryJson as unknown as PoliticalRegistry);
export const politicsForCountry = (countryId: string) => politicalRegistry.countries[countryId];
