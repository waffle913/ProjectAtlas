import type { SimulationInvariant } from '../invariants';
import type { SimulationState } from '../../types';
import { canonicalJson } from '../fingerprint';
import { dateValid, validatePolicy } from '../fiscal/math';
import { fiscalReformFingerprint, validateBudget } from '../fiscal/runtime';
import { politicalRegistry } from '../politics/registry';
import { persistedOfficeEvidenceErrors } from './officeEvidence';
import { GOVERNANCE_GOALS, GOVERNANCE_VOTE_THRESHOLDS, aggregateIssueEffects } from './analysis';
import { allocatePartySeats, INTERNAL_PARTY_DISTRIBUTION_MODEL } from './internalPartyDistribution';
import { applyPartyInstitutionalInterest, evaluatePartyInstitutionalInterest, institutionalTransferKey, isInstitutionalPowerTransfer, institutionalStakesFingerprint } from './institutionalInterest';
import {
  AUTHORITY_CAPABILITIES, GOVERNANCE_VERSION, governanceFingerprint, PROPOSAL_CONTRACTS, PROPOSAL_INSTRUMENT_CLASSES, PROPOSAL_KINDS,
  type ChamberSupportEstimate, type PartyChamberEvaluation, type PartyProposalEvaluation, type PoliticalProposal, type ProposalAnalysis, type ProposalEffect,
} from './model';

const safe = (fn: () => void) => { try { fn(); return false; } catch { return true; } };
const bps = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;
const signedBps = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= -10_000 && (value as number) <= 10_000;
const nonNegative = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const coverage = (value: unknown) => ['complete', 'partial', 'unavailable'].includes(value as string);

function validatePartyEvaluation(evaluation: PartyProposalEvaluation): boolean {
  if (!evaluation.partyId || !bps(evaluation.agreementBps) || !bps(evaluation.confidenceBps) || !bps(evaluation.compromiseCostBps) || !coverage(evaluation.coverage) || !['yes', 'no', 'abstain', 'unknown'].includes(evaluation.vote)) return false;
  const expectedVote = evaluation.confidenceBps < GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps || evaluation.coverage === 'unavailable' ? 'unknown' : evaluation.agreementBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps ? 'yes' : evaluation.agreementBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps ? 'no' : 'abstain';
  if (evaluation.vote !== expectedVote) return false;
  if (![evaluation.positiveDrivers, evaluation.negativeDrivers, evaluation.tradeoffs].every(list => Array.isArray(list) && list.every(item => typeof item === 'string'))) return false;
  return Array.isArray(evaluation.issueEvaluations) && evaluation.issueEvaluations.every(issue =>
    typeof issue.goal === 'string' && bps(issue.agreementBps) && signedBps(issue.benefitBps) && bps(issue.compromiseCostBps) && bps(issue.severityBps) && coverage(issue.coverage)
    && (issue.currentOutcomeBps === undefined || bps(issue.currentOutcomeBps)) && (issue.expectedOutcomeBps === undefined || bps(issue.expectedOutcomeBps)));
}

function validateInternalAllocation(evaluation: PartyChamberEvaluation, identity?: { proposalId: string; chamberId: string; partyId: string }): boolean {
  const distribution = evaluation.internalDistribution, allocation = evaluation.seatAllocation;
  if (evaluation.decisionModel !== 'internal_distribution_v1' || !distribution || !allocation
    || distribution.method !== INTERNAL_PARTY_DISTRIBUTION_MODEL.method
    || ![distribution.yesBps, distribution.noBps, distribution.abstainBps, distribution.unknownBps, distribution.agreementMeanBps, distribution.agreementHalfSpreadBps].every(bps)
    || distribution.agreementHalfSpreadBps > INTERNAL_PARTY_DISTRIBUTION_MODEL.maxAggregateAgreementHalfSpreadBps
    || distribution.yesBps + distribution.noBps + distribution.abstainBps + distribution.unknownBps !== 10_000
    || !coverage(distribution.coverage) || typeof distribution.limitation !== 'string' || !distribution.limitation.trim()) return false;
  const unknown = evaluation.vote === 'unknown';
  if (distribution.status !== (unknown ? 'unavailable' : 'modelled_common_prior')
    || distribution.coverage !== (unknown ? 'unavailable' : evaluation.coverage)
    || (unknown ? distribution.unknownBps !== 10_000 || distribution.yesBps !== 0 || distribution.noBps !== 0 || distribution.abstainBps !== 0 : distribution.unknownBps !== 0)) return false;
  if (![allocation.yesSeats, allocation.noSeats, allocation.abstainSeats, allocation.unknownSeats].every(nonNegative)
    || allocation.yesSeats + allocation.noSeats + allocation.abstainSeats + allocation.unknownSeats !== evaluation.seats) return false;
  const expected = allocatePartySeats(evaluation.seats, distribution, identity);
  return allocation.yesSeats === expected.yesSeats && allocation.noSeats === expected.noSeats
    && allocation.abstainSeats === expected.abstainSeats && allocation.unknownSeats === expected.unknownSeats;
}

function validateChamber(chamber: ChamberSupportEstimate, legacyAggregateOnly: boolean, plurality: boolean, proposalId: string, identityApportionment: boolean): boolean {
  if (!chamber.chamberId || ![chamber.yesSeats, chamber.noSeats, chamber.abstainSeats, chamber.unavailableSeats].every(nonNegative) || !coverage(chamber.coverage)) return false;
  const allocated = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats + chamber.unavailableSeats;
  if (chamber.totalSeats !== undefined && (!nonNegative(chamber.totalSeats) || allocated !== chamber.totalSeats)) return false;
  if (chamber.coverage === 'complete' && chamber.unavailableSeats !== 0) return false;
  if (chamber.adopted !== undefined && (chamber.coverage !== 'complete' || chamber.adopted !== (chamber.yesSeats > chamber.noSeats))) return false;
  if (chamber.partyEvaluations && (!Array.isArray(chamber.partyEvaluations) || !chamber.partyEvaluations.every(item => nonNegative(item.seats) && validatePartyEvaluation(item)))) return false;
  if (chamber.partyEvaluations?.some(item => plurality ? !validateInternalAllocation(item, identityApportionment ? { proposalId, chamberId: chamber.chamberId, partyId: item.partyId } : undefined)
    : item.decisionModel !== undefined || item.internalDistribution !== undefined || item.seatAllocation !== undefined)) return false;
  if (plurality && chamber.partyEvaluations && new Set(chamber.partyEvaluations.map(item => item.partyId)).size !== chamber.partyEvaluations.length) return false;
  if (!chamber.partyEvaluations) {
    if (!legacyAggregateOnly) return false;
    if (chamber.totalSeats === undefined) return chamber.coverage === 'unavailable' && chamber.adopted === undefined && allocated === 0;
    const knownSeats = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats, expectedCoverage = chamber.unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
    return chamber.coverage === expectedCoverage && (expectedCoverage === 'complete' ? chamber.adopted === (chamber.yesSeats > chamber.noSeats) : chamber.adopted === undefined);
  }
  const allocationField = { yes: 'yesSeats', no: 'noSeats', abstain: 'abstainSeats', unknown: 'unknownSeats' } as const;
  const seats = (vote: PartyProposalEvaluation['vote']) => plurality
    ? chamber.partyEvaluations!.reduce((sum, item) => sum + item.seatAllocation![allocationField[vote]], 0)
    : chamber.partyEvaluations!.filter(item => item.vote === vote).reduce((sum, item) => sum + item.seats, 0);
  const partySeats = chamber.partyEvaluations.reduce((sum, item) => sum + item.seats, 0);
  if (chamber.yesSeats !== seats('yes') || chamber.noSeats !== seats('no') || chamber.abstainSeats !== seats('abstain')) return false;
  if (chamber.totalSeats === undefined) return chamber.partyEvaluations.length === 0 && chamber.coverage === 'unavailable' && chamber.adopted === undefined && allocated === 0;
  if (partySeats > chamber.totalSeats || chamber.unavailableSeats !== seats('unknown') + chamber.totalSeats - partySeats) return false;
  const knownSeats = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats, expectedCoverage = chamber.unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
  if (chamber.coverage !== expectedCoverage || (expectedCoverage === 'complete' ? chamber.adopted !== (chamber.yesSeats > chamber.noSeats) : chamber.adopted !== undefined)) return false;
  return true;
}

function reconcilesParliamentaryRegistry(state: SimulationState, estimate: NonNullable<PoliticalProposal['parliamentaryEstimate']>, countryId: string, plurality: boolean): boolean {
  const country = politicalRegistry.countries[countryId], institution = politicalRegistry.institutions[country?.institutionId];
  const expectedChambers = !institution || ['none', 'unavailable'].includes(institution.legislatureKind) ? [] : institution.chambers;
  if (estimate.chambers.length !== expectedChambers.length || new Set(estimate.chambers.map(chamber => chamber.chamberId)).size !== estimate.chambers.length) return false;
  for (const chamber of estimate.chambers) {
    const registered = expectedChambers.find(item => item.id === chamber.chamberId);
    if (!registered || registered.countryId !== countryId) return false;
    // The estimate must reconcile with the snapshot it was actually decided against: the sourced
    // 2026 static allocation, or the dynamic post-election snapshot — never a blind registry check
    // that a later election would invalidate.
    const dynamic = state.elections?.countries?.[countryId]?.chambers?.[chamber.chamberId];
    const dynamicSeats = dynamic?.seatsByParty;
    const dynamicAllocated = Boolean(dynamicSeats && Object.values(dynamicSeats).some(seats => seats > 0));
    const snapshots: Array<{ seatsByParty: Record<string, number>; total: number; independentOther: number; unallocated: number }> = [];
    if (registered.seatAllocationStatus === 'sourced' && registered.totalSeats !== undefined) {
      snapshots.push({ seatsByParty: registered.seatsByParty, total: registered.totalSeats, independentOther: registered.independentOtherSeats ?? 0, unallocated: 0 });
    }
    if (dynamicAllocated && dynamic) {
      snapshots.push({ seatsByParty: dynamicSeats!, total: dynamic.totalSeats > 0 ? dynamic.totalSeats : registered.totalSeats ?? 0, independentOther: dynamic.independentOtherSeats ?? 0, unallocated: dynamic.unallocatedSeats ?? 0 });
    }
    const evaluations = chamber.partyEvaluations;
    if (!evaluations) {
      // Legacy aggregate-only chambers are validated by validateChamber; nothing to reconcile here.
      if (chamber.totalSeats === undefined) return false;
      if (!snapshots.some(snapshot => snapshot.total === chamber.totalSeats)) return false;
      continue;
    }
    // A chamber whose seats are genuinely unknown (no sourced 2026 allocation and no dynamic
    // allocation) has no snapshot to reconcile against: the honest record reports every seat
    // unavailable with no party evidence. It is validated intrinsically — never compared against a
    // later election and never rewritten — and a snapshot-backed record cannot hide behind it.
    if (evaluations.length === 0) {
      if (snapshots.length !== 0) return false;
      if (chamber.totalSeats === undefined) return chamber.coverage === 'unavailable' && chamber.adopted === undefined && chamber.yesSeats + chamber.noSeats + chamber.abstainSeats + chamber.unavailableSeats === 0;
      return chamber.coverage === 'unavailable' && chamber.adopted === undefined && chamber.yesSeats === 0 && chamber.noSeats === 0 && chamber.abstainSeats === 0 && chamber.unavailableSeats === chamber.totalSeats;
    }
    for (const evaluation of evaluations) {
      const registryParty = politicalRegistry.parties[evaluation.partyId];
      const dynamicParty = state.politics.organizations[evaluation.partyId];
      const knownParty = (registryParty?.countryId === countryId) || (dynamicParty?.type === 'party' && dynamicParty.countryId === countryId);
      if (!knownParty || (registryParty && !country.partyIds.includes(evaluation.partyId))) return false;
    }
    const matched = snapshots.some(snapshot => {
      if (chamber.totalSeats !== snapshot.total) return false;
      if (evaluations.some(item => (snapshot.seatsByParty[item.partyId] ?? -1) !== item.seats)) return false;
      const evaluated = new Set(evaluations.map(item => item.partyId));
      if (Object.keys(snapshot.seatsByParty).some(partyId => (snapshot.seatsByParty[partyId] ?? 0) > 0 && !evaluated.has(partyId))) return false;
      const unknownPartySeats = evaluations.reduce((sum, evaluation) => sum + (plurality ? evaluation.seatAllocation!.unknownSeats : evaluation.vote === 'unknown' ? evaluation.seats : 0), 0);
      return chamber.unavailableSeats - unknownPartySeats === snapshot.independentOther + snapshot.unallocated;
    });
    if (!matched) return false;
  }
  return true;
}

function validateParliamentary(state: SimulationState, estimate: NonNullable<PoliticalProposal['parliamentaryEstimate']>, legacyAggregateOnly: boolean, plurality: boolean, proposalId: string, countryId: string): boolean {
  const procedure = plurality ? 'internal_party_distribution_v1' : 'modelled_procedure_v1';
  if (estimate.seatApportionment !== undefined && (!plurality || estimate.seatApportionment !== 'identity_hash_v1')) return false;
  if (![estimate.yesSeats, estimate.noSeats, estimate.abstainSeats, estimate.unavailableSeats, estimate.totalSeats].every(nonNegative) || !bps(estimate.confidenceBps) || !coverage(estimate.coverage) || estimate.procedure !== procedure || !Array.isArray(estimate.chambers) || !estimate.chambers.every(chamber => validateChamber(chamber, legacyAggregateOnly, plurality, proposalId, estimate.seatApportionment === 'identity_hash_v1'))) return false;
  if (!legacyAggregateOnly && !reconcilesParliamentaryRegistry(state, estimate, countryId, plurality)) return false;
  const sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => estimate.chambers.reduce((total, chamber) => total + chamber[field], 0);
  const expectedCoverage = estimate.chambers.length > 0 && estimate.chambers.every(item => item.coverage === 'complete') ? 'complete' : estimate.chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  return estimate.coverage === expectedCoverage && estimate.yesSeats === sum('yesSeats') && estimate.noSeats === sum('noSeats') && estimate.abstainSeats === sum('abstainSeats') && estimate.unavailableSeats === sum('unavailableSeats') && estimate.totalSeats === estimate.chambers.reduce((total, chamber) => total + (chamber.totalSeats ?? 0), 0);
}

function validateAnalysis(analysis: ProposalAnalysis): boolean {
  if (analysis.version !== 'proposal-analysis-0.14-v2' || !coverage(analysis.coverage) || typeof analysis.genuinelyNeutral !== 'boolean') return false;
  if (!analysis.directPolicyChanges.every(change => change.path && coverage(change.coverage) && change.explanation && (change.delta === undefined || finite(change.delta))
    && (typeof change.before !== 'number' || typeof change.after !== 'number' || finite(change.before) && finite(change.after) && change.delta === change.after - change.before))) return false;
  if (!analysis.unsupportedChanges.every(change => change.path && change.reason && ['partial', 'unavailable'].includes(change.coverage))) return false;
  if (!analysis.limitations.every(item => typeof item === 'string')) return false;
  if (!Object.values(analysis.materialContext).every(metric => coverage(metric.coverage) && metric.source && (metric.valueBps === undefined || bps(metric.valueBps)))) return false;
  if (!analysis.expectedConsequences.every(item => GOVERNANCE_GOALS.includes(item.goal) && item.source && item.explanation && coverage(item.coverage) && signedBps(item.directionBps)
    && item.magnitudeBps === Math.abs(item.directionBps) && bps(item.confidenceBps))) return false;
  const expectedEffects = aggregateIssueEffects(analysis.expectedConsequences);
  if (Object.keys(analysis.issueEffects).length !== GOVERNANCE_GOALS.length
    || GOVERNANCE_GOALS.some(goal => analysis.issueEffects[goal] !== expectedEffects[goal])) return false;
  const neutral = analysis.directPolicyChanges.length === 0 && analysis.unsupportedChanges.length === 0;
  return analysis.genuinelyNeutral === neutral && (!neutral || !analysis.expectedConsequences.some(item => item.coverage !== 'unavailable' && item.directionBps !== 0));
}

function validateInstitutionalEvidence(state: SimulationState, proposal: PoliticalProposal): boolean {
  const effects = proposal.analysis?.institutionalEffects;
  if (!Array.isArray(effects) || !effects.every(isInstitutionalPowerTransfer) || new Set(effects.map(item => item.id)).size !== effects.length
    || new Set(effects.map(institutionalTransferKey)).size !== effects.length) return false;
  const country = politicalRegistry.countries[proposal.countryId], institution = politicalRegistry.institutions[country?.institutionId];
  for (const effect of effects) for (const holder of [effect.from, effect.to]) {
    if (holder.startsWith('chamber:') && (!institution || institution.countryId !== proposal.countryId
      || !institution.chambers.some(chamber => chamber.id === holder.slice(8) && chamber.countryId === proposal.countryId))) return false;
  }
  for (const estimate of [proposal.parliamentaryEstimate, proposal.voteResult].filter((item): item is NonNullable<typeof item> => item !== undefined)) {
    if (!Array.isArray(estimate.chambers)) return false;
    for (const chamber of estimate.chambers) {
      if (!Array.isArray(chamber.partyEvaluations)) return false;
      for (const evaluation of chamber.partyEvaluations) {
        const interest = evaluation.institutionalInterest;
        if (!interest || !bps(interest.materialAgreementBps) || !bps(interest.materialConfidenceBps) || !coverage(interest.materialCoverage)) return false;
        const material = {
          agreementBps: interest.materialAgreementBps, confidenceBps: interest.materialConfidenceBps, coverage: interest.materialCoverage,
          positiveDrivers: [], negativeDrivers: [], tradeoffs: [],
        };
        if (interest.stakesFingerprint !== undefined) {
          // Versioned snapshot: validate intrinsic integrity, never recompute branch stakes from the
          // current parliament (which may have changed after a later election). Every tampered field
          // of the record breaks the fingerprint.
          const expectedStakes = institutionalStakesFingerprint({ method: interest.method, countryId: proposal.countryId, partyId: evaluation.partyId, status: interest.status, coverage: interest.coverage, confidenceBps: interest.confidenceBps, adjustmentBps: interest.adjustmentBps, governmentStatus: interest.governmentStatus, effects: interest.effects });
          if (interest.stakesFingerprint !== expectedStakes) return false;
          if (interest.materialBaselineFingerprint !== governanceFingerprint({ agreementBps: interest.materialAgreementBps, confidenceBps: interest.materialConfidenceBps, coverage: interest.materialCoverage })) return false;
          const applied = applyPartyInstitutionalInterest(material, interest);
          if (evaluation.agreementBps !== applied.agreementBps || evaluation.confidenceBps !== applied.confidenceBps || evaluation.coverage !== applied.coverage) return false;
        } else {
          // Legacy records without a versioned snapshot keep the historical recomputation check.
          const expected = evaluatePartyInstitutionalInterest(state, proposal.countryId, evaluation.partyId, politicalRegistry, effects, material);
          const { stakesFingerprint: _fingerprint, ...expectedWithoutFingerprint } = expected;
          if (canonicalJson(interest) !== canonicalJson(expectedWithoutFingerprint)) return false;
          const applied = applyPartyInstitutionalInterest(material, expected);
          if (evaluation.agreementBps !== applied.agreementBps || evaluation.confidenceBps !== applied.confidenceBps || evaluation.coverage !== applied.coverage) return false;
        }
      }
    }
  }
  return true;
}

export const governanceInvariant: SimulationInvariant = { id: 'governance', check: (state, context) => {
  const g = state.governance, errors: string[] = [];
  if (!g || g.version !== GOVERNANCE_VERSION || !g.initializedOn || !dateValid(g.initializedOn) || g.initializedOn > state.date || !nonNegative(g.nextPersonSequence) || !nonNegative(g.nextProposalSequence)) return ['Malformed governance state.'];
  if (g.player.controlledPersonId && !g.persons[g.player.controlledPersonId]) errors.push('Controlled person does not exist.');
  const sourceIdentityOwners = new Map<string, string>();
  const activeInitialLeaderNames = new Set<string>();
  const trackSourceIdentity = (sourcePersonId: string, countryId: string, personId: string) => {
    const key = `${countryId}:${sourcePersonId}`;
    const owner = sourceIdentityOwners.get(key);
    if (owner && owner !== personId) errors.push(`Source political identity ${key} is duplicated by ${owner} and ${personId}.`);
    else sourceIdentityOwners.set(key, personId);
  };
  for (const [id, person] of Object.entries(g.persons)) {
    if (person.id !== id || !id.match(/^person\.\d{8}$/) || Number(id.slice(7)) >= g.nextPersonSequence || !person.displayName.trim() || !context.countryIds.has(person.countryId) || !dateValid(person.createdOn) || person.createdOn < g.initializedOn || person.createdOn > state.date || !['active', 'inactive'].includes(person.status)) errors.push(`Malformed political person ${id}.`);
    if (person.personalFundsUsd !== undefined && (!Number.isSafeInteger(person.personalFundsUsd) || person.personalFundsUsd < 0)) errors.push(`Political person ${id} has invalid personal funds.`);
    if (person.isPartyLeader && person.status === 'active' && person.createdOn === politicalRegistry.referenceDate) {
      if (activeInitialLeaderNames.has(person.displayName)) errors.push(`Initial active party leader name is duplicated: ${person.displayName}.`);
      activeInitialLeaderNames.add(person.displayName);
    }
    if (person.partyId && politicalRegistry.parties[person.partyId]?.countryId !== person.countryId) errors.push(`Invalid party reference for ${id}.`);
    if (person.isPartyLeader && !person.partyId) errors.push(`Party leader ${id} has no party.`);
    if (person.status !== 'active' && person.office) errors.push(`Inactive person ${id} retains a political office.`);
    if (person.office && (!['head_of_government', 'head_of_state', 'legislator', 'minister'].includes(person.office.role) || person.office.countryId !== person.countryId || !person.office.title?.trim() || !dateValid(person.office.appointedOn) || person.office.appointedOn < g.initializedOn || person.office.appointedOn < person.createdOn || person.office.appointedOn > state.date || person.office.authorityProfile.status !== 'modelled_constitutional_abstraction' || !person.office.authorityProfile.limitation || person.office.authorityProfile.capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item)))) errors.push(`Malformed office for ${id}.`);
    if (person.office?.evidence) {
      const evidence = person.office.evidence;
      errors.push(...persistedOfficeEvidenceErrors(person, state.date));
      trackSourceIdentity(evidence.sourcePersonId, person.countryId, id);
    }
    if (person.leaderProvenance) {
      const provenance = person.leaderProvenance;
      const party = person.partyId ? politicalRegistry.parties[person.partyId] : undefined;
      if (!context.countryIds.has(person.countryId) || !party || party.countryId !== person.countryId || provenance.sourcePartyId !== party.sourceBasis.sourcePartyId
        || !dateValid(provenance.referenceDate) || !provenance.limitation
        || provenance.basis === 'modelled_fallback' && (!['unavailable', 'ambiguous'].includes(provenance.sourceLeaderStatus) || provenance.sourceLeader !== undefined)
        || provenance.basis !== 'modelled_fallback' && (!['sourced', 'derived'].includes(provenance.sourceLeaderStatus) || !provenance.sourceLeader?.id || !provenance.sourceLeader.name || provenance.sourceLeader.name === person.displayName || !Array.isArray(provenance.sourceLeader.sourceRecordIds) || !provenance.sourceLeader.sourceRecordIds.length
          || !provenance.sourceLeader.id.startsWith('wikidata:')
          || provenance.sourceLeader.sourceRole !== undefined && !['party_chairperson', 'party_leader', 'interim_party_leader'].includes(provenance.sourceLeader.sourceRole)
          || provenance.sourceLeader.sourceRecordIds.some(sourceRecordId => typeof sourceRecordId !== 'string' || !sourceRecordId))) errors.push(`Invalid party leader provenance for ${id}.`);
      if (provenance.sourceLeader?.id) trackSourceIdentity(provenance.sourceLeader.id, person.countryId, id);
    }
  }
  if (new Set(g.proposalOrder).size !== g.proposalOrder.length || g.proposalOrder.some(id => !g.proposals[id]) || Object.keys(g.proposals).some(id => !g.proposalOrder.includes(id))) errors.push('Proposal order does not reconcile.');
  const reformSequences = new Set<number>();
  for (const [id, proposal] of Object.entries(g.proposals)) {
    const proposer = g.persons[proposal.proposerPersonId];
    if (proposal.id !== id || !id.match(/^proposal\.\d{8}$/) || Number(id.slice(9)) >= g.nextProposalSequence || !['draft', 'submitted', 'consulted', 'enacted', 'rejected', 'withdrawn', 'unavailable'].includes(proposal.status) || !proposer || proposer.countryId !== proposal.countryId || !context.countryIds.has(proposal.countryId) || !dateValid(proposal.createdOn) || proposal.createdOn < g.initializedOn || proposal.createdOn > state.date || !dateValid(proposal.effectiveDate) || proposal.effectiveDate < proposal.createdOn) errors.push(`Malformed proposal ${id}.`);
    const fiscalPayloadInvalid = proposal.kind === 'fiscal_reform'
      ? ((!proposal.payload.policy && !proposal.payload.annualBudget) || (proposal.payload.policy && safe(() => validatePolicy(proposal.payload.policy!, proposal.countryId, proposal.effectiveDate))) || (proposal.payload.annualBudget && safe(() => validateBudget(proposal.payload.annualBudget!))))
      : false;
    const amendmentPayloadInvalid = proposal.kind === 'constitutional_amendment'
      ? !proposal.constitutionalDisposition || !['principal', 'secondary'].includes(proposal.constitutionalDisposition) || (!proposal.payload.materialKeysToProtect?.length && !proposal.payload.materialKeysToUnprotect?.length && !proposal.payload.rightsChanges && !proposal.payload.parliamentChanges && !proposal.payload.executiveChanges && !proposal.payload.electionChanges && !proposal.payload.judicialChanges && !proposal.payload.territoryChanges && !proposal.payload.amendmentChanges)
      : false;
    if (fiscalPayloadInvalid || amendmentPayloadInvalid) errors.push(`Invalid payload for ${id}.`);
    if (proposal.status === 'draft' && (proposal.submittedOn || proposal.submittedPayloadFingerprint || proposal.resolvedOn || proposal.voteResult)) errors.push(`Draft ${id} contains lifecycle residue.`);
    if (proposal.status === 'submitted' && (proposal.resolvedOn || proposal.voteResult)) errors.push(`Submitted proposal ${id} contains resolution residue.`);
    if (proposal.status === 'consulted' && (proposal.resolvedOn || proposal.voteResult || !proposal.parliamentaryEstimate)) errors.push(`Consulted proposal ${id} has invalid lifecycle residue.`);
    if (proposal.status === 'withdrawn' && proposal.voteResult) errors.push(`Withdrawn proposal ${id} contains a vote result.`);
    if (['submitted', 'consulted', 'enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.submittedOn || !dateValid(proposal.submittedOn) || proposal.submittedOn < proposal.createdOn || proposal.submittedOn > state.date)) errors.push(`Invalid submission lifecycle for ${id}.`);
    if (proposal.submittedOn && proposal.submittedPayloadFingerprint !== governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload })) errors.push(`Submitted proposal ${id} payload was modified.`);
    if (['enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.resolvedOn || !proposal.voteResult || proposal.voteResult.outcome !== (proposal.status === 'enacted' ? 'adopted' : proposal.status))) errors.push(`Invalid resolution lifecycle for ${id}.`);
    if (proposal.resolvedOn && (!dateValid(proposal.resolvedOn) || proposal.resolvedOn < (proposal.submittedOn ?? proposal.createdOn) || proposal.resolvedOn > state.date)) errors.push(`Invalid resolution date for ${id}.`);
    if (proposal.referendumResult && (!dateValid(proposal.referendumResult.heldOn) || proposal.referendumResult.heldOn < (proposal.submittedOn ?? proposal.createdOn) || proposal.referendumResult.heldOn > state.date || typeof proposal.referendumResult.adopted !== 'boolean' || !Number.isSafeInteger(proposal.referendumResult.supportBps) || !Number.isSafeInteger(proposal.referendumResult.opposeBps) || !Number.isSafeInteger(proposal.referendumResult.abstainBps) || proposal.referendumResult.supportBps < 0 || proposal.referendumResult.supportBps > 10_000 || proposal.referendumResult.opposeBps < 0 || proposal.referendumResult.opposeBps > 10_000 || proposal.referendumResult.abstainBps < 0 || proposal.referendumResult.abstainBps > 10_000 || proposal.referendumResult.supportBps + proposal.referendumResult.opposeBps + proposal.referendumResult.abstainBps !== 10_000 || !['complete', 'partial', 'unavailable'].includes(proposal.referendumResult.coverage) || !proposal.referendumResult.limitation?.trim() || proposal.referendumResult.participationBps !== undefined && (!Number.isSafeInteger(proposal.referendumResult.participationBps) || proposal.referendumResult.participationBps < 0 || proposal.referendumResult.participationBps > 10_000))) errors.push(`Invalid referendum record for ${id}.`);
    if (proposal.referendumResult && proposal.status === 'draft') errors.push(`Draft proposal ${id} carries a referendum record.`);
    if (!(PROPOSAL_KINDS as readonly string[]).includes(proposal.kind)) errors.push(`Unknown proposal kind for ${id}.`);
    if (!PROPOSAL_INSTRUMENT_CLASSES.includes(proposal.instrumentClass)) errors.push(`Invalid instrument class for ${id}.`);
    const contract = PROPOSAL_CONTRACTS[proposal.kind];
    if (contract && !contract.allowedInstrumentClasses.includes(proposal.instrumentClass)) errors.push(`Instrument class ${proposal.instrumentClass} is not allowed for ${proposal.kind} proposal ${id}.`);
    if (proposal.constitutionalDisposition !== undefined && (proposal.kind !== 'constitutional_amendment' || !['principal', 'secondary'].includes(proposal.constitutionalDisposition))) errors.push(`Constitutional disposition is invalid for ${proposal.kind} proposal ${id}.`);
    if (proposal.kind === 'constitutional_amendment') {
      const structural = Boolean(proposal.payload.rightsChanges || proposal.payload.parliamentChanges || proposal.payload.executiveChanges || proposal.payload.electionChanges || proposal.payload.judicialChanges || proposal.payload.territoryChanges || proposal.payload.amendmentChanges);
      const derived = structural ? 'principal' : 'secondary';
      if (proposal.constitutionalDisposition !== derived) errors.push(`Constitutional disposition ${id} is not derived from its payload.`);
    }
    const effectValid = (effect: ProposalEffect) => effect.category === proposal.kind && (effect.category === 'fiscal_reform'
      ? Number.isSafeInteger(effect.fiscalReformSequence) && typeof effect.reformFingerprint === 'string'
      : Array.isArray(effect.protectedMaterialKeys) && Array.isArray(effect.unprotectedMaterialKeys));
    // Guard the array and each element: a validator must report a clean violation for a missing
    // or null-holding effects array instead of dereferencing it and throwing a TypeError.
    const effects = Array.isArray(proposal.effects) ? proposal.effects : undefined;
    if (effects === undefined) {
      errors.push(`Invalid typed effects for ${id}.`);
    } else {
      if (effects.some(effect => effect == null || !effectValid(effect))) errors.push(`Invalid typed effects for ${id}.`);
      if (proposal.status === 'enacted') {
        if (effects.length !== 1) errors.push(`Enacted proposal ${id} lacks exactly one matching typed effect.`);
        else {
          const firstEffect = effects[0];
          if (proposal.kind === 'fiscal_reform' && proposal.enactmentReference && (firstEffect == null || firstEffect.fiscalReformSequence !== proposal.enactmentReference.fiscalReformSequence || firstEffect.reformFingerprint !== proposal.enactmentReference.reformFingerprint)) errors.push(`Enacted proposal ${id} has a typed effect inconsistent with its enactment reference.`);
        }
      }
      if (proposal.status !== 'enacted' && effects.length !== 0) errors.push(`Non-enacted proposal ${id} records a typed effect before becoming effective.`);
    }
    if (proposal.publicEstimate && (![proposal.publicEstimate.supportBps, proposal.publicEstimate.opposeBps, proposal.publicEstimate.neutralBps, proposal.publicEstimate.unknownBps, proposal.publicEstimate.confidenceBps].every(bps) || proposal.publicEstimate.supportBps + proposal.publicEstimate.opposeBps + proposal.publicEstimate.neutralBps + proposal.publicEstimate.unknownBps !== 10_000 || !coverage(proposal.publicEstimate.coverage) || ![proposal.publicEstimate.representedPersons, proposal.publicEstimate.knownPersons, proposal.publicEstimate.unknownPersons].every(nonNegative) || proposal.publicEstimate.knownPersons + proposal.publicEstimate.unknownPersons !== proposal.publicEstimate.representedPersons || proposal.publicEstimate.coverage === 'complete' && proposal.publicEstimate.unknownPersons !== 0 || proposal.publicEstimate.coverage === 'unavailable' && proposal.publicEstimate.knownPersons !== 0)) errors.push(`Invalid public estimate for ${id}.`);
    const legacyAggregateOnly = proposal.evaluationVersion === 'legacy-0.14-v1' && ['enacted', 'rejected', 'unavailable'].includes(proposal.status);
    const institutional = proposal.evaluationVersion === 'situational-plurality-0.15-v2';
    const plurality = institutional || proposal.evaluationVersion === 'plurality-0.15-v1';
    if (proposal.evaluationVersion !== undefined && !['legacy-0.14-v1', 'situational-0.14-v2', 'plurality-0.15-v1', 'situational-plurality-0.15-v2'].includes(proposal.evaluationVersion)) errors.push(`Invalid evaluation version for ${id}.`);
    if (institutional ? !validateInstitutionalEvidence(state, proposal)
      : proposal.analysis?.institutionalEffects !== undefined || [proposal.parliamentaryEstimate, proposal.voteResult].some(estimate => Array.isArray(estimate?.chambers) && estimate.chambers.some(chamber => Array.isArray(chamber.partyEvaluations) && chamber.partyEvaluations.some(item => item.institutionalInterest !== undefined)))) errors.push(`Invalid institutional evidence for ${id}.`);
    if (proposal.parliamentaryEstimate && !validateParliamentary(state, proposal.parliamentaryEstimate, legacyAggregateOnly, plurality, id, proposal.countryId)) errors.push(`Invalid parliamentary estimate for ${id}.`);
    if (proposal.analysis && !validateAnalysis(proposal.analysis)) errors.push(`Invalid proposal analysis for ${id}.`);
    if (proposal.voteResult) {
      if (!validateParliamentary(state, proposal.voteResult, legacyAggregateOnly, plurality, id, proposal.countryId) || !dateValid(proposal.voteResult.resolvedOn) || proposal.voteResult.resolvedOn !== proposal.resolvedOn) errors.push(`Invalid vote result for ${id}.`);
      if (plurality) {
        const { outcome: _outcome, resolvedOn: _resolvedOn, reason: _reason, ...recordedEstimate } = proposal.voteResult;
        if (!proposal.parliamentaryEstimate || canonicalJson(recordedEstimate) !== canonicalJson(proposal.parliamentaryEstimate)) errors.push(`Plurality estimate/result mismatch for ${id}.`);
      }
      const executiveOverride = proposal.voteResult.reason === 'executive_override' || proposal.voteResult.reason === 'executive_decision' || proposal.voteResult.reason === 'no_parliamentary_vote_required';
      // A rejection whose reason is a constitutional procedure block (referendum, threshold, protected
      // key) or an executive decision is not a parliamentary defeat: the chamber opinion is recorded
      // as evaluated, and the reason distinguishes the outcome.
      const parliamentaryDefeat = proposal.voteResult.outcome === 'rejected' && !['executive_decision', 'referendum_failed', 'constitutional_threshold', 'constitutionally_protected'].includes(proposal.voteResult.reason ?? '');
      if (proposal.voteResult.outcome === 'adopted' && !executiveOverride && (proposal.voteResult.coverage !== 'complete' || !proposal.voteResult.chambers.length || !proposal.voteResult.chambers.every(chamber => chamber.adopted === true))) errors.push(`Adopted vote ${id} is not supported by every complete chamber.`);
      if (parliamentaryDefeat && (proposal.voteResult.coverage !== 'complete' || proposal.voteResult.chambers.every(chamber => chamber.adopted === true))) errors.push(`Rejected vote ${id} is inconsistent with its chambers.`);
      if (executiveOverride && proposal.voteResult.chambers.every(chamber => chamber.adopted === true)) errors.push(`Executive override ${id} does not follow a parliamentary rejection.`);
      if (proposal.voteResult.outcome === 'unavailable' && !proposal.voteResult.reason) errors.push(`Unavailable vote ${id} has no reason.`);
      if (proposal.voteResult.reason === 'institutional_data_unavailable' && proposal.voteResult.coverage === 'complete') errors.push(`Unavailable vote ${id} falsely reports complete institutional coverage.`);
      if (proposal.voteResult.reason === 'effective_date_expired' && state.date <= proposal.effectiveDate) errors.push(`Proposal ${id} is falsely marked expired.`);
    }
    if (proposal.evaluationVersion === 'situational-0.14-v2' && (!proposal.analysis || !proposal.publicEstimate || !proposal.parliamentaryEstimate || !proposal.voteResult)) errors.push(`Situational evaluation ${id} is incomplete.`);
    if (plurality && proposal.status !== 'consulted' && (!proposal.analysis || !proposal.publicEstimate || !proposal.parliamentaryEstimate || !proposal.voteResult)) errors.push(`Plurality evaluation ${id} is incomplete.`);
    if (proposal.status === 'enacted') {
      if (proposal.kind === 'fiscal_reform') {
        const sequence = proposal.scheduledFiscalReformSequence, expectedFingerprint = fiscalReformFingerprint({ countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...proposal.payload });
        if (sequence === undefined || !nonNegative(sequence) || sequence >= state.fiscal.nextSequence || reformSequences.has(sequence) || !proposal.enactmentReference || proposal.enactmentReference.fiscalReformSequence !== sequence || proposal.enactmentReference.reformFingerprint !== expectedFingerprint) errors.push(`Enacted proposal ${id} has an invalid fiscal enactment reference.`);
        else {
          reformSequences.add(sequence);
          const evidence = [...state.fiscal.reforms, ...state.fiscal.reformReceipts].filter(item => item.sequence === sequence && item.countryId === proposal.countryId && item.effectiveDate === proposal.effectiveDate && (!('reformFingerprint' in item) ? fiscalReformFingerprint(item) === expectedFingerprint : item.reformFingerprint === expectedFingerprint) && item.origin?.type === 'governance_proposal' && item.origin.proposalId === id && item.origin.proposalFingerprint === proposal.submittedPayloadFingerprint);
          if (evidence.length !== 1) errors.push(`Enacted proposal ${id} does not own exactly one matching fiscal reform or receipt.`);
        }
      }
    } else if (proposal.kind === 'fiscal_reform' && (proposal.scheduledFiscalReformSequence !== undefined || proposal.enactmentReference)) errors.push(`Non-enacted proposal ${id} references a fiscal reform.`);
  }
  for (const [countryId, cabinet] of Object.entries(g.cabinets ?? {})) {
    if (cabinet.countryId !== countryId || !context.countryIds.has(countryId)) errors.push(`Cabinet ${countryId} has an invalid identity.`);
    if (cabinet.viceLeaderPersonId !== undefined && (!g.persons[cabinet.viceLeaderPersonId] || g.persons[cabinet.viceLeaderPersonId].countryId !== countryId)) errors.push(`Cabinet ${countryId} has an invalid deputy reference.`);
    if (cabinet.lastHeadPersonId !== undefined && (!g.persons[cabinet.lastHeadPersonId] || g.persons[cabinet.lastHeadPersonId].countryId !== countryId)) errors.push(`Cabinet ${countryId} has an invalid last head reference.`);
    if (cabinet.actingHead && (cabinet.actingHead.kind !== 'deputy_temporary' || !dateValid(cabinet.actingHead.since) || cabinet.actingHead.since > state.date || !g.persons[cabinet.actingHead.personId] || !g.persons[cabinet.actingHead.predecessorPersonId] || cabinet.actingHead.personId === cabinet.actingHead.predecessorPersonId)) errors.push(`Cabinet ${countryId} has an invalid acting-head record.`);
    // The acting arrangement and the offices must reconcile: the acting person really holds the
    // head-of-government office while the record exists, the office marks the temporary exercise,
    // and the predecessor does not hold it.
    if (cabinet.actingHead) {
      const actingPerson = g.persons[cabinet.actingHead.personId];
      const predecessor = g.persons[cabinet.actingHead.predecessorPersonId];
      if (actingPerson?.office?.role !== 'head_of_government' || actingPerson.office.countryId !== countryId) errors.push(`Cabinet ${countryId} acting head does not hold the head-of-government office.`);
      if (actingPerson?.office && !actingPerson.office.title.includes('acting')) errors.push(`Cabinet ${countryId} acting head office does not mark the temporary exercise.`);
      if (predecessor?.office?.role === 'head_of_government' && predecessor.office.countryId === countryId) errors.push(`Cabinet ${countryId} predecessor still holds the office while an acting head is recorded.`);
    }
    // The deputy (vice-leader) must never simultaneously hold the head-of-government office unless
    // the recorded temporary succession is exactly that arrangement.
    if (cabinet.viceLeaderPersonId !== undefined) {
      const vice = g.persons[cabinet.viceLeaderPersonId];
      const isRecordedActingHead = cabinet.actingHead?.personId === cabinet.viceLeaderPersonId;
      if (vice?.office?.role === 'head_of_government' && vice.office.countryId === countryId && !isRecordedActingHead) errors.push(`Cabinet ${countryId} deputy holds the head-of-government office without a recorded succession.`);
    }
    for (const [portfolioId, portfolio] of Object.entries(cabinet.portfolios)) {
      if (!portfolio || portfolio.id !== portfolioId || !portfolio.name?.trim()) errors.push(`Cabinet ${countryId} has an invalid portfolio ${portfolioId}.`);
      if (portfolio.ministerPersonId !== undefined) {
        const minister = g.persons[portfolio.ministerPersonId];
        // A portfolio minister must really be an active person holding the corresponding ministerial
        // office — never an orphan reference, and never the current head of government.
        if (!minister || minister.countryId !== countryId || minister.status !== 'active' || minister.office?.role !== 'minister' || minister.office.countryId !== countryId) {
          errors.push(`Cabinet ${countryId} portfolio ${portfolioId} references a person without the corresponding ministerial office.`);
        }
      }
    }
    for (const event of cabinet.censureEvents ?? []) {
      if (!dateValid(event.on) || event.on > state.date || !event.byPersonId?.trim() || !['government', 'leader'].includes(event.kind)) errors.push(`Cabinet ${countryId} has an invalid censure event.`);
    }
  }
  // Pre-vote negotiations and party whip instructions are validated records.
  for (const [id, proposal] of Object.entries(g.proposals)) {
    for (const negotiation of proposal.negotiations ?? []) {
      const person = g.persons[negotiation.byPersonId];
      if (!dateValid(negotiation.on) || negotiation.on > state.date || negotiation.on < proposal.createdOn || negotiation.proposalId !== id
        || !negotiation.byPersonId?.trim() || !person || person.countryId !== proposal.countryId || !negotiation.partyId?.trim()
        || !Array.isArray(negotiation.conditions) || negotiation.conditions.length === 0 || negotiation.conditions.some(condition => typeof condition !== 'string' || !condition.trim())
        || (negotiation.supportCommitment !== undefined && !['support', 'oppose', 'conditional'].includes(negotiation.supportCommitment))) errors.push(`Invalid pre-vote negotiation record for ${id}.`);
    }
    for (const whip of proposal.whipInstructions ?? []) {
      const person = g.persons[whip.byPersonId];
      if (!dateValid(whip.on) || whip.on > state.date || whip.on < (proposal.submittedOn ?? proposal.createdOn) || whip.proposalId !== id
        || !whip.byPersonId?.trim() || !person || person.partyId !== whip.partyId || !person.isPartyLeader || person.countryId !== proposal.countryId
        || !['yes', 'no', 'abstain', 'free'].includes(whip.instruction)) errors.push(`Invalid party whip instruction for ${id}.`);
    }
  }
  // The ministerial suggestion system and its global toggle.
  if (typeof g.settings?.spontaneousMinisterialProposalsEnabled !== 'boolean') errors.push('Invalid ministerial proposal settings.');
  if (!Number.isSafeInteger(g.nextSuggestionSequence) || g.nextSuggestionSequence < 0) errors.push('Invalid ministerial suggestion sequence.');
  const suggestionIds = new Set<string>();
  for (const suggestion of g.ministerialSuggestions ?? []) {
    if (!suggestion || suggestionIds.has(suggestion.id) || !suggestion.id?.match(/^suggestion\.\d{8}$/) || Number(suggestion.id.slice(11)) >= g.nextSuggestionSequence
      || !dateValid(suggestion.on) || suggestion.on > state.date || !suggestion.byPersonId?.trim() || !suggestion.portfolioId?.trim()
      || !['fiscal_reform', 'constitutional_amendment'].includes(suggestion.kind) || !suggestion.subject?.trim()
      || !['pending', 'accepted', 'declined'].includes(suggestion.status)
      || (suggestion.status === 'accepted' && !suggestion.acceptedIntoProposalId)
      || (suggestion.status !== 'pending' && !suggestion.resolvedOn)
      || (suggestion.resolvedOn !== undefined && (!dateValid(suggestion.resolvedOn) || suggestion.resolvedOn > state.date))) errors.push('Invalid ministerial suggestion.');
    suggestionIds.add(suggestion.id);
  }
  return errors;
} };
