import { scaledRatioSigned } from '../integerMath';
import { ratio } from '../socioeconomy/model';
import type { PoliticalCoverage, PoliticalRegistry } from '../politics/model';
import { governanceFingerprint, INSTITUTIONAL_POWER_LEVERS, type EvaluationCoverage, type InstitutionalPowerHolder, type InstitutionalPowerTransfer, type PartyInstitutionalInterestEvaluation, type PartyInstitutionalStake, type PartyProposalEvaluation } from './model';

export const INSTITUTIONAL_INTEREST_MODEL = Object.freeze({
  method: 'situational_institutional_interest_v1' as const,
  maxAgreementAdjustmentBps: 6_000,
  partialEvidenceConfidenceBps: 7_000,
  sensitivityMinBps: 5_000,
  sensitivityMaxBps: 15_000,
});

const clampBps = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const clampSignedBps = (value: number) => Math.max(-10_000, Math.min(10_000, Math.round(value)));
const coverageRank: Readonly<Record<EvaluationCoverage, number>> = { unavailable: 0, partial: 1, complete: 2 };
const weakestCoverage = (...values: readonly EvaluationCoverage[]): EvaluationCoverage =>
  values.reduce((weakest, value) => coverageRank[value] < coverageRank[weakest] ? value : weakest, 'complete');
const politicalCoverage = (value: PoliticalCoverage): EvaluationCoverage =>
  value === 'sourced' ? 'complete' : ['partial', 'modelled', 'modelled_fallback'].includes(value) ? 'partial' : 'unavailable';
const coverageConfidence = (value: EvaluationCoverage) => value === 'complete' ? 10_000 : value === 'partial' ? INSTITUTIONAL_INTEREST_MODEL.partialEvidenceConfidenceBps : 0;

export function isInstitutionalPowerHolder(value: unknown): value is InstitutionalPowerHolder {
  return value === 'none' || value === 'executive' || typeof value === 'string' && value.startsWith('chamber:') && Boolean(value.slice(8).trim());
}

export function isInstitutionalPowerTransfer(value: unknown): value is InstitutionalPowerTransfer {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<InstitutionalPowerTransfer>;
  return typeof item.id === 'string' && Boolean(item.id.trim())
    && typeof item.lever === 'string' && INSTITUTIONAL_POWER_LEVERS.includes(item.lever)
    && isInstitutionalPowerHolder(item.from) && isInstitutionalPowerHolder(item.to) && item.from !== item.to
    && Number.isSafeInteger(item.confidenceBps) && item.confidenceBps! >= 0 && item.confidenceBps! <= 10_000
    && ['complete', 'partial', 'unavailable'].includes(item.coverage!)
    && typeof item.source === 'string' && Boolean(item.source.trim())
    && typeof item.explanation === 'string' && Boolean(item.explanation.trim());
}

function chamberStake(registry: PoliticalRegistry, countryId: string, partyId: string, chamberId: string): PartyInstitutionalStake {
  const country = registry.countries[countryId], institution = registry.institutions[country?.institutionId];
  const chamber = institution?.chambers.find(item => item.id === chamberId), party = registry.parties[partyId];
  if (!country || !institution || institution.countryId !== countryId || !chamber || chamber.countryId !== countryId
    || !party || party.countryId !== countryId || !country.partyIds.includes(partyId)
    || chamber.seatAllocationStatus !== 'sourced' || chamber.totalSeats === undefined || chamber.totalSeats <= 0) {
    return { holder: `chamber:${chamberId}`, coverage: 'unavailable', limitation: 'Complete sourced chamber seat allocation is unavailable.' };
  }
  const partySeats = chamber.seatsByParty[partyId] ?? 0;
  const governingSeats = institution.governingPartyIds.reduce((sum, id) => sum + (chamber.seatsByParty[id] ?? 0), 0);
  return {
    holder: `chamber:${chamberId}`, stakeBps: ratio(partySeats, 10_000, chamber.totalSeats), coverage: 'complete', partySeats, totalSeats: chamber.totalSeats,
    governingBlocStakeBps: ratio(governingSeats, 10_000, chamber.totalSeats),
    limitation: 'Stake is sourced seat share: institutional leverage, not ideological support.',
  };
}

function executiveStake(registry: PoliticalRegistry, countryId: string, partyId: string): PartyInstitutionalStake {
  const country = registry.countries[countryId], institution = registry.institutions[country?.institutionId], party = registry.parties[partyId];
  if (!country || !institution || institution.countryId !== countryId || !party || party.countryId !== countryId || !country.partyIds.includes(partyId)) {
    return { holder: 'executive', coverage: 'unavailable', limitation: 'Executive-control evidence is unavailable.' };
  }
  const governingPartyIds = [...new Set(institution.governingPartyIds)].filter(id => country.partyIds.includes(id));
  if (!governingPartyIds.length) {
    return { holder: 'executive', coverage: 'unavailable', limitation: 'No reconciled governing-party set exists; opposition is not inferred from absence.' };
  }
  const coalitionCoverage = politicalCoverage(country.coverage.coalition), ambiguous = institution.governingBlocDerivations.some(item => item.ambiguous);
  const blocCoverage = coalitionCoverage === 'unavailable' || ambiguous ? 'partial' : coalitionCoverage;
  if (!governingPartyIds.includes(partyId)) {
    return { holder: 'executive', stakeBps: 0, coverage: blocCoverage, limitation: 'Party is outside the reconciled governing bloc. Zero executive stake is structural, not an opposition penalty.' };
  }
  if (governingPartyIds.length === 1) {
    return { holder: 'executive', stakeBps: 10_000, coverage: blocCoverage, limitation: 'Sole reconciled governing party receives full executive stake.' };
  }
  const shares: number[] = [];
  for (const chamber of institution.chambers) {
    if (chamber.countryId !== countryId || chamber.seatAllocationStatus !== 'sourced' || chamber.totalSeats === undefined || chamber.totalSeats <= 0) continue;
    const governingSeats = governingPartyIds.reduce((sum, id) => sum + (chamber.seatsByParty[id] ?? 0), 0);
    if (!governingSeats) continue;
    shares.push(ratio(chamber.seatsByParty[partyId] ?? 0, 10_000, governingSeats));
  }
  if (!shares.length) {
    return { holder: 'executive', coverage: 'unavailable', limitation: 'Multi-party governing bloc exists, but no sourced chamber allocation supports a power-balance estimate.' };
  }
  return {
    holder: 'executive', stakeBps: ratio(shares.reduce((sum, value) => sum + value, 0), 1, shares.length),
    coverage: coalitionCoverage === 'complete' && !ambiguous ? 'complete' : 'partial',
    limitation: 'Coalition executive stake is a modelled proxy: equal-chamber average of the party share inside the governing bloc.',
  };
}

export function derivePartyInstitutionalStake(registry: PoliticalRegistry, countryId: string, partyId: string, holder: InstitutionalPowerHolder): PartyInstitutionalStake {
  if (holder === 'none') return { holder, stakeBps: 0, coverage: 'complete', limitation: 'Null holder has no institutional leverage.' };
  if (holder === 'executive') return executiveStake(registry, countryId, partyId);
  if (isInstitutionalPowerHolder(holder) && holder.startsWith('chamber:')) return chamberStake(registry, countryId, partyId, holder.slice(8));
  return { holder, coverage: 'unavailable', limitation: `Unknown institutional holder: ${holder}` };
}

function currentGovernmentStatus(registry: PoliticalRegistry, countryId: string, partyId: string): PartyInstitutionalInterestEvaluation['governmentStatus'] {
  const country = registry.countries[countryId], institution = registry.institutions[country?.institutionId], party = registry.parties[partyId];
  if (!country || !institution || !party) return 'unavailable';
  const governing = [...new Set(institution.governingPartyIds)].filter(id => country.partyIds.includes(id));
  return governing.length ? governing.includes(partyId) ? 'government' : 'opposition' : party.governmentStatus;
}

export function institutionalSensitivityBps(stanceBps: number): number {
  return Math.max(INSTITUTIONAL_INTEREST_MODEL.sensitivityMinBps, Math.min(INSTITUTIONAL_INTEREST_MODEL.sensitivityMaxBps, 10_000 - scaledRatioSigned(stanceBps, 5_000, 10_000)));
}

export function applyInstitutionalAgreement(materialAgreementBps: number, adjustmentBps: number, sensitivityBps = 10_000): number {
  return clampBps(materialAgreementBps + scaledRatioSigned(adjustmentBps, sensitivityBps, 10_000));
}

export function evaluatePartyInstitutionalInterest(
  countryId: string, partyId: string, registry: PoliticalRegistry, effects: readonly InstitutionalPowerTransfer[],
  material: Pick<PartyProposalEvaluation, 'agreementBps' | 'confidenceBps' | 'coverage'>,
): PartyInstitutionalInterestEvaluation {
  const baseline = {
    method: INSTITUTIONAL_INTEREST_MODEL.method, governmentStatus: currentGovernmentStatus(registry, countryId, partyId),
    materialAgreementBps: material.agreementBps, materialConfidenceBps: material.confidenceBps, materialCoverage: material.coverage,
    materialBaselineFingerprint: governanceFingerprint({ agreementBps: material.agreementBps, confidenceBps: material.confidenceBps, coverage: material.coverage }),
  };
  if (!Array.isArray(effects) || effects.some(item => !isInstitutionalPowerTransfer(item)) || new Set(effects.map(item => item.id)).size !== effects.length) {
    return {
      ...baseline, status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0, effects: [], positiveDrivers: [],
      negativeDrivers: ['Institutional evidence is malformed or duplicated.'],
      limitation: 'Malformed institutional effects are never converted into strategic assumptions.',
    };
  }
  if (!effects.length) {
    return {
      ...baseline, status: 'not_applicable', coverage: 'complete', confidenceBps: 10_000, adjustmentBps: 0, effects: [], positiveDrivers: [], negativeDrivers: [],
      limitation: 'No explicit institutional power transfer. Government/opposition status alone never changes the vote.',
    };
  }
  const evaluated: PartyInstitutionalInterestEvaluation['effects'] = effects.map(effect => {
    const from = derivePartyInstitutionalStake(registry, countryId, partyId, effect.from), to = derivePartyInstitutionalStake(registry, countryId, partyId, effect.to);
    const effectCoverage = weakestCoverage(effect.coverage, from.coverage, to.coverage);
    const known = effectCoverage !== 'unavailable' && from.stakeBps !== undefined && to.stakeBps !== undefined;
    const confidenceBps = known ? Math.min(effect.confidenceBps, coverageConfidence(effectCoverage)) : 0;
    const rawInterestBps = known ? clampSignedBps(to.stakeBps! - from.stakeBps!) : 0;
    const effectiveInterestBps = known ? clampSignedBps(scaledRatioSigned(rawInterestBps, confidenceBps, 10_000)) : 0;
    return { id: effect.id, lever: effect.lever, from: effect.from, to: effect.to, fromStakeBps: from.stakeBps, toStakeBps: to.stakeBps,
      rawInterestBps, effectiveInterestBps, confidenceBps, coverage: effectCoverage, source: effect.source, explanation: effect.explanation };
  });
  const known = evaluated.filter(item => item.coverage !== 'unavailable');
  if (!known.length) {
    return {
      ...baseline, status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0, effects: evaluated, positiveDrivers: [],
      negativeDrivers: ['Institutional effects exist, but current branch leverage is unavailable.'],
      limitation: 'Unknown institutional control remains UNKNOWN; no opposition assumption is substituted.',
    };
  }
  const meanInterestBps = scaledRatioSigned(known.reduce((sum, item) => sum + item.effectiveInterestBps, 0), 1, known.length);
  return {
    ...baseline, status: 'modelled',
    coverage: known.length !== evaluated.length || evaluated.some(item => item.coverage !== 'complete') ? 'partial' : 'complete',
    confidenceBps: ratio(known.reduce((sum, item) => sum + item.confidenceBps, 0), 1, known.length),
    adjustmentBps: clampSignedBps(scaledRatioSigned(meanInterestBps, INSTITUTIONAL_INTEREST_MODEL.maxAgreementAdjustmentBps, 10_000)), effects: evaluated,
    positiveDrivers: known.filter(item => item.effectiveInterestBps > 0).map(item => `${item.lever}: ${item.from} -> ${item.to} increases current institutional leverage.`),
    negativeDrivers: known.filter(item => item.effectiveInterestBps < 0).map(item => `${item.lever}: ${item.from} -> ${item.to} reduces current institutional leverage.`),
    limitation: 'Institutional self-interest uses explicit power transfers and current branch leverage. The scaling is a modelled V1 prior, not an observed behavioral coefficient.',
  };
}

export function applyPartyInstitutionalInterest<T extends Pick<PartyProposalEvaluation, 'agreementBps' | 'confidenceBps' | 'coverage' | 'positiveDrivers' | 'negativeDrivers' | 'tradeoffs'>>(
  material: T, interest: PartyInstitutionalInterestEvaluation,
): T {
  if (interest.status === 'not_applicable') return material;
  if (interest.status === 'unavailable') {
    return { ...material, confidenceBps: 0, coverage: material.coverage === 'unavailable' ? 'unavailable' : 'partial', negativeDrivers: [...material.negativeDrivers, ...interest.negativeDrivers] };
  }
  const materialDirection = material.agreementBps - 5_000, institutionalDirection = interest.adjustmentBps, tradeoffs = [...material.tradeoffs];
  if (materialDirection && institutionalDirection && Math.sign(materialDirection) !== Math.sign(institutionalDirection)) {
    tradeoffs.push('Material/ideological preference conflicts with current institutional leverage.');
  }
  return {
    ...material, agreementBps: applyInstitutionalAgreement(material.agreementBps, interest.adjustmentBps),
    confidenceBps: Math.min(material.confidenceBps, interest.confidenceBps),
    coverage: material.coverage === 'unavailable' ? 'unavailable' : material.coverage === 'partial' || interest.coverage === 'partial' ? 'partial' : interest.coverage,
    positiveDrivers: [...material.positiveDrivers, ...interest.positiveDrivers], negativeDrivers: [...material.negativeDrivers, ...interest.negativeDrivers], tradeoffs,
  };
}
