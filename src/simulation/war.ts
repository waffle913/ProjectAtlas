import type { LimitedWar, RegionOccupation, SimulationState, WarDeclarationCasusBelliSnapshot } from '../types';
import { getAvailableCasusBelli, type DiplomacyContext } from './diplomacy';
import { isSimulationDate as validDate } from './date';

export type WarContext = DiplomacyContext;
export type WarOutcome = 'attacker_victory' | 'defender_victory' | 'white_peace';
const pairKey = (a: string, b: string) => [a, b].sort().join('::');
const cloneWar = (war: LimitedWar): LimitedWar => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } });
const cloneOccupation = (occupation: RegionOccupation): RegionOccupation => ({ ...occupation });
const cloneWars = (state: SimulationState) => state.wars.map(cloneWar);
const cloneOccupations = (state: SimulationState) => Object.fromEntries(Object.entries(state.occupationByRegion).map(([regionId, occupation]) => [regionId, cloneOccupation(occupation)]));
const requireCountry = (context: WarContext, countryId: string) => { if (!context.countryIds.has(countryId)) throw new Error(`Unknown Country ID: ${countryId}`); };
const requireRegion = (context: WarContext, regionId: string) => { if (!context.regionIds.has(regionId)) throw new Error(`Unknown Region ID: ${regionId}`); };

export interface DeclareLimitedWarParams {
  warId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  targetRegionId: string;
  casusBelliId: string;
  startDate?: string;
}

export function declareLimitedWar(state: SimulationState, params: DeclareLimitedWarParams, context: WarContext): SimulationState {
  const { warId, attackerCountryId, defenderCountryId, targetRegionId, casusBelliId } = params;
  requireCountry(context, attackerCountryId); requireCountry(context, defenderCountryId); requireRegion(context, targetRegionId);
  if (!warId || state.wars.some(war => war.id === warId)) throw new Error(`Duplicate or missing war ID: ${warId}`);
  if (attackerCountryId === defenderCountryId) throw new Error('A Country cannot declare war on itself.');
  if (state.wars.some(war => war.status === 'active' && pairKey(war.attackerCountryId, war.defenderCountryId) === pairKey(attackerCountryId, defenderCountryId))) throw new Error('A simultaneous active war already exists between these Countries.');
  if (state.regionOwnership[targetRegionId] !== defenderCountryId) throw new Error('The target Region is not currently owned by the defender.');
  const startDate = params.startDate ?? state.date;
  if (!validDate(startDate) || startDate !== state.date) throw new Error('War declaration date must equal the current simulation date.');
  const available = getAvailableCasusBelli(state, attackerCountryId, defenderCountryId, context);
  const cb = available.find(item => item.id === casusBelliId);
  if (!cb) throw new Error('The selected casus belli is not currently available.');
  if (cb.type !== 'territorial_claim' || !cb.targetRegionIds?.includes(targetRegionId)) throw new Error('The selected casus belli does not authorize this take_region objective.');
  const snapshot: WarDeclarationCasusBelliSnapshot = { id: cb.id, issuerCountryId: cb.issuerCountryId, targetCountryId: cb.targetCountryId, type: cb.type, source: cb.source, creationDate: cb.creationDate, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined, reason: cb.reason, ...(cb.source === 'claim' ? { claimId: cb.claimId } : { originatingEventId: cb.originatingEventId }) };
  const war: LimitedWar = { id: warId, attackerCountryId, defenderCountryId, status: 'active', startDate, warGoal: 'take_region', targetRegionId, declarationCasusBelli: snapshot };
  return { ...state, wars: [...cloneWars(state), war], occupationByRegion: cloneOccupations(state), claims: state.claims.map(claim => ({ ...claim })), explicitCasusBelli: state.explicitCasusBelli.map(explicit => ({ ...explicit, targetRegionIds: explicit.targetRegionIds ? [...explicit.targetRegionIds] : undefined, status: cb.source === 'explicit' && explicit.id === cb.id ? 'used' : explicit.status })) };
}

export function occupyRegion(state: SimulationState, params: { regionId: string; warId: string; occupierCountryId: string; startDate?: string }, context: WarContext): SimulationState {
  requireRegion(context, params.regionId); requireCountry(context, params.occupierCountryId);
  const war = state.wars.find(item => item.id === params.warId); if (!war) throw new Error(`Unknown war ID: ${params.warId}`);
  if (war.status !== 'active') throw new Error('Occupation requires an active war.');
  if (state.occupationByRegion[params.regionId]) throw new Error(`Region is already occupied: ${params.regionId}`);
  const opposingCountryId = params.occupierCountryId === war.attackerCountryId ? war.defenderCountryId : params.occupierCountryId === war.defenderCountryId ? war.attackerCountryId : undefined;
  if (!opposingCountryId) throw new Error('Only a belligerent may occupy a Region in this war.');
  if (state.regionOwnership[params.regionId] !== opposingCountryId) throw new Error('A belligerent may occupy only a Region sovereignly owned by its opponent.');
  const startDate = params.startDate ?? state.date; if (!validDate(startDate) || startDate < war.startDate || startDate !== state.date) throw new Error('Occupation start date must equal the current simulation date and not precede the war.');
  return { ...state, wars: cloneWars(state), occupationByRegion: { ...cloneOccupations(state), [params.regionId]: { regionId: params.regionId, warId: params.warId, occupierCountryId: params.occupierCountryId, startDate } } };
}

export function liberateRegion(state: SimulationState, regionId: string, liberatorCountryId: string, context: WarContext): SimulationState {
  requireRegion(context, regionId); requireCountry(context, liberatorCountryId);
  const occupation = state.occupationByRegion[regionId]; if (!occupation) throw new Error(`Region is not occupied: ${regionId}`);
  const war = state.wars.find(item => item.id === occupation.warId); if (!war || war.status !== 'active') throw new Error('Only an occupation under an active war may be liberated.');
  if (state.regionOwnership[regionId] !== liberatorCountryId || occupation.occupierCountryId === liberatorCountryId) throw new Error('Only the sovereign owner may liberate an enemy-occupied Region.');
  const occupations = cloneOccupations(state); delete occupations[regionId];
  return { ...state, wars: cloneWars(state), occupationByRegion: occupations };
}

export const getRegionOccupation = (state: SimulationState, regionId: string) => state.occupationByRegion[regionId] ? cloneOccupation(state.occupationByRegion[regionId]) : undefined;
export const getWarOccupations = (state: SimulationState, warId: string) => Object.values(state.occupationByRegion).filter(occupation => occupation.warId === warId).map(cloneOccupation).sort((a, b) => a.regionId.localeCompare(b.regionId));
export function isWarGoalSatisfied(state: SimulationState, warId: string) {
  const war = state.wars.find(item => item.id === warId); if (!war) throw new Error(`Unknown war ID: ${warId}`);
  return war.status === 'active' && war.warGoal === 'take_region' && state.occupationByRegion[war.targetRegionId]?.warId === war.id && state.occupationByRegion[war.targetRegionId]?.occupierCountryId === war.attackerCountryId;
}

export function endWar(state: SimulationState, warId: string, outcome: WarOutcome, context: WarContext): SimulationState {
  const war = state.wars.find(item => item.id === warId); if (!war) throw new Error(`Unknown war ID: ${warId}`);
  requireCountry(context, war.attackerCountryId); requireCountry(context, war.defenderCountryId); requireRegion(context, war.targetRegionId);
  if (war.status !== 'active') throw new Error('Only an active war may be ended.');
  if (!validDate(state.date) || state.date < war.startDate) throw new Error('War end date cannot precede its start date.');
  if (!['attacker_victory', 'defender_victory', 'white_peace'].includes(outcome)) throw new Error(`Invalid war outcome: ${String(outcome)}`);
  if (outcome === 'attacker_victory' && !isWarGoalSatisfied(state, warId)) throw new Error('Attacker victory requires the declared take_region objective to be satisfied.');
  if (outcome === 'attacker_victory' && state.regionOwnership[war.targetRegionId] !== war.defenderCountryId) throw new Error('The defender no longer owns the declared target Region.');
  const wars = state.wars.map(item => item.id === warId ? { ...cloneWar(item), status: 'ended' as const, endDate: state.date, outcome } : cloneWar(item));
  const occupationByRegion = Object.fromEntries(Object.entries(state.occupationByRegion).filter(([, occupation]) => occupation.warId !== warId).map(([regionId, occupation]) => [regionId, cloneOccupation(occupation)]));
  const regionOwnership = outcome === 'attacker_victory' ? { ...state.regionOwnership, [war.targetRegionId]: war.attackerCountryId } : { ...state.regionOwnership };
  return { ...state, wars, occupationByRegion, regionOwnership, territoryOwnership: { ...state.territoryOwnership }, populationByRegion: { ...state.populationByRegion }, economicOutputByRegion: { ...state.economicOutputByRegion }, claims: state.claims.map(claim => ({ ...claim })), explicitCasusBelli: state.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })) };
}

export function validateWarState(state: SimulationState, context: WarContext) {
  const errors: string[] = [], warIds = new Set<string>(), activePairs = new Set<string>();
  if (!validDate(state.date)) errors.push(`Malformed simulation date: ${String(state.date)}`);
  for (const war of state.wars) {
    if (!war.id || warIds.has(war.id)) errors.push(`Duplicate or missing war ID: ${war.id}`); warIds.add(war.id);
    if (!context.countryIds.has(war.attackerCountryId) || !context.countryIds.has(war.defenderCountryId) || war.attackerCountryId === war.defenderCountryId) errors.push(`War has invalid belligerents: ${war.id}`);
    if (!context.regionIds.has(war.targetRegionId) || war.warGoal !== 'take_region') errors.push(`War has invalid target Region or goal: ${war.id}`);
    if (!validDate(war.startDate) || war.startDate > state.date || (war.endDate !== undefined && (!validDate(war.endDate) || war.endDate < war.startDate || war.endDate > state.date))) errors.push(`War has malformed or future dates: ${war.id}`);
    if (war.status === 'active') {
      if (war.endDate !== undefined || war.outcome !== undefined) errors.push(`Active war contains an end state: ${war.id}`);
      if (war.warGoal === 'take_region' && state.regionOwnership[war.targetRegionId] !== war.defenderCountryId) errors.push(`Active war target is not sovereignly owned by the defender: ${war.id}`);
      const pair = pairKey(war.attackerCountryId, war.defenderCountryId); if (activePairs.has(pair)) errors.push(`Duplicate active war pair: ${pair}`); activePairs.add(pair);
    } else if (war.status === 'ended') { if (!war.endDate || !war.outcome || !['attacker_victory', 'defender_victory', 'white_peace'].includes(war.outcome)) errors.push(`Ended war lacks a valid outcome: ${war.id}`); }
    else errors.push(`Invalid war status: ${war.id}`);
    const cb = war.declarationCasusBelli;
    if (cb?.targetRegionIds && (cb.targetRegionIds.some(id => !context.regionIds.has(id)) || new Set(cb.targetRegionIds).size !== cb.targetRegionIds.length)) errors.push(`War CB snapshot contains unknown or duplicate Regions: ${war.id}`);
    if (!cb || !cb.id || cb.issuerCountryId !== war.attackerCountryId || cb.targetCountryId !== war.defenderCountryId || cb.type !== 'territorial_claim' || !['claim', 'explicit'].includes(cb.source) || !validDate(cb.creationDate) || cb.creationDate > war.startDate || !cb.targetRegionIds?.includes(war.targetRegionId) || (cb.source === 'claim' && !cb.claimId)) errors.push(`War has malformed declaration CB snapshot: ${war.id}`);
  }
  for (const [regionId, occupation] of Object.entries(state.occupationByRegion)) {
    if (regionId !== occupation.regionId || !context.regionIds.has(regionId) || !validDate(occupation.startDate) || occupation.startDate > state.date) errors.push(`Malformed or future Region occupation: ${regionId}`);
    const war = state.wars.find(item => item.id === occupation.warId);
    if (!war || war.status !== 'active') { errors.push(`Occupation references a missing or ended war: ${regionId}`); continue; }
    const opponent = occupation.occupierCountryId === war.attackerCountryId ? war.defenderCountryId : occupation.occupierCountryId === war.defenderCountryId ? war.attackerCountryId : undefined;
    if (!opponent || !context.countryIds.has(occupation.occupierCountryId) || state.regionOwnership[regionId] !== opponent || occupation.startDate < war.startDate) errors.push(`Occupation violates belligerent or sovereignty rules: ${regionId}`);
  }
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
