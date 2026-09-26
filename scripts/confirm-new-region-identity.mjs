import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const decisionPath = process.argv[2];
if (!decisionPath) throw new Error('Pass a reviewed decision JSON file. No Region ID is allocated without one.');
const root = new URL('../', import.meta.url);
const [decision, registry, countries] = await Promise.all([
  readFile(decisionPath, 'utf8').then(JSON.parse),
  readFile(new URL('src/data/region-id-assignments.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/data/entity-registry.json', root), 'utf8').then(JSON.parse),
]);
if (decision.decision !== 'CONFIRMED_GENUINELY_NEW_REGION') throw new Error('Review decision must explicitly confirm a genuinely new Region.');
if (!countries.countries.some(country => country.id === decision.parentCountryId)) throw new Error('Reviewed decision references an unknown parent country.');
if (!decision.commonName || decision.administrativeLevel !== 1) throw new Error('Reviewed decision lacks the required stable Region profile.');
if (/natural[-_ ]?earth|adm1|source(feature)?id/i.test(JSON.stringify(decision))) throw new Error('Permanent Region identity decisions must not contain dataset-specific identifiers.');
if (decision.iso31662 && registry.regions.some(region => region.iso31662 === decision.iso31662)) throw new Error(`ISO 3166-2 is already assigned: ${decision.iso31662}`);
const identity = {
  id: `region.${randomUUID()}`,
  status: 'active',
  identityKind: 'admin1',
  parentCountryId: decision.parentCountryId,
  initialOwnerCountryId: decision.parentCountryId,
  ...(decision.macroTerritoryId && { macroTerritoryId: decision.macroTerritoryId }),
  commonName: decision.commonName,
  nameAliases: decision.nameAliases ?? [decision.commonName],
  ...(decision.localAdministrativeType && { localAdministrativeType: decision.localAdministrativeType }),
  administrativeLevel: 1,
  ...(decision.iso31662 && { iso31662: decision.iso31662 }),
  stableExternalIds: decision.stableExternalIds ?? {},
  createdIn: 'explicit-reviewed-decision',
  reviewReference: decision.reviewReference,
};
registry.regions.push(identity);
registry.regions.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(new URL('src/data/region-id-assignments.json', root), JSON.stringify(registry, null, 2) + '\n');
console.log(`Allocated ${identity.id}. Add an explicit dataset reconciliation override after reviewing the source match.`);
