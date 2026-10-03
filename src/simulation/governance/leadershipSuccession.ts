import type { SimulationState } from '../../types';
import { scaledRatioSigned } from '../integerMath';
import { deterministicInteger } from '../rng';
import { allocate, integer, ratio } from '../socioeconomy/model';
import { POLITICAL_ISSUES, type PoliticalParty, type PoliticalRegistry } from '../politics/model';
import { governanceFingerprint, type LeadershipSuccessionEvidence, type LeadershipTendency, type PoliticalPersonState } from './model';

export const LEADERSHIP_SUCCESSION_MODEL = Object.freeze({
  method: 'internal_party_balance_succession_v1' as const,
  tendencies: Object.freeze([
    { id: 'radical', stanceBps: 10_000, baselineWeightBps: 1_000 },
    { id: 'firm', stanceBps: 5_000, baselineWeightBps: 2_000 },
    { id: 'mainstream', stanceBps: 0, baselineWeightBps: 4_000 },
    { id: 'pragmatic', stanceBps: -5_000, baselineWeightBps: 2_000 },
    { id: 'moderate', stanceBps: -10_000, baselineWeightBps: 1_000 },
  ] as const),
  mandateSignalLimitBps: 5_000,
  adaptationPressureLimitBps: 5_000,
  stabilityPressureLimitBps: 3_000,
  tendencyHalfSpreadBps: 1_400,
  maxProfileDeviationBps: 2_500,
  mandateBlendBaseBps: 2_000,
  mandateBlendMinBps: 1_000,
  mandateBlendMaxBps: 4_500,
  modelConfidenceCapBps: 7_000,
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
const clampBps = (value: number) => clamp(value, 0, 10_000);
const validBps = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
const tendencyById = new Map<LeadershipTendency, typeof LEADERSHIP_SUCCESSION_MODEL.tendencies[number]>(
  LEADERSHIP_SUCCESSION_MODEL.tendencies.map(item => [item.id, item]),
);

function roundedBigIntRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator < 0n) throw new Error('Invalid leadership ratio.');
  const value = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(value)) throw new Error('Leadership ratio exceeds safe integer range.');
  return value;
}

function partySupportSnapshot(
  state: SimulationState, registry: PoliticalRegistry, countryId: string, partyId: string,
): LeadershipSuccessionEvidence['partySupport'] {
  const definition = registry.countries[countryId], dynamic = state.politics.countries[countryId];
  if (!definition || !dynamic) return {
    coverage: 'unavailable', source: 'politics.nationalSupportBps',
    limitation: 'No current modelled national party-support state is available.',
  };
  const partyIndex = definition.partyIds.indexOf(partyId);
  if (partyIndex < 0 || dynamic.nationalSupportBps.length !== definition.partyIds.length + 1
    || !dynamic.nationalSupportBps.every(validBps) || dynamic.nationalSupportBps.reduce((sum, value) => sum + value, 0) !== 10_000) return {
    coverage: 'unavailable', source: 'politics.nationalSupportBps',
    limitation: 'Current party support does not reconcile with the pinned party registry.',
  };
  return {
    valueBps: dynamic.nationalSupportBps[partyIndex], coverage: 'modelled', source: 'politics.nationalSupportBps',
    limitation: 'Current national support is the existing cohort-based ProjectAtlas opinion aggregate, not a polling observation.',
  };
}

function legislativeSeatShareSnapshot(
  registry: PoliticalRegistry, countryId: string, partyId: string,
): LeadershipSuccessionEvidence['legislativeSeatShare'] {
  const country = registry.countries[countryId], institution = registry.institutions[country?.institutionId];
  if (!country || !institution || !country.partyIds.includes(partyId)) return {
    coverage: 'unavailable', source: 'politicalRegistry.institutions.chambers',
    limitation: 'No reconciled national institution exists for this party.',
  };
  const shares: number[] = [];
  for (const chamber of institution.chambers) {
    if (chamber.countryId !== countryId || chamber.seatAllocationStatus !== 'sourced'
      || chamber.totalSeats === undefined || chamber.totalSeats <= 0) continue;
    shares.push(ratio(chamber.seatsByParty[partyId] ?? 0, 10_000, chamber.totalSeats));
  }
  if (!shares.length) return {
    coverage: 'unavailable', source: 'politicalRegistry.institutions.chambers',
    limitation: 'No complete sourced chamber allocation is available for a legislative power-balance snapshot.',
  };
  return {
    valueBps: ratio(shares.reduce((sum, value) => sum + value, 0), 1, shares.length),
    coverage: 'sourced', source: 'politicalRegistry.institutions.chambers',
    limitation: 'Legislative power balance is the equal-chamber average of party share in complete sourced seat allocations.',
  };
}

function supporterMandateSnapshot(
  state: SimulationState, registry: PoliticalRegistry, countryId: string, partyId: string,
): LeadershipSuccessionEvidence['supporterMandate'] {
  const result = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, {
    coverage: 'unavailable' as const, source: 'politics.regionalOpinion',
    limitation: 'No represented current supporters are available for this issue.',
  }])) as LeadershipSuccessionEvidence['supporterMandate'];
  const definition = registry.countries[countryId], country = state.politics.countries[countryId];
  if (!definition || !country) return result;
  const partyIndex = definition.partyIds.indexOf(partyId);
  if (partyIndex < 0) return result;
  const numerators = POLITICAL_ISSUES.map(() => 0n);
  let denominator = 0n;
  for (const regionId of [...country.regionIds].sort()) {
    const regional = state.politics.regionalOpinion[regionId], socio = state.socioeconomy.regions[regionId];
    if (!regional || regional.countryId !== countryId || !socio) continue;
    const personsByCohort = new Map(socio.cohorts.map(cohort => [`${cohort.income}:${cohort.orientation}`, cohort.persons]));
    for (const [cohortId, opinion] of Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const persons = integer(personsByCohort.get(cohortId) ?? 0), supportBps = opinion[2][partyIndex];
      if (!persons) continue;
      if (!validBps(supportBps) || opinion[0].length !== POLITICAL_ISSUES.length || !opinion[0].every(validBps)) {
        throw new Error(`Invalid leadership supporter opinion for ${regionId}/${cohortId}.`);
      }
      if (!supportBps) continue;
      const weight = BigInt(persons) * BigInt(supportBps);
      denominator += weight;
      opinion[0].forEach((preferenceBps, index) => { numerators[index] += BigInt(preferenceBps) * weight; });
    }
  }
  if (!denominator) return result;
  POLITICAL_ISSUES.forEach((issue, index) => {
    result[issue] = {
      valueBps: clampBps(roundedBigIntRatio(numerators[index], denominator)),
      coverage: 'modelled', source: 'politics.regionalOpinion',
      limitation: 'Supporter mandate is a population- and party-support-weighted mean of current modelled cohort preferences; it is not observed party membership or faction data.',
    };
  });
  return result;
}

export interface LeadershipSelectionMetrics {
  mandateTendencyBps: number;
  adaptationPressureBps: number;
  stabilityPressureBps: number;
  mandateBlendBps: number;
  tendencyWeightsBps: Record<LeadershipTendency, number>;
}

export function deriveLeadershipSelectionMetrics(
  party: PoliticalParty,
  evidence: Pick<LeadershipSuccessionEvidence, 'partySupport' | 'legislativeSeatShare' | 'supporterMandate'>,
): LeadershipSelectionMetrics {
  let weightedSignal = 0, signalWeight = 0;
  for (const issue of POLITICAL_ISSUES) {
    const mandate = evidence.supporterMandate[issue], position = party.issuePositions[issue];
    if (mandate.coverage !== 'modelled' || mandate.valueBps === undefined || position.preferenceBps === 5_000) continue;
    const radicalnessDelta = (mandate.valueBps - position.preferenceBps) * Math.sign(position.preferenceBps - 5_000);
    const weight = Math.max(1, position.intensityBps);
    weightedSignal += radicalnessDelta * weight; signalWeight += weight;
  }
  const mandateTendencyBps = clamp(signalWeight ? scaledRatioSigned(weightedSignal, 1, signalWeight) : 0,
    -LEADERSHIP_SUCCESSION_MODEL.mandateSignalLimitBps, LEADERSHIP_SUCCESSION_MODEL.mandateSignalLimitBps);
  const comparable = evidence.partySupport.valueBps !== undefined && evidence.partySupport.coverage === 'modelled'
    && evidence.legislativeSeatShare.valueBps !== undefined && evidence.legislativeSeatShare.coverage === 'sourced';
  const gap = comparable ? evidence.legislativeSeatShare.valueBps! - evidence.partySupport.valueBps! : undefined;
  const adaptationPressureBps = gap === undefined ? 0 : clamp(Math.max(0, gap) * 2, 0, LEADERSHIP_SUCCESSION_MODEL.adaptationPressureLimitBps);
  const stabilityPressureBps = gap === undefined ? 0 : clamp(Math.max(0, -gap) * 2, 0, LEADERSHIP_SUCCESSION_MODEL.stabilityPressureLimitBps);
  const factorFor = (id: LeadershipTendency) => clamp(
    id === 'radical' ? 10_000 + mandateTendencyBps - Math.round(adaptationPressureBps / 2)
      : id === 'firm' ? 10_000 + Math.round(mandateTendencyBps / 2) - Math.round(adaptationPressureBps / 4)
        : id === 'mainstream' ? 10_000 + stabilityPressureBps + Math.round(adaptationPressureBps / 4)
          : id === 'pragmatic' ? 10_000 - Math.round(mandateTendencyBps / 2) + Math.round(adaptationPressureBps / 2)
            : 10_000 - mandateTendencyBps + adaptationPressureBps,
    2_500, 20_000);
  const raw = LEADERSHIP_SUCCESSION_MODEL.tendencies.map(item => ratio(item.baselineWeightBps, factorFor(item.id), 10_000));
  const normalized = allocate(10_000, raw);
  const tendencyWeightsBps = Object.fromEntries(LEADERSHIP_SUCCESSION_MODEL.tendencies.map((item, index) => [item.id, normalized[index]])) as Record<LeadershipTendency, number>;
  const anyMandate = POLITICAL_ISSUES.some(issue => evidence.supporterMandate[issue].coverage === 'modelled' && evidence.supporterMandate[issue].valueBps !== undefined);
  const mandateBlendBps = anyMandate ? clamp(LEADERSHIP_SUCCESSION_MODEL.mandateBlendBaseBps
    + Math.round(adaptationPressureBps / 2) - Math.round(stabilityPressureBps / 4),
    LEADERSHIP_SUCCESSION_MODEL.mandateBlendMinBps, LEADERSHIP_SUCCESSION_MODEL.mandateBlendMaxBps) : 0;
  return { mandateTendencyBps, adaptationPressureBps, stabilityPressureBps, mandateBlendBps, tendencyWeightsBps };
}

export function selectLeadershipTendency(
  seed: SimulationState['engine']['seed'], partyId: string, effectiveDate: string, successionId: string,
  weights: Record<LeadershipTendency, number>,
): LeadershipTendency {
  const ordered = LEADERSHIP_SUCCESSION_MODEL.tendencies;
  if (ordered.some(item => !Number.isSafeInteger(weights[item.id]) || weights[item.id] < 0)
    || ordered.reduce((sum, item) => sum + weights[item.id], 0) !== 10_000) throw new Error('Invalid leadership tendency weights.');
  const roll = deterministicInteger(seed, {
    system: 'party-leadership.internal-balance', entityId: partyId, date: effectiveDate, eventKey: `${successionId}:tendency`,
  }, 0, 10_000);
  let cursor = 0;
  for (const item of ordered) { cursor += weights[item.id]; if (roll < cursor) return item.id; }
  throw new Error('Leadership tendency allocation did not reconcile.');
}

function tendencyPosition(partyPreferenceBps: number, stanceBps: number): number {
  const direction = Math.sign(partyPreferenceBps - 5_000);
  if (!direction) return 5_000;
  const shift = scaledRatioSigned(stanceBps, LEADERSHIP_SUCCESSION_MODEL.tendencyHalfSpreadBps, 10_000);
  let value = clampBps(partyPreferenceBps + direction * shift);
  if (stanceBps < 0) value = direction > 0 ? Math.max(5_000, value) : Math.min(5_000, value);
  return value;
}

export function leadershipProfileFromEvidence(
  party: PoliticalParty, evidence: LeadershipSuccessionEvidence,
): NonNullable<PoliticalPersonState['leaderProfile']> {
  if (evidence.method !== LEADERSHIP_SUCCESSION_MODEL.method) throw new Error('Unsupported leadership succession evidence model.');
  const selected = tendencyById.get(evidence.selectedTendency);
  if (!selected) throw new Error('Unknown leadership tendency.');
  const metrics = deriveLeadershipSelectionMetrics(party, evidence);
  return Object.fromEntries(POLITICAL_ISSUES.map(issue => {
    const position = party.issuePositions[issue], mandate = evidence.supporterMandate[issue];
    const tendencyValue = tendencyPosition(position.preferenceBps, selected.stanceBps);
    const blended = metrics.mandateBlendBps > 0 && mandate.coverage === 'modelled' && mandate.valueBps !== undefined
      ? tendencyValue + scaledRatioSigned(mandate.valueBps - tendencyValue, metrics.mandateBlendBps, 10_000) : tendencyValue;
    const bounded = clamp(blended, Math.max(0, position.preferenceBps - LEADERSHIP_SUCCESSION_MODEL.maxProfileDeviationBps),
      Math.min(10_000, position.preferenceBps + LEADERSHIP_SUCCESSION_MODEL.maxProfileDeviationBps));
    return [issue, {
      valueBps: bounded, confidenceBps: Math.min(position.confidenceBps, LEADERSHIP_SUCCESSION_MODEL.modelConfidenceCapBps),
      status: 'modelled' as const,
      limitation: `Generated from the fictional party platform, the modelled ${evidence.selectedTendency} leadership tendency, and available current supporter/power-balance context. This is not observed faction membership or a claim about a real person's beliefs.`,
    }];
  }));
}

export function buildLeadershipSuccessionEvidence(
  state: SimulationState, partyId: string, successionId: string, registry: PoliticalRegistry,
): LeadershipSuccessionEvidence {
  const party = registry.parties[partyId];
  if (!party || !registry.countries[party.countryId]) throw new Error(`Unknown party for leadership succession: ${partyId}`);
  const draft = {
    method: LEADERSHIP_SUCCESSION_MODEL.method,
    partySupport: partySupportSnapshot(state, registry, party.countryId, partyId),
    legislativeSeatShare: legislativeSeatShareSnapshot(registry, party.countryId, partyId),
    supporterMandate: supporterMandateSnapshot(state, registry, party.countryId, partyId),
  };
  const metrics = deriveLeadershipSelectionMetrics(party, draft);
  const selectedTendency = selectLeadershipTendency(state.engine.seed, partyId, state.date, successionId, metrics.tendencyWeightsBps);
  const evidence: LeadershipSuccessionEvidence = {
    ...draft, selectedTendency, profileFingerprint: '',
    limitation: 'Generated successor selection uses a modelled common internal-party tendency prior, current modelled supporter preferences, and sourced legislative representation when available. It creates no persistent factions and does not treat missing evidence as zero.',
  };
  return { ...evidence, profileFingerprint: governanceFingerprint(leadershipProfileFromEvidence(party, evidence)) };
}
