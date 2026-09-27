import type { BilateralRelation, DiplomaticStatus, ExplicitCasusBelli, SimulationState, TerritorialClaim } from '../types';

export interface DiplomacyContext { countryIds: ReadonlySet<string>; regionIds: ReadonlySet<string> }
export type AvailableCasusBelli =
  | { id: string; issuerCountryId: string; targetCountryId: string; type: 'territorial_claim'; creationDate: string; targetRegionIds: string[]; source: 'claim'; claimId: string; reason?: string }
  | (ExplicitCasusBelli & { source: 'explicit' });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const requireCountry = (context: DiplomacyContext, countryId: string) => { if (!context.countryIds.has(countryId)) throw new Error(`Unknown Country ID: ${countryId}`); };
const requireRegion = (context: DiplomacyContext, regionId: string) => { if (!context.regionIds.has(regionId)) throw new Error(`Unknown Region ID: ${regionId}`); };
const cloneDiplomacy = (state: SimulationState): SimulationState => ({ ...state, bilateralRelations: { ...state.bilateralRelations }, claims: state.claims.map(claim => ({ ...claim })), explicitCasusBelli: state.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })) });

export function countryPairKey(countryAId: string, countryBId: string) {
  if (countryAId === countryBId) throw new Error('A Country cannot have a bilateral relation with itself.');
  return [countryAId, countryBId].sort().join('::');
}

export function getRelation(state: SimulationState, countryAId: string, countryBId: string): BilateralRelation {
  const key = countryPairKey(countryAId, countryBId), stored = state.bilateralRelations[key];
  if (stored) return { ...stored };
  const [countryA, countryB] = [countryAId, countryBId].sort();
  return { countryAId: countryA, countryBId: countryB, score: 0, status: 'neutral' };
}
export const getDiplomaticStatus = (state: SimulationState, countryAId: string, countryBId: string) => getRelation(state, countryAId, countryBId).status;

export function setRelation(state: SimulationState, countryAId: string, countryBId: string, score: number, status: DiplomaticStatus, context: DiplomacyContext): SimulationState {
  requireCountry(context, countryAId); requireCountry(context, countryBId);
  if (!Number.isFinite(score)) throw new Error('Diplomatic relation score must be finite.');
  if (!['neutral', 'friendly', 'hostile'].includes(status)) throw new Error(`Invalid diplomatic status: ${String(status)}`);
  const key = countryPairKey(countryAId, countryBId), [countryA, countryB] = [countryAId, countryBId].sort();
  return { ...state, bilateralRelations: { ...state.bilateralRelations, [key]: { countryAId: countryA, countryBId: countryB, score: Math.max(-100, Math.min(100, score)), status } } };
}
export function adjustRelation(state: SimulationState, countryAId: string, countryBId: string, adjustment: number, context: DiplomacyContext) {
  if (!Number.isFinite(adjustment)) throw new Error('Diplomatic relation adjustment must be finite.');
  const current = getRelation(state, countryAId, countryBId);
  return setRelation(state, countryAId, countryBId, current.score + adjustment, current.status, context);
}

export function createClaim(state: SimulationState, claim: Omit<TerritorialClaim, 'status'> & { status?: 'active' }, context: DiplomacyContext): SimulationState {
  requireCountry(context, claim.claimantCountryId); requireRegion(context, claim.regionId);
  if (!claim.id || !validDate(claim.creationDate) || !['territorial', 'core'].includes(claim.type)) throw new Error('Malformed territorial claim.');
  if (state.claims.some(existing => existing.id === claim.id)) throw new Error(`Duplicate claim ID: ${claim.id}`);
  if (state.claims.some(existing => existing.status === 'active' && existing.claimantCountryId === claim.claimantCountryId && existing.regionId === claim.regionId)) throw new Error(`Duplicate active claim: ${claim.claimantCountryId} -> ${claim.regionId}`);
  return { ...state, claims: [...state.claims, { ...claim, status: 'active' }] };
}
export function renounceClaim(state: SimulationState, claimId: string): SimulationState {
  const claim = state.claims.find(item => item.id === claimId); if (!claim) throw new Error(`Unknown claim ID: ${claimId}`);
  if (claim.status === 'renounced') return cloneDiplomacy(state);
  return { ...state, claims: state.claims.map(item => item.id === claimId ? { ...item, status: 'renounced' } : { ...item }) };
}

export function createExplicitCasusBelli(state: SimulationState, cb: Omit<ExplicitCasusBelli, 'status'> & { status?: 'active' }, context: DiplomacyContext): SimulationState {
  requireCountry(context, cb.issuerCountryId); requireCountry(context, cb.targetCountryId);
  if (cb.issuerCountryId === cb.targetCountryId) throw new Error('A Country cannot receive a casus belli against itself.');
  for (const regionId of cb.targetRegionIds ?? []) requireRegion(context, regionId);
  if (!cb.id || !validDate(cb.creationDate) || (cb.expiryDate !== undefined && (!validDate(cb.expiryDate) || cb.expiryDate < cb.creationDate)) || !['territorial_claim', 'retaliation', 'containment'].includes(cb.type)) throw new Error('Malformed explicit casus belli.');
  if (state.explicitCasusBelli.some(existing => existing.id === cb.id)) throw new Error(`Duplicate explicit casus belli ID: ${cb.id}`);
  return { ...state, explicitCasusBelli: [...state.explicitCasusBelli, { ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined, status: 'active' }] };
}
function updateExplicitCasusBelliStatus(state: SimulationState, cbId: string, status: 'revoked' | 'expired'): SimulationState {
  if (!state.explicitCasusBelli.some(cb => cb.id === cbId)) throw new Error(`Unknown explicit casus belli ID: ${cbId}`);
  return { ...state, explicitCasusBelli: state.explicitCasusBelli.map(cb => cb.id === cbId ? { ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined, status } : { ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined }) };
}
export const revokeCasusBelli = (state: SimulationState, cbId: string) => updateExplicitCasusBelliStatus(state, cbId, 'revoked');
export const expireCasusBelli = (state: SimulationState, cbId: string) => updateExplicitCasusBelliStatus(state, cbId, 'expired');

export function getAvailableCasusBelli(state: SimulationState, attackerCountryId: string, targetCountryId: string, context?: DiplomacyContext): AvailableCasusBelli[] {
  if (attackerCountryId === targetCountryId) return [];
  if (context) { requireCountry(context, attackerCountryId); requireCountry(context, targetCountryId); }
  const derived: AvailableCasusBelli[] = state.claims.flatMap(claim => {
    if (claim.status !== 'active' || claim.claimantCountryId !== attackerCountryId) return [];
    if (context && (!context.countryIds.has(claim.claimantCountryId) || !context.regionIds.has(claim.regionId))) return [];
    const owner = state.regionOwnership[claim.regionId];
    if (!owner || owner === attackerCountryId || owner !== targetCountryId || (context && !context.countryIds.has(owner))) return [];
    return [{ id: `claim-derived:${claim.id}:${owner}`, issuerCountryId: attackerCountryId, targetCountryId: owner, type: 'territorial_claim' as const, creationDate: claim.creationDate, targetRegionIds: [claim.regionId], source: 'claim' as const, claimId: claim.id, reason: claim.reason }];
  });
  const explicit = state.explicitCasusBelli
    .filter(cb => cb.status === 'active'
      && cb.issuerCountryId === attackerCountryId
      && cb.targetCountryId === targetCountryId
      && cb.creationDate <= state.date
      && (!cb.expiryDate || state.date <= cb.expiryDate)
      && (!context || (context.countryIds.has(cb.issuerCountryId) && context.countryIds.has(cb.targetCountryId) && !(cb.targetRegionIds ?? []).some(regionId => !context.regionIds.has(regionId)))))
    .map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined, source: 'explicit' as const }));
  return [...derived, ...explicit].sort((a, b) => a.id.localeCompare(b.id));
}

export function validateDiplomacyState(state: SimulationState, context: DiplomacyContext) {
  const errors: string[] = [], relationPairs = new Set<string>(), claimIds = new Set<string>(), activeClaims = new Set<string>(), cbIds = new Set<string>();
  for (const [key, relation] of Object.entries(state.bilateralRelations)) {
    if (!context.countryIds.has(relation.countryAId) || !context.countryIds.has(relation.countryBId)) errors.push(`Relation references unknown Country: ${key}`);
    let canonical: string | undefined; try { canonical = countryPairKey(relation.countryAId, relation.countryBId); } catch { errors.push(`Self-relation is forbidden: ${key}`); }
    if (canonical && (key !== canonical || relationPairs.has(canonical))) errors.push(`Duplicate or non-canonical bilateral relation: ${key}`); if (canonical) relationPairs.add(canonical);
    if (!Number.isFinite(relation.score) || relation.score < -100 || relation.score > 100 || !['neutral', 'friendly', 'hostile'].includes(relation.status)) errors.push(`Malformed bilateral relation: ${key}`);
  }
  for (const claim of state.claims) {
    if (!claim.id || claimIds.has(claim.id)) errors.push(`Duplicate or missing claim ID: ${claim.id}`); claimIds.add(claim.id);
    if (!context.countryIds.has(claim.claimantCountryId) || !context.regionIds.has(claim.regionId)) errors.push(`Claim references unknown entity: ${claim.id}`);
    if (!validDate(claim.creationDate) || !['territorial', 'core'].includes(claim.type) || !['active', 'renounced'].includes(claim.status)) errors.push(`Malformed claim: ${claim.id}`);
    if (claim.status === 'active') { const key = `${claim.claimantCountryId}::${claim.regionId}`; if (activeClaims.has(key)) errors.push(`Duplicate active claim: ${key}`); activeClaims.add(key); }
  }
  for (const cb of state.explicitCasusBelli) {
    if (!cb.id || cbIds.has(cb.id)) errors.push(`Duplicate or missing explicit casus belli ID: ${cb.id}`); cbIds.add(cb.id);
    if (!context.countryIds.has(cb.issuerCountryId) || !context.countryIds.has(cb.targetCountryId) || cb.issuerCountryId === cb.targetCountryId || cb.targetRegionIds?.some(regionId => !context.regionIds.has(regionId))) errors.push(`Explicit casus belli references an invalid entity: ${cb.id}`);
    if (!validDate(cb.creationDate) || (cb.expiryDate !== undefined && (!validDate(cb.expiryDate) || cb.expiryDate < cb.creationDate)) || !['territorial_claim', 'retaliation', 'containment'].includes(cb.type) || !['active', 'used', 'expired', 'revoked'].includes(cb.status)) errors.push(`Malformed explicit casus belli: ${cb.id}`);
  }
  for (const [regionId, owner] of Object.entries(state.regionOwnership)) if (!context.regionIds.has(regionId) || (owner !== undefined && !context.countryIds.has(owner))) errors.push(`Region ownership references an invalid entity: ${regionId}`);
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
