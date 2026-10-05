import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { MULTILATERAL_VERSION, multilateralDecisionId, multilateralOrganizationId, multilateralTreatyId, validTradeCategory } from './model';

const dateLe = (a: string, b: string) => a <= b;

export const multilateralInvariant: SimulationInvariant = {
  id: 'multilateral-0.20-integrity',
  check: (state, context) => {
    const errors: string[] = [];
    const m = state.multilateral;
    if (!m || m.version !== MULTILATERAL_VERSION || !m.treaties || !Array.isArray(m.treatyOrder) || !m.organizations || !Array.isArray(m.organizationOrder) || !m.decisions || !Array.isArray(m.decisionOrder)) return ['Malformed multilateral state.'];
    if (!m.initializedOn) return Object.keys(m.treaties).length || Object.keys(m.organizations).length || Object.keys(m.decisions).length ? ['Uninitialized multilateral state contains material records.'] : [];
    if (!validDate(m.initializedOn) || m.initializedOn > state.date) errors.push('Invalid multilateral initialization date.');
    if (new Set(m.treatyOrder).size !== m.treatyOrder.length || m.treatyOrder.some(id => !m.treaties[id]) || Object.keys(m.treaties).some(id => !m.treatyOrder.includes(id))) errors.push('Treaty order does not reconcile.');
    for (const [id, treaty] of Object.entries(m.treaties)) {
      if (id !== treaty.id || !/^treaty\.\d{8}$/.test(treaty.id) || !treaty.title?.trim()) errors.push(`Malformed treaty identity ${id}.`);
      if (!/^treaty\.\d{8}$/.test(id) && Number.isFinite(Number(id.split('.')[1]))) errors.push(`Invalid treaty sequence ${id}.`);
      if (treaty.parties.length < 2 || new Set(treaty.parties).size !== treaty.parties.length || [...treaty.parties].some((p, i) => i > 0 && treaty.parties[i - 1] >= p) || treaty.parties.some(p => !context.countryIds.has(p))) errors.push(`Treaty ${id} has malformed or duplicate parties.`);
      if (!validDate(treaty.proposalDate) || treaty.proposalDate > state.date || !['proposed', 'signed', 'active', 'suspended', 'terminated', 'expired'].includes(treaty.status)) errors.push(`Treaty ${id} has an invalid date or status.`);
      for (const [countryId, date] of Object.entries(treaty.signatories)) {
        if (!treaty.parties.includes(countryId) || !validDate(date) || date < treaty.proposalDate || date > state.date) errors.push(`Treaty ${id} has an invalid signature for ${countryId}.`);
      }
      for (const [countryId, date] of Object.entries(treaty.ratifications)) {
        if (!treaty.parties.includes(countryId) || !validDate(date) || date < treaty.proposalDate || date > state.date || (treaty.signatories[countryId] && date < treaty.signatories[countryId])) errors.push(`Treaty ${id} has an invalid ratification for ${countryId}.`);
      }
      if (!['signature', 'ratification'].includes(treaty.entryIntoForce.kind) || !Number.isSafeInteger(treaty.entryIntoForce.requiredRatifications) || treaty.entryIntoForce.requiredRatifications < 1 || treaty.entryIntoForce.requiredRatifications > treaty.parties.length) errors.push(`Treaty ${id} has an invalid entry-into-force rule.`);
      if (!Number.isSafeInteger(treaty.withdrawal.noticeDays) || treaty.withdrawal.noticeDays < 0) errors.push(`Treaty ${id} has invalid withdrawal rules.`);
      for (const [countryId, date] of Object.entries(treaty.withdrawals)) {
        if (!treaty.parties.includes(countryId) || !validDate(date) || date < treaty.proposalDate || date > state.date) errors.push(`Treaty ${id} has an invalid withdrawal for ${countryId}.`);
      }
      if (treaty.activeOn !== undefined && (!validDate(treaty.activeOn) || treaty.activeOn > state.date || treaty.activeOn < treaty.proposalDate)) errors.push(`Treaty ${id} has an invalid active date.`);
      if (treaty.terminatedOn !== undefined && (!validDate(treaty.terminatedOn) || treaty.terminatedOn > state.date || treaty.terminatedOn < treaty.proposalDate || (treaty.activeOn && treaty.terminatedOn < treaty.activeOn))) errors.push(`Treaty ${id} has an invalid termination date.`);
      if (treaty.status === 'proposed' && (treaty.activeOn !== undefined || treaty.terminatedOn !== undefined)) errors.push(`Proposed treaty ${id} carries an activation/termination date.`);
      if (treaty.status === 'signed' && (treaty.activeOn !== undefined || treaty.terminatedOn !== undefined)) errors.push(`Signed treaty ${id} carries an activation/termination date.`);
      if (treaty.status === 'active' && (treaty.activeOn === undefined || treaty.terminatedOn !== undefined)) errors.push(`Active treaty ${id} lacks a valid activation chronology.`);
      if (['suspended', 'terminated', 'expired'].includes(treaty.status) && treaty.terminatedOn === undefined) errors.push(`Inactive treaty ${id} lacks a termination date.`);
      if (treaty.activeOn !== undefined) {
        const met = treaty.entryIntoForce.kind === 'signature'
          ? treaty.parties.every(p => treaty.signatories[p] && dateLe(treaty.signatories[p], treaty.activeOn!))
          : treaty.parties.filter(p => treaty.ratifications[p] && dateLe(treaty.ratifications[p], treaty.activeOn!)).length >= treaty.entryIntoForce.requiredRatifications;
        if (!met) errors.push(`Treaty ${id} became active without satisfying its entry-into-force rule.`);
      }
      if (!['synthetic', 'modelled', 'sourced', 'unavailable'].includes(treaty.provenance.status) || !treaty.provenance.limitation?.trim()) errors.push(`Treaty ${id} has invalid provenance.`);
      if (!Array.isArray(treaty.clauses)) errors.push(`Treaty ${id} has no clause list.`);
      else for (const clause of treaty.clauses) {
        if (!clause || typeof clause !== 'object') { errors.push(`Treaty ${id} has a malformed clause.`); continue; }
        if (clause.kind === 'defensive_guarantee' || clause.kind === 'non_aggression' || clause.kind === 'recognition') {
          const ids = clause.kind === 'defensive_guarantee' ? [clause.protectedCountryId, clause.obligatedCountryId] : clause.kind === 'non_aggression' ? [clause.partyAId, clause.partyBId] : [clause.recognizedCountryId, clause.recognizingCountryId];
          if (ids.some(c => !treaty.parties.includes(c))) errors.push(`Treaty ${id} clause references a non-party.`);
        } else if (clause.kind === 'trade_commitment' || clause.kind === 'sanctions_commitment') {
          const ids = clause.kind === 'trade_commitment' ? [clause.importerId, clause.exporterId] : [clause.actorCountryId, clause.targetCountryId];
          if (ids.some(c => !treaty.parties.includes(c)) || clause.categories.length === 0 || new Set(clause.categories).size !== clause.categories.length || clause.categories.some(c => !validTradeCategory(c))) errors.push(`Treaty ${id} trade/sanctions clause is invalid.`);
        } else errors.push(`Treaty ${id} has an unknown clause kind.`);
      }
      for (const event of treaty.history) {
        if (!validDate(event.date) || event.date < treaty.proposalDate || event.date > state.date || !event.detail?.trim()) errors.push(`Treaty ${id} has an invalid history event.`);
      }
      if (treaty.history.length > 64) errors.push(`Treaty ${id} history exceeds its bound.`);
    }
    if (new Set(m.organizationOrder).size !== m.organizationOrder.length || m.organizationOrder.some(id => !m.organizations[id]) || Object.keys(m.organizations).some(id => !m.organizationOrder.includes(id))) errors.push('Organization order does not reconcile.');
    for (const [id, organization] of Object.entries(m.organizations)) {
      if (id !== organization.id || !/^organization\.\d{8}$/.test(organization.id) || !organization.title?.trim() || !validDate(organization.establishedOn) || organization.establishedOn > state.date) errors.push(`Malformed organization ${id}.`);
      if (!['majority', 'supermajority', 'unanimity'].includes(organization.votingRule.kind)) errors.push(`Organization ${id} has an invalid voting rule.`);
      if (organization.votingRule.thresholdBps !== undefined && (!Number.isSafeInteger(organization.votingRule.thresholdBps) || organization.votingRule.thresholdBps <= 0 || organization.votingRule.thresholdBps > 10000)) errors.push(`Organization ${id} has an invalid threshold.`);
      if (organization.votingRule.quorumBps !== undefined && (!Number.isSafeInteger(organization.votingRule.quorumBps) || organization.votingRule.quorumBps < 0 || organization.votingRule.quorumBps > 10000)) errors.push(`Organization ${id} has an invalid quorum.`);
      for (const [countryId, membership] of Object.entries(organization.members)) {
        if (!context.countryIds.has(countryId) || !['member', 'observer'].includes(membership.role) || !validDate(membership.joinedOn) || membership.joinedOn < organization.establishedOn || membership.joinedOn > state.date) errors.push(`Organization ${id} has invalid membership for ${countryId}.`);
        if (organization.history.some(event => event.kind === 'withdrawal' && event.countryId === countryId && event.date >= membership.joinedOn)) errors.push(`Organization ${id} member ${countryId} is current after a withdrawal without a later accession.`);
      }
      if (!['synthetic', 'modelled', 'sourced', 'unavailable'].includes(organization.provenance.status) || !organization.provenance.limitation?.trim()) errors.push(`Organization ${id} has invalid provenance.`);
      for (const event of organization.history) if (!validDate(event.date) || event.date > state.date || !event.detail?.trim()) errors.push(`Organization ${id} has an invalid history event.`);
    }
    if (new Set(m.decisionOrder).size !== m.decisionOrder.length || m.decisionOrder.some(id => !m.decisions[id]) || Object.keys(m.decisions).some(id => !m.decisionOrder.includes(id))) errors.push('Decision order does not reconcile.');
    for (const [id, decision] of Object.entries(m.decisions)) {
      if (id !== decision.id || !/^decision\.\d{8}$/.test(decision.id) || !m.organizations[decision.organizationId] || !context.countryIds.has(decision.proposerCountryId) || !validDate(decision.proposalDate) || decision.proposalDate > state.date || !validDate(decision.votingClosesOn) || decision.votingClosesOn < decision.proposalDate || !['open', 'adopted', 'rejected', 'expired'].includes(decision.status)) errors.push(`Malformed decision ${id}.`);
      if (!state.governance.persons[decision.proposerPersonId] || state.governance.persons[decision.proposerPersonId].countryId !== decision.proposerCountryId) errors.push(`Decision ${id} has an invalid proposer.`);
      for (const [countryId, choice] of Object.entries(decision.votes)) {
        if (!['yes', 'no', 'abstain', 'unknown'].includes(choice)) errors.push(`Decision ${id} has an invalid vote from ${countryId}.`);
      }
      if (decision.result !== undefined && !['adopted', 'rejected'].includes(decision.result)) errors.push(`Decision ${id} has an invalid result.`);
      if (decision.status === 'adopted' && (decision.result !== 'adopted' || !decision.adoptedOn)) errors.push(`Adopted decision ${id} lacks a result date.`);
      if (decision.status === 'rejected' && decision.result !== 'rejected') errors.push(`Rejected decision ${id} lacks a result.`);
      if (decision.appliedEffectIds && new Set(decision.appliedEffectIds).size !== decision.appliedEffectIds.length) errors.push(`Decision ${id} has duplicate applied effects.`);
    }
    if (new Set(m.obligationOrder).size !== m.obligationOrder.length || m.obligationOrder.some(id => !m.obligations[id]) || Object.keys(m.obligations).some(id => !m.obligationOrder.includes(id))) errors.push('Obligation order does not reconcile.');
    for (const [id, obligation] of Object.entries(m.obligations)) {
      if (id !== obligation.id || !/^obligation\.\d{8}$/.test(obligation.id) || obligation.kind !== 'defensive_guarantee' || !m.treaties[obligation.treatyId] || !context.countryIds.has(obligation.protectedCountryId) || !context.countryIds.has(obligation.obligatedCountryId) || !validDate(obligation.triggeredOn) || obligation.triggeredOn > state.date || !['pending', 'honored', 'violated'].includes(obligation.status) || (obligation.resolvedOn !== undefined && (!validDate(obligation.resolvedOn) || obligation.resolvedOn < obligation.triggeredOn || obligation.resolvedOn > state.date))) errors.push(`Malformed obligation ${id}.`);
    }
    if (new Set(m.violationOrder).size !== m.violationOrder.length || m.violationOrder.some(id => !m.violations[id]) || Object.keys(m.violations).some(id => !m.violationOrder.includes(id))) errors.push('Violation order does not reconcile.');
    for (const [id, violation] of Object.entries(m.violations)) {
      if (id !== violation.id || !/^violation\.\d{8}$/.test(violation.id) || violation.kind !== 'non_aggression' || !m.treaties[violation.treatyId] || !context.countryIds.has(violation.violatingCountryId) || !context.countryIds.has(violation.violatedAgainstCountryId) || !validDate(violation.violatedOn) || violation.violatedOn > state.date || !violation.detail?.trim()) errors.push(`Malformed violation ${id}.`);
    }
    return errors;
  },
};
