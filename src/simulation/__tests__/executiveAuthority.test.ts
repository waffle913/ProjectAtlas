import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { initializeNewGame } from '../initialization';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { politicalRegistry } from '../politics/registry';
import { AUTHORITY_CAPABILITIES, type PoliticalOfficeRole } from '../governance/model';
import { GOVERNMENT_AGENDA_CAPABILITIES, HEAD_OF_STATE_FUNCTIONS, nationalExecutiveAuthority, sourcedExecutiveSystem } from '../governance/officeEvidence';
import { executiveArrangement, officeAuthority } from '../governance/officeAuthority';
import {
  assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, hasPoliticalAuthority, reconcilePersistedOfficeCapabilities,
  revokePoliticalOffice, submitProposalForActor, transferPoliticalOffice,
} from '../governance/runtime';
import { proposeConstruction } from '../assets/runtime';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { assertAuthorizedStartingPerson, countryStartingOptions, selectableStartingCountryIds } from '../governance/selection';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

let initial: SimulationState;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

const sortedCountryIds = () => Object.keys(politicalRegistry.countries).sort();
const countryWithSystem = (system: string, predicate: (countryId: string) => boolean = () => true) =>
  sortedCountryIds().find(countryId => sourcedExecutiveSystem(countryId) === system && predicate(countryId))!;
const reconciledOffice = (countryId: string, role: PoliticalOfficeRole) =>
  Object.values(initial.governance.persons).find(person => person.countryId === countryId && person.office?.role === role && person.office.evidence);
function appoint(state: SimulationState, countryId: string, role: PoliticalOfficeRole) {
  const created = createPoliticalPerson(state, { displayName: `Appointed ${role} ${countryId}`, countryId });
  const id = `person.${String(created.governance.nextPersonSequence - 1).padStart(8, '0')}`;
  return { state: assignPoliticalOffice(created, id, { role, countryId }), id, countryId };
}
const officeCaps = (state: SimulationState, id: string) => state.governance.persons[id].office!.authorityProfile.capabilities;
const proposedBudget = (countryId: string) => structuredClone(initial.fiscal.countries[countryId].annualBudget);

describe('0.35 institutional executive authority', () => {
  it('never grants the parliamentary suffrage and never grants every capability to an office', () => {
    expect(AUTHORITY_CAPABILITIES.length).toBeGreaterThan(GOVERNMENT_AGENDA_CAPABILITIES.length);
    expect(GOVERNMENT_AGENDA_CAPABILITIES).not.toContain('vote_legislation');
    expect(HEAD_OF_STATE_FUNCTIONS).not.toContain('vote_legislation');
    expect(HEAD_OF_STATE_FUNCTIONS).not.toContain('sponsor_legislation');
    for (const capability of GOVERNMENT_AGENDA_CAPABILITIES) expect(AUTHORITY_CAPABILITIES).toContain(capability);
    const parliamentary = countryWithSystem('parliamentary');
    expect(officeAuthority(initial, parliamentary, 'legislator').capabilities).toEqual(['vote_legislation']);
    expect(officeAuthority(initial, parliamentary, 'minister').capabilities).toEqual([]);
    for (const system of ['presidential', 'parliamentary', 'monarchy_parliamentary', 'semi_presidential'] as const) {
      const countryId = countryWithSystem(system);
      for (const role of ['head_of_government', 'head_of_state'] as const) {
        const authority = officeAuthority(initial, countryId, role);
        expect(authority.capabilities).not.toContain('vote_legislation');
        expect(authority.withheldCapabilities).toContain('vote_legislation');
        expect(authority.capabilities.length).toBeLessThan(AUTHORITY_CAPABILITIES.length);
      }
    }
  });

  it('resolves the arrangement from the institutions and the constitution in force', () => {
    expect(executiveArrangement(initial, countryWithSystem('presidential')).arrangement).toBe('presidential');
    expect(executiveArrangement(initial, countryWithSystem('semi_presidential')).arrangement).toBe('semi_presidential');
    const parliamentary = countryWithSystem('parliamentary');
    // The constitution in force makes the government answerable to the chamber: the decisive rule.
    expect(executiveArrangement(initial, parliamentary)).toMatchObject({ arrangement: 'parliamentary', basis: 'constitutional_responsibility' });
    // A Country with no institutional record falls back to the generic modelled office scope.
    const generic = worldBase();
    expect(executiveArrangement(generic, 'country.synthetic-fixture').arrangement).toBe('generic');
    expect(executiveArrangement(generic, 'country.synthetic-fixture').basis).toBe('modelled_generic_office_scope');
    expect(officeAuthority(generic, 'country.synthetic-fixture', 'head_of_government').capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
  });

  it('gives the head of government the agenda and distinguishes the head of state by arrangement', () => {
    const presidential = countryWithSystem('presidential'), parliamentary = countryWithSystem('parliamentary'), monarchy = countryWithSystem('monarchy_parliamentary'), semi = countryWithSystem('semi_presidential');
    for (const countryId of [presidential, parliamentary, monarchy, semi]) {
      expect(officeAuthority(initial, countryId, 'head_of_government').capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    }
    // The head of state: the executive in a presidential system, ceremonial in a parliamentary one,
    // and a state-function holder in a shared (semi-presidential) arrangement.
    expect(officeAuthority(initial, presidential, 'head_of_state').capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    expect(officeAuthority(initial, parliamentary, 'head_of_state').capabilities).toEqual([]);
    expect(officeAuthority(initial, monarchy, 'head_of_state').capabilities).toEqual([]);
    expect(officeAuthority(initial, semi, 'head_of_state').capabilities).toEqual([...HEAD_OF_STATE_FUNCTIONS]);
    expect(officeAuthority(initial, semi, 'head_of_state').status).toBe('modelled');
    expect(officeAuthority(initial, semi, 'head_of_state').limitations.join(' ')).toMatch(/modelled split/);
    // A ceremonial head of state never gains a governing capability, appointed or not.
    const appointedMonarch = appoint(initial, parliamentary, 'head_of_state');
    expect(officeCaps(appointedMonarch.state, appointedMonarch.id)).toEqual([]);
    expect(hasGovernmentInformationAccess(appointedMonarch.state, appointedMonarch.id, parliamentary)).toBe(false);
    expect(hasPoliticalAuthority(appointedMonarch.state, appointedMonarch.id, parliamentary, 'sponsor_legislation')).toBe(false);
  });

  it('keeps a reconciled evidence-backed office on its evidence, not on the appointment model', () => {
    const countryId = countryWithSystem('presidential', id => Boolean(reconciledOffice(id, 'head_of_state')));
    const president = reconciledOffice(countryId, 'head_of_state')!;
    const authority = nationalExecutiveAuthority({ person: president, date: initial.date, registry: politicalRegistry });
    expect(authority.status).toBe('resolved');
    expect(authority.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    expect(authority.withheldCapabilities).toContain('vote_legislation');
    expect(hasGovernmentInformationAccess(initial, president.id, countryId)).toBe(true);
    expect(hasPoliticalAuthority(initial, president.id, countryId, 'sponsor_legislation')).toBe(true);
    expect(hasPoliticalAuthority(initial, president.id, countryId, 'vote_legislation')).toBe(false);
    const semi = countryWithSystem('semi_presidential', id => Boolean(reconciledOffice(id, 'head_of_state')));
    const semiHead = reconciledOffice(semi, 'head_of_state')!;
    const semiAuthority = nationalExecutiveAuthority({ person: semiHead, date: initial.date, registry: politicalRegistry });
    // The scenario-start evidence stays unresolved; the appointment model above does not overrule it.
    expect(semiAuthority.status).toBe('unresolved');
    expect(semiAuthority.capabilities).toEqual([]);
    expect(semiAuthority.withheldCapabilities).toEqual([...AUTHORITY_CAPABILITIES]);
    expect(hasPoliticalAuthority(initial, semiHead.id, semi, 'sponsor_legislation')).toBe(false);
  });

  it('refuses commands the office does not carry', () => {
    const parliamentary = countryWithSystem('parliamentary', countryId => Boolean(initial.fiscal.countries[countryId]?.annualBudget));
    const legislator = appoint(initial, parliamentary, 'legislator');
    const drafted = createFiscalProposal(legislator.state, {
      proposerPersonId: legislator.id, countryId: parliamentary, effectiveDate: '2026-02-01', payload: { annualBudget: proposedBudget(parliamentary) },
    });
    const proposalId = drafted.governance.proposalOrder.at(-1)!;
    expect(drafted.governance.proposals[proposalId].status).toBe('draft');
    expect(() => submitProposalForActor(drafted, proposalId, legislator.id)).toThrow(/authority/);
    const regionId = initial.politics.countries[parliamentary].regionIds[0];
    expect(() => proposeConstruction(legislator.state, {
      proposerPersonId: legislator.id, countryId: parliamentary, regionId, assetTypeId: 'type.road', title: 'Unauthorized construction', estimatedCostUsd: 1_000_000,
    })).toThrow(/lacks authority/);
    // The head of government carries the agenda but never the suffrage.
    const government = appoint(initial, parliamentary, 'head_of_government');
    expect(hasPoliticalAuthority(government.state, government.id, parliamentary, 'vote_legislation')).toBe(false);
    expect(hasPoliticalAuthority(government.state, government.id, parliamentary, 'sponsor_legislation')).toBe(true);
  });

  it('keeps the function competences when its holder is replaced', () => {
    const parliamentary = countryWithSystem('parliamentary');
    const first = appoint(initial, parliamentary, 'head_of_government');
    expect(officeCaps(first.state, first.id)).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    // A second appointment to the same function inherits the established competences.
    const second = appoint(first.state, parliamentary, 'head_of_government');
    expect(officeCaps(second.state, second.id)).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    // Transfer to another office changes the competences with the function, never with the person.
    const asLegislator = transferPoliticalOffice(second.state, second.id, { role: 'legislator', countryId: parliamentary });
    expect(officeCaps(asLegislator, second.id)).toEqual(['vote_legislation']);
    const backToGovernment = transferPoliticalOffice(asLegislator, second.id, { role: 'head_of_government', countryId: parliamentary });
    expect(officeCaps(backToGovernment, second.id)).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    // Losing office removes the competences; the person and party leadership are untouched.
    const revoked = revokePoliticalOffice(backToGovernment, second.id);
    expect(revoked.governance.persons[second.id].office).toBeUndefined();
    expect(hasPoliticalAuthority(revoked, second.id, parliamentary, 'sponsor_legislation')).toBe(false);
    const leaderWithoutOffice = Object.values(initial.governance.persons).find(person => person.isPartyLeader && !person.office)!;
    expect(hasPoliticalAuthority(initial, leaderWithoutOffice.id, leaderWithoutOffice.countryId, 'sponsor_legislation')).toBe(false);
    expect(hasGovernmentInformationAccess(initial, leaderWithoutOffice.id, leaderWithoutOffice.countryId)).toBe(false);
  });

  it('normalizes a superseded saved capability list without rewriting offices or history', () => {
    const presidential = countryWithSystem('presidential', id => Boolean(reconciledOffice(id, 'head_of_state')));
    const president = reconciledOffice(presidential, 'head_of_state')!;
    // A save written under the previous blanket scope: every capability, including the suffrage.
    const legacy: SimulationState = {
      ...initial,
      governance: {
        ...initial.governance,
        persons: { ...initial.governance.persons, [president.id]: { ...president, office: { ...president.office!, authorityProfile: { ...president.office!.authorityProfile, capabilities: [...AUTHORITY_CAPABILITIES] } } } },
      },
    };
    const restored = restoreSimulationState(serializeSimulationState(legacy), worldRegions, {}, {}, worldContext);
    const restoredPerson = restored.governance.persons[president.id];
    expect(restoredPerson.office!.authorityProfile.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    expect(restoredPerson.office!.role).toBe(president.office!.role);
    expect(restoredPerson.office!.title).toBe(president.office!.title);
    expect(restoredPerson.office!.evidence).toEqual(president.office!.evidence);
    expect(restoredPerson.displayName).toBe(president.displayName);
    expect(restored.governance.successions).toEqual(initial.governance.successions);
    expect(restored.governance.proposalOrder).toEqual(initial.governance.proposalOrder);
    expect(restored.governance.player).toEqual(initial.governance.player);
    // A role-derived appointment narrower than the function scope is never widened by a load.
    const appointed = appoint(initial, countryWithSystem('parliamentary'), 'head_of_government');
    const narrowed: SimulationState = {
      ...appointed.state,
      governance: {
        ...appointed.state.governance,
        persons: { ...appointed.state.governance.persons, [appointed.id]: { ...appointed.state.governance.persons[appointed.id], office: { ...appointed.state.governance.persons[appointed.id].office!, authorityProfile: { ...appointed.state.governance.persons[appointed.id].office!.authorityProfile, capabilities: ['sponsor_legislation'] } } } },
      },
    };
    expect(restoreSimulationState(serializeSimulationState(narrowed), worldRegions, {}, {}, worldContext).governance.persons[appointed.id].office!.authorityProfile.capabilities).toEqual(['sponsor_legislation']);
    // A legacy role-derived office carrying the whole set is narrowed to the function scope.
    const legacyHog: SimulationState = {
      ...appointed.state,
      governance: {
        ...appointed.state.governance,
        persons: { ...appointed.state.governance.persons, [appointed.id]: { ...appointed.state.governance.persons[appointed.id], office: { ...appointed.state.governance.persons[appointed.id].office!, authorityProfile: { ...appointed.state.governance.persons[appointed.id].office!.authorityProfile, capabilities: [...AUTHORITY_CAPABILITIES] } } } },
      },
    };
    expect(restoreSimulationState(serializeSimulationState(legacyHog), worldRegions, {}, {}, worldContext).governance.persons[appointed.id].office!.authorityProfile.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    // Idempotent.
    expect(reconcilePersistedOfficeCapabilities(restored)).toEqual(restored);
  });

  it('keeps both authorized starting routes consistent with the corrected capabilities', () => {
    const selectable = selectableStartingCountryIds(initial);
    const resolvedOfficials = Object.values(initial.governance.persons).filter(person =>
      nationalExecutiveAuthority({ person, date: initial.date, registry: politicalRegistry }).status === 'resolved');
    expect(resolvedOfficials.length).toBeGreaterThan(0);
    for (const person of resolvedOfficials) expect(selectable.has(person.countryId)).toBe(true);
    const nationalLeaderCountryId = Object.keys(politicalRegistry.countries).sort()
      .find(countryId => countryStartingOptions(initial, countryId).paths.national_leader.candidates.length > 0)!;
    const option = countryStartingOptions(initial, nationalLeaderCountryId).paths.national_leader.candidates[0];
    expect(option.office?.authorityStatus).toBe('resolved');
    expect(option.office?.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    expect(option.office?.capabilities).not.toContain('vote_legislation');
    expect(option.office?.withheldCapabilities).toContain('vote_legislation');
    expect(assertAuthorizedStartingPerson(initial, option.personId)).toContain('national_leader');
    for (const candidate of countryStartingOptions(initial, nationalLeaderCountryId).paths.opposition_party_leader.candidates) {
      expect(candidate.office?.capabilities ?? []).not.toContain('vote_legislation');
    }
  });
});
