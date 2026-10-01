import type { SimulationInvariant } from '../invariants';
import { dateValid, validatePolicy } from '../fiscal/math';
import { validateBudget } from '../fiscal/runtime';
import { politicalRegistry } from '../politics/registry';
import { AUTHORITY_CAPABILITIES, GOVERNANCE_VERSION, governanceFingerprint } from './model';

const safe = (fn: () => void) => { try { fn(); return false; } catch { return true; } };
export const governanceInvariant: SimulationInvariant = { id: 'governance', check: (state, context) => {
  const g = state.governance, errors: string[] = [];
  if (!g || g.version !== GOVERNANCE_VERSION || !g.initializedOn || !dateValid(g.initializedOn) || g.initializedOn > state.date || !Number.isSafeInteger(g.nextPersonSequence) || g.nextPersonSequence < 0 || !Number.isSafeInteger(g.nextProposalSequence) || g.nextProposalSequence < 0) return ['Malformed governance state.'];
  if (g.player.controlledPersonId && !g.persons[g.player.controlledPersonId]) errors.push('Controlled person does not exist.');
  for (const [id, person] of Object.entries(g.persons)) {
    if (person.id !== id || !id.match(/^person\.\d{8}$/) || Number(id.slice(7)) >= g.nextPersonSequence || !person.displayName.trim() || !context.countryIds.has(person.countryId) || !dateValid(person.createdOn) || person.createdOn > state.date || !['active', 'inactive'].includes(person.status)) errors.push(`Malformed political person ${id}.`);
    if (person.partyId && politicalRegistry.parties[person.partyId]?.countryId !== person.countryId) errors.push(`Invalid party reference for ${id}.`);
    if (person.isPartyLeader && !person.partyId) errors.push(`Party leader ${id} has no party.`);
    if (person.office && (!['head_of_government', 'head_of_state', 'legislator'].includes(person.office.role) || person.office.countryId !== person.countryId || !dateValid(person.office.appointedOn) || person.office.appointedOn > state.date || person.office.authorityProfile.status !== 'modelled_constitutional_abstraction' || person.office.authorityProfile.capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item)))) errors.push(`Malformed office for ${id}.`);
  }
  if (new Set(g.proposalOrder).size !== g.proposalOrder.length || g.proposalOrder.some(id => !g.proposals[id]) || Object.keys(g.proposals).some(id => !g.proposalOrder.includes(id))) errors.push('Proposal order does not reconcile.');
  const reformSequences = new Set<number>();
  for (const [id, proposal] of Object.entries(g.proposals)) {
    const proposer = g.persons[proposal.proposerPersonId];
    if (proposal.id !== id || !id.match(/^proposal\.\d{8}$/) || Number(id.slice(9)) >= g.nextProposalSequence || !['draft', 'submitted', 'enacted', 'rejected', 'withdrawn', 'unavailable'].includes(proposal.status) || !proposer || proposer.countryId !== proposal.countryId || !context.countryIds.has(proposal.countryId) || !dateValid(proposal.createdOn) || proposal.createdOn > state.date || !dateValid(proposal.effectiveDate) || proposal.effectiveDate < proposal.createdOn) errors.push(`Malformed proposal ${id}.`);
    if (!proposal.payload.policy && !proposal.payload.annualBudget || proposal.payload.policy && safe(() => validatePolicy(proposal.payload.policy!, proposal.countryId, proposal.effectiveDate)) || proposal.payload.annualBudget && safe(() => validateBudget(proposal.payload.annualBudget!))) errors.push(`Invalid fiscal payload for ${id}.`);
    if (proposal.status === 'draft' && (proposal.submittedOn || proposal.submittedPayloadFingerprint || proposal.resolvedOn || proposal.voteResult)) errors.push(`Draft ${id} contains lifecycle residue.`);
    if (proposal.status === 'submitted' && (proposal.resolvedOn || proposal.voteResult)) errors.push(`Submitted proposal ${id} contains resolution residue.`);
    if (proposal.status === 'withdrawn' && proposal.voteResult) errors.push(`Withdrawn proposal ${id} contains a vote result.`);
    if (['submitted', 'enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.submittedOn || !dateValid(proposal.submittedOn) || proposal.submittedOn < proposal.createdOn || proposal.submittedOn > state.date)) errors.push(`Invalid submission lifecycle for ${id}.`);
    if (proposal.submittedOn && proposal.submittedPayloadFingerprint !== governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload })) errors.push(`Submitted proposal ${id} payload was modified.`);
    if (['enacted', 'rejected', 'unavailable'].includes(proposal.status) && (!proposal.resolvedOn || !proposal.voteResult || proposal.voteResult.outcome !== (proposal.status === 'enacted' ? 'adopted' : proposal.status))) errors.push(`Invalid resolution lifecycle for ${id}.`);
    if (proposal.resolvedOn && (!dateValid(proposal.resolvedOn) || proposal.resolvedOn < (proposal.submittedOn ?? proposal.createdOn) || proposal.resolvedOn > state.date)) errors.push(`Invalid resolution date for ${id}.`);
    if (proposal.status === 'enacted') { const sequence = proposal.scheduledFiscalReformSequence; if (sequence === undefined || !Number.isSafeInteger(sequence) || sequence < 0 || sequence >= state.fiscal.nextSequence || reformSequences.has(sequence)) errors.push(`Enacted proposal ${id} does not own exactly one fiscal reform sequence.`); else reformSequences.add(sequence); }
    else if (proposal.scheduledFiscalReformSequence !== undefined) errors.push(`Non-enacted proposal ${id} references a fiscal reform.`);
  }
  return errors;
} };
