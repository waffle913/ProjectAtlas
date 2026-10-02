import type { SimulationInvariant } from '../invariants';
import { dateValid, validatePolicy } from '../fiscal/math';
import { fiscalReformFingerprint, validateBudget } from '../fiscal/runtime';
import { politicalRegistry } from '../politics/registry';
import { persistedOfficeEvidenceErrors } from './officeEvidence';
import { GOVERNANCE_VOTE_THRESHOLDS } from './analysis';
import {
  AUTHORITY_CAPABILITIES, GOVERNANCE_VERSION, governanceFingerprint,
  type ChamberSupportEstimate, type PartyProposalEvaluation, type PoliticalProposal, type ProposalAnalysis,
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

function validateChamber(chamber: ChamberSupportEstimate, legacyAggregateOnly: boolean): boolean {
  if (!chamber.chamberId || ![chamber.yesSeats, chamber.noSeats, chamber.abstainSeats, chamber.unavailableSeats].every(nonNegative) || !coverage(chamber.coverage)) return false;
  const allocated = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats + chamber.unavailableSeats;
  if (chamber.totalSeats !== undefined && (!nonNegative(chamber.totalSeats) || allocated !== chamber.totalSeats)) return false;
  if (chamber.coverage === 'complete' && chamber.unavailableSeats !== 0) return false;
  if (chamber.adopted !== undefined && (chamber.coverage !== 'complete' || chamber.adopted !== (chamber.yesSeats > chamber.noSeats))) return false;
  if (chamber.partyEvaluations && (!Array.isArray(chamber.partyEvaluations) || !chamber.partyEvaluations.every(item => nonNegative(item.seats) && validatePartyEvaluation(item)))) return false;
  if (!chamber.partyEvaluations) {
    if (!legacyAggregateOnly) return false;
    if (chamber.totalSeats === undefined) return chamber.coverage === 'unavailable' && chamber.adopted === undefined && allocated === 0;
    const knownSeats = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats, expectedCoverage = chamber.unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
    return chamber.coverage === expectedCoverage && (expectedCoverage === 'complete' ? chamber.adopted === (chamber.yesSeats > chamber.noSeats) : chamber.adopted === undefined);
  }
  const seats = (vote: PartyProposalEvaluation['vote']) => chamber.partyEvaluations!.filter(item => item.vote === vote).reduce((sum, item) => sum + item.seats, 0), partySeats = chamber.partyEvaluations.reduce((sum, item) => sum + item.seats, 0);
  if (chamber.yesSeats !== seats('yes') || chamber.noSeats !== seats('no') || chamber.abstainSeats !== seats('abstain')) return false;
  if (chamber.totalSeats === undefined) return chamber.partyEvaluations.length === 0 && chamber.coverage === 'unavailable' && chamber.adopted === undefined && allocated === 0;
  if (partySeats > chamber.totalSeats || chamber.unavailableSeats !== seats('unknown') + chamber.totalSeats - partySeats) return false;
  const knownSeats = chamber.yesSeats + chamber.noSeats + chamber.abstainSeats, expectedCoverage = chamber.unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
  if (chamber.coverage !== expectedCoverage || (expectedCoverage === 'complete' ? chamber.adopted !== (chamber.yesSeats > chamber.noSeats) : chamber.adopted !== undefined)) return false;
  return true;
}

function validateParliamentary(estimate: NonNullable<PoliticalProposal['parliamentaryEstimate']>, legacyAggregateOnly = false): boolean {
  if (![estimate.yesSeats, estimate.noSeats, estimate.abstainSeats, estimate.unavailableSeats, estimate.totalSeats].every(nonNegative) || !bps(estimate.confidenceBps) || !coverage(estimate.coverage) || estimate.procedure !== 'modelled_procedure_v1' || !estimate.chambers.every(chamber => validateChamber(chamber, legacyAggregateOnly))) return false;
  const sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => estimate.chambers.reduce((total, chamber) => total + chamber[field], 0);
  const expectedCoverage = estimate.chambers.length > 0 && estimate.chambers.every(item => item.coverage === 'complete') ? 'complete' : estimate.chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  return estimate.coverage === expectedCoverage && estimate.yesSeats === sum('yesSeats') && estimate.noSeats === sum('noSeats') && estimate.abstainSeats === sum('abstainSeats') && estimate.unavailableSeats === sum('unavailableSeats') && estimate.totalSeats === estimate.chambers.reduce((total, chamber) => total + (chamber.totalSeats ?? 0), 0);
}

function validateAnalysis(analysis: ProposalAnalysis): boolean {
  if (analysis.version !== 'proposal-analysis-0.14-v2' || !coverage(analysis.coverage) || typeof analysis.genuinelyNeutral !== 'boolean') return false;
  if (!analysis.directPolicyChanges.every(change => change.path && coverage(change.coverage) && change.explanation && (change.delta === undefined || finite(change.delta)))) return false;
  if (!analysis.unsupportedChanges.every(change => change.path && change.reason && ['partial', 'unavailable'].includes(change.coverage))) return false;
  if (!analysis.limitations.every(item => typeof item === 'string')) return false;
  if (!Object.values(analysis.materialContext).every(metric => coverage(metric.coverage) && metric.source && (metric.valueBps === undefined || bps(metric.valueBps)))) return false;
  if (!Object.values(analysis.issueEffects).every(value => Number.isSafeInteger(value) && value >= -10_000 && value <= 10_000)) return false;
  return analysis.expectedConsequences.every(item => item.source && item.explanation && coverage(item.coverage) && Number.isSafeInteger(item.directionBps) && Math.abs(item.directionBps) <= 10_000 && bps(item.magnitudeBps) && bps(item.confidenceBps));
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
    if (person.isPartyLeader && person.status === 'active' && person.createdOn === politicalRegistry.referenceDate) {
      if (activeInitialLeaderNames.has(person.displayName)) errors.push(`Initial active party leader name is duplicated: ${person.displayName}.`);
      activeInitialLeaderNames.add(person.displayName);
    }
    if (person.partyId && politicalRegistry.parties[person.partyId]?.countryId !== person.countryId) errors.push(`Invalid party reference for ${id}.`);
    if (person.isPartyLeader && !person.partyId) errors.push(`Party leader ${id} has no party.`);
    if (person.office && (!['head_of_government', 'head_of_state', 'legislator'].includes(person.office.role) || person.office.countryId !== person.countryId || !person.office.title?.trim() || !dateValid(person.office.appointedOn) || person.office.appointedOn < g.initializedOn || person.office.appointedOn < person.createdOn || person.office.appointedOn > state.date || person.office.authorityProfile.status !== 'modelled_constitutional_abstraction' || !person.office.authorityProfile.limitation || person.office.authorityProfile.capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item)))) errors.push(`Malformed office for ${id}.`);
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
    if (proposal.id !== id || !id.match(/^proposal\.\d{8}$/) || Number(id.slice(9)) >= g.nextProposalSequence || !['draft', 'submitted', 'enacted', 'rejected', 'withdrawn', 'unavailable'].includes(proposal.status) || !proposer || proposer.countryId !== proposal.countryId || !context.countryIds.has(proposal.countryId) || !dateValid(proposal.createdOn) || proposal.createdOn < g.initializedOn || proposal.createdOn > state.date || !dateValid(proposal.effectiveDate) || proposal.effectiveDate < proposal.createdOn) errors.push(`Malformed proposal ${id}.`);
    if ((!proposal.payload.policy && !proposal.payload.annualBudget) || (proposal.payload.policy && safe(() => validatePolicy(proposal.payload.policy!, proposal.countryId, proposal.effectiveDate))) || (proposal.payload.annualBudget && safe(() => validateBudget(proposal.payload.annualBudget!)))) errors.push(`Invalid fiscal payload for ${id}.`);
    if (proposal.status === 'draft' && (proposal.submittedOn || proposal.submittedPayloadFingerprint || proposal.resolvedOn || proposal.voteResult)) errors.push(`Draft ${id} contains lifecycle residue.`);
    if (proposal.status === 'submitted' && (proposal.resolvedOn || proposal.voteResult)) errors.push(`Submitted proposal ${id} contains resolution residue.`);
    if (proposal.status === 'withdrawn' && proposal.voteResult) errors.push(`Withdrawn proposal ${id} contains a vote result.`);
    if (['submitted', 'enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.submittedOn || !dateValid(proposal.submittedOn) || proposal.submittedOn < proposal.createdOn || proposal.submittedOn > state.date)) errors.push(`Invalid submission lifecycle for ${id}.`);
    if (proposal.submittedOn && proposal.submittedPayloadFingerprint !== governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload })) errors.push(`Submitted proposal ${id} payload was modified.`);
    if (['enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.resolvedOn || !proposal.voteResult || proposal.voteResult.outcome !== (proposal.status === 'enacted' ? 'adopted' : proposal.status))) errors.push(`Invalid resolution lifecycle for ${id}.`);
    if (proposal.resolvedOn && (!dateValid(proposal.resolvedOn) || proposal.resolvedOn < (proposal.submittedOn ?? proposal.createdOn) || proposal.resolvedOn > state.date)) errors.push(`Invalid resolution date for ${id}.`);
    if (proposal.publicEstimate && (![proposal.publicEstimate.supportBps, proposal.publicEstimate.opposeBps, proposal.publicEstimate.neutralBps, proposal.publicEstimate.unknownBps, proposal.publicEstimate.confidenceBps].every(bps) || proposal.publicEstimate.supportBps + proposal.publicEstimate.opposeBps + proposal.publicEstimate.neutralBps + proposal.publicEstimate.unknownBps !== 10_000 || !coverage(proposal.publicEstimate.coverage) || ![proposal.publicEstimate.representedPersons, proposal.publicEstimate.knownPersons, proposal.publicEstimate.unknownPersons].every(nonNegative) || proposal.publicEstimate.knownPersons + proposal.publicEstimate.unknownPersons !== proposal.publicEstimate.representedPersons || proposal.publicEstimate.coverage === 'complete' && proposal.publicEstimate.unknownPersons !== 0 || proposal.publicEstimate.coverage === 'unavailable' && proposal.publicEstimate.knownPersons !== 0)) errors.push(`Invalid public estimate for ${id}.`);
    const legacyAggregateOnly = proposal.evaluationVersion === 'legacy-0.14-v1' && ['enacted', 'rejected', 'unavailable'].includes(proposal.status);
    if (proposal.parliamentaryEstimate && !validateParliamentary(proposal.parliamentaryEstimate, legacyAggregateOnly)) errors.push(`Invalid parliamentary estimate for ${id}.`);
    if (proposal.analysis && !validateAnalysis(proposal.analysis)) errors.push(`Invalid proposal analysis for ${id}.`);
    if (proposal.voteResult) {
      if (!validateParliamentary(proposal.voteResult, legacyAggregateOnly) || !dateValid(proposal.voteResult.resolvedOn) || proposal.voteResult.resolvedOn !== proposal.resolvedOn) errors.push(`Invalid vote result for ${id}.`);
      if (proposal.voteResult.outcome === 'adopted' && (proposal.voteResult.coverage !== 'complete' || !proposal.voteResult.chambers.length || !proposal.voteResult.chambers.every(chamber => chamber.adopted === true))) errors.push(`Adopted vote ${id} is not supported by every complete chamber.`);
      if (proposal.voteResult.outcome === 'rejected' && (proposal.voteResult.coverage !== 'complete' || proposal.voteResult.chambers.every(chamber => chamber.adopted === true))) errors.push(`Rejected vote ${id} is inconsistent with its chambers.`);
      if (proposal.voteResult.outcome === 'unavailable' && !proposal.voteResult.reason) errors.push(`Unavailable vote ${id} has no reason.`);
      if (proposal.voteResult.reason === 'institutional_data_unavailable' && proposal.voteResult.coverage === 'complete') errors.push(`Unavailable vote ${id} falsely reports complete institutional coverage.`);
      if (proposal.voteResult.reason === 'effective_date_expired' && state.date <= proposal.effectiveDate) errors.push(`Proposal ${id} is falsely marked expired.`);
    }
    if (proposal.evaluationVersion === 'situational-0.14-v2' && (!proposal.analysis || !proposal.publicEstimate || !proposal.parliamentaryEstimate || !proposal.voteResult)) errors.push(`Situational evaluation ${id} is incomplete.`);
    if (proposal.status === 'enacted') {
      const sequence = proposal.scheduledFiscalReformSequence, expectedFingerprint = fiscalReformFingerprint({ countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...proposal.payload });
      if (sequence === undefined || !nonNegative(sequence) || sequence >= state.fiscal.nextSequence || reformSequences.has(sequence) || !proposal.enactmentReference || proposal.enactmentReference.fiscalReformSequence !== sequence || proposal.enactmentReference.reformFingerprint !== expectedFingerprint) errors.push(`Enacted proposal ${id} has an invalid fiscal enactment reference.`);
      else {
        reformSequences.add(sequence);
        const evidence = [...state.fiscal.reforms, ...state.fiscal.reformReceipts].filter(item => item.sequence === sequence && item.countryId === proposal.countryId && item.effectiveDate === proposal.effectiveDate && (!('reformFingerprint' in item) ? fiscalReformFingerprint(item) === expectedFingerprint : item.reformFingerprint === expectedFingerprint) && item.origin?.type === 'governance_proposal' && item.origin.proposalId === id && item.origin.proposalFingerprint === proposal.submittedPayloadFingerprint);
        if (evidence.length !== 1) errors.push(`Enacted proposal ${id} does not own exactly one matching fiscal reform or receipt.`);
      }
    } else if (proposal.scheduledFiscalReformSequence !== undefined || proposal.enactmentReference) errors.push(`Non-enacted proposal ${id} references a fiscal reform.`);
  }
  return errors;
} };
