import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { initializeNewGame } from '../initialization';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { GOVERNMENT_AGENDA_CAPABILITIES, nationalExecutiveAuthority, sourcedExecutiveSystem } from '../governance/officeEvidence';
import {
  POLITICAL_START_PATHS, assertAuthorizedStartingPerson, countryStartingOptions, resolvePartyGovernmentStatus,
  selectableStartingCountryIds, startSelectionContext, startingPathsForPerson, startingPersonCandidates,
  type PoliticalStartPath,
} from '../governance/selection';
import { replacePartyLeader, resolvePlayerHandoff, setControlledPerson } from '../governance/runtime';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

let initial: SimulationState;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

const sortedCountryIds = () => Object.keys(politicalRegistry.countries).sort();
const personsOf = (countryId: string) => Object.values(initial.governance.persons).filter(person => person.countryId === countryId);
const countryIdsWithSystem = (system: string) => sortedCountryIds().filter(countryId => sourcedExecutiveSystem(countryId) === system);
const firstCountryWithRoute = (path: PoliticalStartPath, predicate: (countryId: string) => boolean = () => true) =>
  sortedCountryIds().find(countryId => predicate(countryId) && countryStartingOptions(initial, countryId).paths[path].candidates.length > 0);
/** The registry with a single party's dated status replaced, to exercise contradictory evidence. */
const registryWithPartyStatus = (partyId: string, governmentStatus: 'government' | 'opposition' | 'unavailable'): PoliticalRegistry => ({
  ...politicalRegistry,
  parties: { ...politicalRegistry.parties, [partyId]: { ...politicalRegistry.parties[partyId], governmentStatus } },
});

describe('0.34 authorized political starting routes', () => {
  it('admits the leader of a party whose opposition status is established', () => {
    const countryId = firstCountryWithRoute('opposition_party_leader')!;
    expect(countryId).toBeDefined();
    const options = countryStartingOptions(initial, countryId);
    const candidate = options.paths.opposition_party_leader.candidates[0];
    expect(candidate.paths).toContain('opposition_party_leader');
    expect(candidate.partyStatus?.status).toBe('opposition');
    const person = initial.governance.persons[candidate.personId];
    expect(person.isPartyLeader).toBe(true);
    expect(person.status).toBe('active');
    expect(person.partyId).toBe(candidate.partyId);
    expect(politicalRegistry.parties[person.partyId!].countryId).toBe(countryId);
    // The route itself grants nothing: a leader without an office has no office and no capability.
    const authority = nationalExecutiveAuthority({ person, date: initial.date, registry: politicalRegistry });
    expect(authority.status).toBe('no_office');
    expect(authority.capabilities).toEqual([]);
    expect(candidate.office).toBeUndefined();
    expect(startingPathsForPerson(initial, person.id)).toContain('opposition_party_leader');
    expect(assertAuthorizedStartingPerson(initial, person.id)).toContain('opposition_party_leader');
    expect(resolvePartyGovernmentStatus(startSelectionContext(initial), countryId, person.partyId!))
      .toMatchObject({ status: 'opposition', basis: 'elections_coalition' });
  });

  it('never offers the leader of a governing party on the opposition route', () => {
    const context = startSelectionContext(initial);
    const governingLeader = Object.values(initial.governance.persons)
      .filter(person => person.isPartyLeader && person.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id))
      .find(person => resolvePartyGovernmentStatus(context, person.countryId, person.partyId!).status === 'government')!;
    expect(governingLeader).toBeDefined();
    const options = countryStartingOptions(initial, governingLeader.countryId);
    expect(options.paths.opposition_party_leader.candidates.some(candidate => candidate.personId === governingLeader.id)).toBe(false);
    expect(startingPersonCandidates(context, Object.values(initial.governance.persons), governingLeader.countryId, 'opposition_party_leader')).not.toContain(governingLeader);
    const reasons = options.paths.opposition_party_leader.unavailable.find(entry => entry.personId === governingLeader.id)?.reasons ?? [];
    expect(reasons.join(' ')).toMatch(/governing bloc/);
    // The party is listed with its real status, never as an opposition party.
    const party = options.parties.find(entry => entry.partyId === governingLeader.partyId)!;
    expect(party.status).toBe('government');
    expect(party.leaderPersonIds).toEqual([]);
  });

  it('never infers an opposition when the governing arrangement is unavailable or contradictory', () => {
    const countryId = sortedCountryIds().find(candidate => {
      const country = politicalRegistry.countries[candidate];
      const institution = politicalRegistry.institutions[country.institutionId];
      return country.partyIds.length > 0 && institution.governingPartyIds.length === 0 && sourcedExecutiveSystem(candidate) === 'presidential';
    })!;
    expect(countryId).toBeDefined();
    const partyId = politicalRegistry.countries[countryId].partyIds[0];
    expect(politicalRegistry.parties[partyId].governmentStatus).toBe('unavailable');
    const context = startSelectionContext(initial);
    const unavailable = resolvePartyGovernmentStatus(context, countryId, partyId);
    expect(unavailable).toMatchObject({ status: 'unavailable', basis: 'no_established_governing_bloc' });
    expect(unavailable.limitation).toMatch(/never inferred/);
    // Even a party-level 'opposition' label does not establish an opposition without a governing bloc.
    const optimistic = resolvePartyGovernmentStatus(startSelectionContext(initial, registryWithPartyStatus(partyId, 'opposition')), countryId, partyId);
    expect(optimistic.status).toBe('unavailable');
    expect(optimistic.basis).toBe('no_established_governing_bloc');
    // A party the registry calls opposition while the reconciled bloc includes it is contradictory, not
    // an opposition. The canonical dynamic coalition decides first; the static fallback layer must
    // never resolve a contradiction by picking one side.
    const governingCountryId = firstCountryWithRoute('opposition_party_leader')!;
    const governingPartyId = politicalRegistry.countries[governingCountryId].partyIds
      .find(id => politicalRegistry.parties[id].governmentStatus === 'government')!;
    const staticOnly: SimulationState = { ...initial, elections: { ...initial.elections, countries: {} } };
    const contradictory = resolvePartyGovernmentStatus(startSelectionContext(staticOnly, registryWithPartyStatus(governingPartyId, 'opposition')), governingCountryId, governingPartyId);
    expect(contradictory.status).toBe('unavailable');
    expect(contradictory.basis).toBe('contradictory_registry_evidence');
    // The Country keeps its national route but offers no invented opposition.
    const options = countryStartingOptions(initial, countryId);
    expect(options.paths.opposition_party_leader.candidates).toEqual([]);
    expect(options.unavailableReasons.join(' ')).toMatch(/never inferred from missing political data/);
  });

  it('admits the real executive officeholder as national leader in a presidential system', () => {
    const countryId = countryIdsWithSystem('presidential')
      .find(candidate => personsOf(candidate).some(person => person.office?.role === 'head_of_state' && person.office.evidence))!;
    expect(countryId).toBeDefined();
    const options = countryStartingOptions(initial, countryId);
    expect(options.paths.national_leader.candidates.length).toBeGreaterThan(0);
    for (const candidate of options.paths.national_leader.candidates) {
      expect(candidate.office?.authorityStatus).toBe('resolved');
      expect(candidate.office?.role).toBe('head_of_state');
      expect(candidate.office?.authorityBasis).toBe('sourced_presidential_head_of_state');
      // A resolved executive carries the government agenda only, never the parliamentary suffrage.
      expect(candidate.office?.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
      expect(candidate.office?.capabilities).not.toContain('vote_legislation');
      expect(candidate.office?.withheldCapabilities).toContain('vote_legislation');
      expect(candidate.office?.executiveSystem).toBe('presidential');
    }
    // A head of government of a presidential system is not the national executive authority.
    const presidencyGovernmentHead = personsOf(countryId).find(person => person.office?.role === 'head_of_government' && person.office.evidence);
    if (presidencyGovernmentHead) {
      expect(options.paths.national_leader.candidates.some(candidate => candidate.personId === presidencyGovernmentHead.id)).toBe(false);
      expect(nationalExecutiveAuthority({ person: presidencyGovernmentHead, date: initial.date, registry: politicalRegistry }).status).toBe('unresolved');
    }
  });

  it('admits the head of government — not the ceremonial head of state — in a parliamentary system', () => {
    const countryId = countryIdsWithSystem('parliamentary')
      .find(candidate => personsOf(candidate).some(person => person.office?.role === 'head_of_government' && person.office.evidence))!;
    expect(countryId).toBeDefined();
    const options = countryStartingOptions(initial, countryId);
    const headOfGovernment = personsOf(countryId).find(person => person.office?.role === 'head_of_government' && person.office.evidence)!;
    const candidate = options.paths.national_leader.candidates.find(entry => entry.personId === headOfGovernment.id)!;
    expect(candidate).toBeDefined();
    expect(candidate.office?.authorityBasis).toBe('sourced_parliamentary_head_of_government');
    expect(candidate.office?.capabilities).toEqual([...GOVERNMENT_AGENDA_CAPABILITIES]);
    const headOfState = personsOf(countryId).find(person => person.office?.role === 'head_of_state' && person.office.evidence);
    if (headOfState) expect(options.paths.national_leader.candidates.some(entry => entry.personId === headOfState.id)).toBe(false);
  });

  it('resolves neither office in a semi-presidential system and invents no shared authority', () => {
    const countryId = countryIdsWithSystem('semi_presidential')
      .find(candidate => personsOf(candidate).some(person => person.office?.role === 'head_of_state' && person.office.evidence)
        && personsOf(candidate).some(person => person.office?.role === 'head_of_government' && person.office.evidence))!;
    expect(countryId).toBeDefined();
    const offices = personsOf(countryId).filter(person => person.office?.evidence && ['head_of_state', 'head_of_government'].includes(person.office.role));
    const authorities = offices.map(person => nationalExecutiveAuthority({ person, date: initial.date, registry: politicalRegistry }));
    // Neither office is asserted as the executive: no arbitrary pick between president and prime minister.
    expect(authorities.every(authority => authority.status === 'unresolved')).toBe(true);
    expect(authorities.every(authority => authority.capabilities.length === 0)).toBe(true);
    expect(authorities.map(authority => authority.basis)).toEqual(authorities.map(() => 'institutional_authority_unresolved'));
    expect(authorities.some(authority => authority.limitations.join(' ').includes('semi presidential'))).toBe(true);
    const options = countryStartingOptions(initial, countryId);
    expect(options.paths.national_leader.candidates).toEqual([]);
    expect(options.unavailableReasons.join(' ')).toMatch(/resolved national executive authority/);
  });

  it('never turns a symbolic or ceremonial head of state into an executive', () => {
    const countryId = countryIdsWithSystem('monarchy_parliamentary')
      .find(candidate => personsOf(candidate).some(person => person.office?.role === 'head_of_state' && person.office.evidence))!;
    expect(countryId).toBeDefined();
    const monarch = personsOf(countryId).find(person => person.office?.role === 'head_of_state' && person.office.evidence)!;
    const authority = nationalExecutiveAuthority({ person: monarch, date: initial.date, registry: politicalRegistry });
    expect(monarch.office!.authorityProfile.capabilities.length).toBe(0);
    expect(authority).toMatchObject({ status: 'unresolved', capabilities: [] });
    expect(authority.limitations.join(' ')).toMatch(/No capabilities are inferred/);
    expect(countryStartingOptions(initial, countryId).paths.national_leader.candidates.some(candidate => candidate.personId === monarch.id)).toBe(false);
    expect(startingPathsForPerson(initial, monarch.id)).not.toContain('national_leader');
  });

  it('keeps one identity for a person who both leads a party and holds an office', () => {
    const context = startSelectionContext(initial);
    const combined = Object.values(initial.governance.persons)
      .filter(person => person.isPartyLeader && person.office?.evidence && person.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id))
      .find(person => nationalExecutiveAuthority({ person, date: initial.date, registry: politicalRegistry }).status === 'resolved')!;
    expect(combined).toBeDefined();
    const options = countryStartingOptions(initial, combined.countryId);
    const option = options.paths.national_leader.candidates.find(candidate => candidate.personId === combined.id)!;
    expect(option).toBeDefined();
    expect(option.displayName).toBe(combined.displayName);
    expect(option.partyId).toBe(combined.partyId);
    expect(option.isPartyLeader).toBe(true);
    // Capabilities come from the office, never from party leadership.
    expect(option.office?.capabilities).toEqual([...combined.office!.authorityProfile.capabilities].sort());
    expect(option.office?.capabilities.length).toBe(GOVERNMENT_AGENDA_CAPABILITIES.length);
    const partyStatus = resolvePartyGovernmentStatus(context, combined.countryId, combined.partyId!);
    expect(option.paths).toEqual(partyStatus.status === 'opposition' ? ['national_leader', 'opposition_party_leader'] : ['national_leader']);
    expect(assertAuthorizedStartingPerson(initial, combined.id)).toEqual(option.paths);
    for (const path of option.paths) {
      expect(startingPersonCandidates(context, Object.values(initial.governance.persons), combined.countryId, path)).toContain(combined);
    }
    const oppositionOption = options.paths.opposition_party_leader.candidates.find(candidate => candidate.personId === combined.id);
    if (partyStatus.status === 'opposition') expect(oppositionOption?.partyStatus?.status).toBe('opposition');
    else expect(oppositionOption).toBeUndefined();
  });

  it('refuses an inactive person or an unreconciled office as a starting route', () => {
    const countryId = firstCountryWithRoute('national_leader')!;
    const person = countryStartingOptions(initial, countryId).paths.national_leader.candidates[0];
    const active = initial.governance.persons[person.personId];
    const inactive: SimulationState = { ...initial, governance: { ...initial.governance, persons: { ...initial.governance.persons, [active.id]: { ...active, status: 'inactive', office: undefined } } } };
    expect(startingPathsForPerson(inactive, active.id)).toEqual([]);
    expect(() => assertAuthorizedStartingPerson(inactive, active.id)).toThrow(/not an authorized new-game starting route/);
    // An office assigned by gameplay carries no reconciled institutional provenance: the identity is
    // not a resolved authority, and no capability is derived from it for a start.
    const unreconciled = { ...active, office: { ...active.office!, evidence: undefined } };
    expect(nationalExecutiveAuthority({ person: unreconciled, date: initial.date, registry: politicalRegistry }).status).toBe('unresolved');
    const unreconciledState: SimulationState = { ...initial, governance: { ...initial.governance, persons: { ...initial.governance.persons, [active.id]: unreconciled } } };
    expect(startingPathsForPerson(unreconciledState, active.id)).not.toContain('national_leader');
  });

  it('refuses an unauthorized new-game selection while leaving player control itself untouched', () => {
    const context = startSelectionContext(initial);
    const outsider = Object.values(initial.governance.persons)
      .filter(person => person.status === 'active' && !person.office)
      .sort((a, b) => a.id.localeCompare(b.id))
      .find(person => !person.isPartyLeader || resolvePartyGovernmentStatus(context, person.countryId, person.partyId!).status !== 'opposition')!;
    expect(outsider).toBeDefined();
    expect(startingPathsForPerson(initial, outsider.id)).toEqual([]);
    expect(() => assertAuthorizedStartingPerson(initial, outsider.id)).toThrow(/not an authorized new-game starting route/);
    expect(() => assertAuthorizedStartingPerson(initial, 'person.99999999')).toThrow(/Unknown political person/);
    // The guard is scoped to the new-game entry point: canonical player control is unchanged, so
    // succession, handoff and historical saves keep working for people outside the start routes.
    expect(setControlledPerson(initial, outsider.id).governance.player.controlledPersonId).toBe(outsider.id);
    expect(setControlledPerson(initial).governance.player.controlledPersonId).toBeUndefined();
  });

  it('keeps existing saves and political succession unchanged', () => {
    const restored = restoreSimulationState(serializeSimulationState(initial, worldContext), worldRegions, {}, {}, worldContext);
    const countryId = firstCountryWithRoute('opposition_party_leader')!;
    const before = countryStartingOptions(initial, countryId), after = countryStartingOptions(restored, countryId);
    expect(after.paths.national_leader.candidates.map(candidate => candidate.personId)).toEqual(before.paths.national_leader.candidates.map(candidate => candidate.personId));
    expect(after.paths.opposition_party_leader.candidates.map(candidate => candidate.personId)).toEqual(before.paths.opposition_party_leader.candidates.map(candidate => candidate.personId));
    expect(selectableStartingCountryIds(restored)).toEqual(selectableStartingCountryIds(initial));
    // Succession transfers player control to a successor who may not be a starting route at all.
    const leader = initial.governance.persons[after.paths.opposition_party_leader.candidates[0].personId];
    const succeeded = replacePartyLeader(setControlledPerson(restored, leader.id), leader.partyId!);
    const succession = succeeded.governance.successions[succeeded.governance.successionOrder.at(-1)!];
    expect(succession.previousPersonId).toBe(leader.id);
    const switched = resolvePlayerHandoff(succeeded, succession.id, 'switch');
    expect(switched.governance.player.controlledPersonId).toBe(succession.newPersonId);
    expect(switched.governance.persons[succession.newPersonId].partyId).toBe(leader.partyId);
  });

  it('produces deterministic candidate lists independent of insertion order', () => {
    const countryId = firstCountryWithRoute('national_leader', candidate => countryStartingOptions(initial, candidate).paths.opposition_party_leader.candidates.length > 0)
      ?? firstCountryWithRoute('national_leader')!;
    const reversed: SimulationState = { ...initial, governance: { ...initial.governance, persons: Object.fromEntries(Object.entries(initial.governance.persons).reverse()) } };
    for (const path of POLITICAL_START_PATHS) {
      const forward = countryStartingOptions(initial, countryId).paths[path].candidates.map(candidate => candidate.personId);
      const backward = countryStartingOptions(reversed, countryId).paths[path].candidates.map(candidate => candidate.personId);
      expect(backward).toEqual(forward);
      expect(countryStartingOptions(initial, countryId).paths[path].candidates.map(candidate => candidate.personId)).toEqual(forward);
    }
    expect([...selectableStartingCountryIds(reversed)].sort()).toEqual([...selectableStartingCountryIds(initial)].sort());
    const context = startSelectionContext(initial);
    const persons = Object.values(initial.governance.persons);
    expect(startingPersonCandidates(context, [...persons].reverse(), countryId, 'national_leader').map(person => person.id))
      .toEqual(startingPersonCandidates(context, persons, countryId, 'national_leader').map(person => person.id));
  });
});
