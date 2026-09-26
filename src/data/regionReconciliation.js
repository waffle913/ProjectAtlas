const normalize = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const one = (values, label) => {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length > 1) throw new Error(`Ambiguous Region reconciliation (${label}): ${unique.join(', ')}`);
  return unique[0];
};
const uniqueSignal = values => {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length === 1 ? unique[0] : undefined;
};

/**
 * Reconciles a replaceable geographic dataset to permanent ProjectAtlas identities.
 * This function never allocates, mutates, recycles or retires an identity.
 */
export function reconcileRegionCandidates({ identities, aliases, candidates, reviewedMatches = {}, requireComplete = true }) {
  const identityById = new Map();
  for (const identity of identities) {
    if (!identity.id || identityById.has(identity.id)) throw new Error(`Duplicate or missing Region identity: ${identity.id}`);
    identityById.set(identity.id, identity);
  }
  for (const identity of identities.filter(item => item.status === 'retired')) {
    const successor = identityById.get(identity.successorRegionId);
    if (!successor || successor.status !== 'active') throw new Error(`Retired Region requires an explicit active successor for save migration: ${identity.id}`);
  }
  const active = identities.filter(identity => identity.status === 'active' && identity.identityKind === 'admin1');
  const results = [];
  for (const candidate of candidates) {
    const eligible = active.filter(identity => identity.parentCountryId === candidate.parentCountryId);
    const signals = [];
    const sourceIds = new Set(candidate.sourceFeatureIds ?? []);
    const sourceCodes = new Set(candidate.sourceAdmin1Codes ?? []);
    const aliasIds = aliases
      .filter(alias => alias.datasetId === candidate.datasetId
        && (sourceIds.has(alias.sourceId) || (alias.sourceAdmin1Code && sourceCodes.has(alias.sourceAdmin1Code))))
      .map(alias => alias.regionId);
    const aliasMatch = one(aliasIds, `${candidate.reviewKey}: dataset aliases`);
    if (aliasMatch) signals.push(aliasMatch);
    if (candidate.iso31662) {
      const isoMatch = uniqueSignal(eligible.filter(identity => identity.iso31662 === candidate.iso31662).map(identity => identity.id));
      if (isoMatch) signals.push(isoMatch);
    }
    for (const wikidataId of candidate.wikidataIds ?? []) {
      const wikidataMatch = uniqueSignal(eligible.filter(identity => identity.stableExternalIds?.wikidata?.includes(wikidataId)).map(identity => identity.id));
      if (wikidataMatch) signals.push(wikidataMatch);
    }
    const normalizedName = normalize(candidate.name);
    const nameMatch = uniqueSignal(eligible.filter(identity => [identity.commonName, ...(identity.nameAliases ?? [])].some(name => normalize(name) === normalizedName)).map(identity => identity.id));
    if (nameMatch) signals.push(nameMatch);
    const reviewedId = reviewedMatches[candidate.reviewKey];
    if (reviewedId) signals.push(reviewedId);
    const regionId = one(signals, `${candidate.reviewKey}: conflicting stable signals`);
    if (!regionId) throw new Error(`Unmatched Region candidate requires explicit review: ${candidate.reviewKey}`);
    const identity = identityById.get(regionId);
    if (!identity) throw new Error(`Reviewed mapping references an unknown Region identity: ${regionId}`);
    if (identity.status !== 'active') throw new Error(`Source candidate cannot map to inactive Region identity: ${regionId}`);
    if (identity.parentCountryId !== candidate.parentCountryId) throw new Error(`Region reconciliation crosses parent countries: ${candidate.reviewKey}`);
    results.push({ ...candidate, regionId });
  }
  const mappedIds = new Set(results.map(result => result.regionId));
  if (mappedIds.size !== results.length) {
    const duplicate = one(results.flatMap((result, index) => results.slice(index + 1).filter(other => other.regionId === result.regionId).map(() => result.regionId)), 'multiple replacement entities map to one Region');
    if (duplicate) throw new Error(`Dataset split requires an explicit new Region identity; existing ID would be reused: ${duplicate}`);
  }
  if (requireComplete) {
    const sourceCountries = new Set(candidates.map(candidate => candidate.parentCountryId));
    const missing = active.filter(identity => sourceCountries.has(identity.parentCountryId) && !mappedIds.has(identity.id));
    if (missing.length) throw new Error(`Unmapped existing Region identities require an explicit retirement/merge migration: ${missing.map(identity => identity.id).join(', ')}`);
  }
  return results;
}
