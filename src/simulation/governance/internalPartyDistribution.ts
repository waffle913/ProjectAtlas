import { allocate } from '../socioeconomy/model';
import { deterministicFingerprint } from '../fingerprint';
import { scaledRatioSigned } from '../integerMath';
import { evaluateProfileForPublic, GOVERNANCE_VOTE_THRESHOLDS } from './analysis';
import { applyInstitutionalAgreement, institutionalSensitivityBps } from './institutionalInterest';
import type { GovernanceGoal, PartyGoalProfile, PartyInternalVoteDistribution, PartyIssuePreference, PartyProposalEvaluation, PartySeatAllocation, ProposalAnalysis } from './model';

export const INTERNAL_PARTY_DISTRIBUTION_MODEL = Object.freeze({
  method: 'continuous_issue_distribution_v1' as const,
  preferenceHalfSpreadBps: 1_800,
  compromiseToleranceHalfSpreadBps: 1_600,
  maxAggregateAgreementHalfSpreadBps: 4_000,
  quadrature: Object.freeze([
    { id: 'radical', stanceBps: 10_000, weightBps: 1_000 },
    { id: 'firm', stanceBps: 5_000, weightBps: 2_000 },
    { id: 'mainstream', stanceBps: 0, weightBps: 4_000 },
    { id: 'pragmatic', stanceBps: -5_000, weightBps: 2_000 },
    { id: 'moderate', stanceBps: -10_000, weightBps: 1_000 },
  ].map(sample => Object.freeze(sample))),
});

type CentralEvaluation = Pick<PartyProposalEvaluation, 'agreementBps' | 'confidenceBps' | 'coverage' | 'institutionalInterest'>;
const clampBps = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const scaleSigned = (magnitude: number, signedBps: number) => Math.sign(signedBps) * Math.round(magnitude * Math.abs(signedBps) / 10_000);

function integerSqrt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid integer square-root input: ${value}.`);
  if (value < 2) return value;
  let low = 1, high = Math.min(value, 10_000), answer = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid * mid <= value) { answer = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return answer;
}

function sampledPreference(base: PartyIssuePreference, stanceBps: number): PartyIssuePreference {
  const direction = Math.sign(base.idealPointBps - 5_000);
  let idealPointBps = clampBps(base.idealPointBps + direction * scaleSigned(INTERNAL_PARTY_DISTRIBUTION_MODEL.preferenceHalfSpreadBps, stanceBps));
  // Moderation approaches the neutral point without reversing the issue preference.
  if (stanceBps < 0 && direction > 0) idealPointBps = Math.max(5_000, idealPointBps);
  else if (stanceBps < 0 && direction < 0) idealPointBps = Math.min(5_000, idealPointBps);
  return {
    ...base, idealPointBps,
    compromiseToleranceBps: clampBps(base.compromiseToleranceBps - scaleSigned(INTERNAL_PARTY_DISTRIBUTION_MODEL.compromiseToleranceHalfSpreadBps, stanceBps)),
  };
}

function profileWithGoalSample(profile: PartyGoalProfile, goal: GovernanceGoal, stanceBps: number): PartyGoalProfile {
  return { ...profile, goals: { ...profile.goals, [goal]: sampledPreference(profile.goals[goal], stanceBps) } };
}

function triangularCdfBps(threshold: number, center: number, halfWidth: number): number {
  if (halfWidth <= 0) return threshold < center ? 0 : 10_000;
  const left = center - halfWidth, right = center + halfWidth;
  if (threshold <= left) return 0;
  if (threshold >= right) return 10_000;
  const denominator = 2 * halfWidth * halfWidth;
  if (threshold <= center) return clampBps(10_000 * (threshold - left) ** 2 / denominator);
  return clampBps(10_000 - Math.round(10_000 * (right - threshold) ** 2 / denominator));
}

function unavailableDistribution(limitation: string): PartyInternalVoteDistribution {
  return {
    method: INTERNAL_PARTY_DISTRIBUTION_MODEL.method, yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000,
    agreementMeanBps: 5_000, agreementHalfSpreadBps: 0, coverage: 'unavailable', status: 'unavailable', limitation,
  };
}

function sampleMoments(samples: readonly { value: number; weightBps: number }[]) {
  const weight = samples.reduce((sum, item) => sum + item.weightBps, 0);
  const meanDelta = scaledRatioSigned(samples.reduce((sum, item) => sum + item.value * item.weightBps, 0), 1, weight);
  const variance = Math.round(samples.reduce((sum, item) => sum + (item.value - meanDelta) ** 2 * item.weightBps, 0) / weight);
  return { meanDelta, variance };
}

export function evaluatePartyInternalVoteDistribution(analysis: ProposalAnalysis, profile: PartyGoalProfile | undefined, centralEvaluation?: CentralEvaluation): PartyInternalVoteDistribution {
  if (!profile) return unavailableDistribution('No validated party goal profile is available; internal vote shares remain UNKNOWN.');
  const central = centralEvaluation ?? evaluateProfileForPublic(analysis, profile);
  if (central.coverage === 'unavailable' || central.confidenceBps < GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps) {
    return unavailableDistribution('Party evaluation evidence is unavailable or below the minimum confidence threshold; uncertainty is not converted into abstention.');
  }
  const institutional = centralEvaluation?.institutionalInterest;
  const institutionalAdjustmentBps = institutional?.status === 'modelled' ? institutional.adjustmentBps : 0;
  const goals = [...new Set(analysis.expectedConsequences.filter(item => item.coverage !== 'unavailable' && profile.goals[item.goal]).map(item => item.goal))].sort();
  let aggregateMeanDelta = 0, aggregateVariance = 0;
  for (const goal of goals) {
    const samples = INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature.map(sample => ({
      value: applyInstitutionalAgreement(evaluateProfileForPublic(analysis, profileWithGoalSample(profile, goal, sample.stanceBps)).agreementBps, institutionalAdjustmentBps) - central.agreementBps,
      weightBps: sample.weightBps,
    }));
    const { meanDelta, variance } = sampleMoments(samples);
    aggregateMeanDelta += meanDelta;
    aggregateVariance += variance;
  }
  if (institutional?.status === 'modelled' && institutionalAdjustmentBps !== 0) {
    const materialCentral = evaluateProfileForPublic(analysis, profile);
    const samples = INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature.map(sample => ({
      value: applyInstitutionalAgreement(materialCentral.agreementBps, institutionalAdjustmentBps, institutionalSensitivityBps(sample.stanceBps)) - central.agreementBps,
      weightBps: sample.weightBps,
    }));
    const { meanDelta, variance } = sampleMoments(samples);
    aggregateMeanDelta += meanDelta;
    aggregateVariance += variance;
  }
  const agreementMeanBps = clampBps(central.agreementBps + aggregateMeanDelta);
  const agreementHalfSpreadBps = Math.min(INTERNAL_PARTY_DISTRIBUTION_MODEL.maxAggregateAgreementHalfSpreadBps, integerSqrt(6 * aggregateVariance));
  const yesBps = agreementHalfSpreadBps === 0
    ? agreementMeanBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps ? 10_000 : 0
    : 10_000 - triangularCdfBps(GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps, agreementMeanBps, agreementHalfSpreadBps);
  const noBps = agreementHalfSpreadBps === 0
    ? agreementMeanBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps ? 10_000 : 0
    : triangularCdfBps(GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps, agreementMeanBps, agreementHalfSpreadBps);
  return {
    method: INTERNAL_PARTY_DISTRIBUTION_MODEL.method, yesBps, noBps, abstainBps: 10_000 - yesBps - noBps, unknownBps: 0,
    agreementMeanBps, agreementHalfSpreadBps, coverage: central.coverage, status: 'modelled_common_prior',
    limitation: 'Internal plurality is a deterministic aggregate approximation using independent per-goal modelled distributions. No party-specific faction shares are observed; quadrature samples are not persistent factions or individual MPs.'
      + (institutional?.status === 'modelled' && institutionalAdjustmentBps !== 0 ? ' Independent institutional-pragmatism sensitivity is a modelled prior, not observed faction behavior.' : ''),
  };
}

export function allocatePartySeats(seats: number, distribution: PartyInternalVoteDistribution, identity?: { proposalId: string; chamberId: string; partyId: string }): PartySeatAllocation {
  const shares = [distribution.yesBps, distribution.noBps, distribution.abstainBps, distribution.unknownBps];
  if (shares.some(value => !Number.isSafeInteger(value) || value < 0 || value > 10_000) || shares.reduce((sum, value) => sum + value, 0) !== 10_000) {
    throw new Error('Invalid internal party vote shares; expected exactly 10,000 basis points.');
  }
  if (!Number.isSafeInteger(seats) || seats < 0) throw new Error('Invalid party seat count.');
  if (identity && Object.values(identity).some(value => !value.trim())) throw new Error('Missing seat-apportionment identity.');
  // No marker/identity means the historical candidate allocator; never reinterpret stored ties.
  const allocated = identity ? shares.map(value => Number(BigInt(seats) * BigInt(value) / 10_000n)) : allocate(seats, shares);
  if (identity) {
    const buckets = ['yes', 'no', 'abstain', 'unknown'] as const;
    const order = shares.map((value, index) => ({ index, remainder: BigInt(seats) * BigInt(value) % 10_000n,
      hash: deterministicFingerprint([identity.proposalId, identity.chamberId, identity.partyId, buckets[index]]) }))
      .sort((a, b) => a.remainder === b.remainder ? a.hash.localeCompare(b.hash) || buckets[a.index].localeCompare(buckets[b.index]) : a.remainder > b.remainder ? -1 : 1);
    const remaining = seats - allocated.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < remaining; index++) allocated[order[index].index]++;
  }
  const [yesSeats, noSeats, abstainSeats, unknownSeats] = allocated;
  return { yesSeats, noSeats, abstainSeats, unknownSeats };
}
