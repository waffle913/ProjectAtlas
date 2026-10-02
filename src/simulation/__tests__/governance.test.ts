/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { advanceSimulationDays } from '../engine';
import { requestFidelityTransition, applyPendingFidelityTransitions } from '../fidelity';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { governanceInvariant } from '../governance/invariants';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { assignPoliticalOffice, capabilitiesForReconciledAuthority, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, estimatePublicSupport, initializePartyLeaders, inspectGovernance, inspectPlayer, inspectProposalSupport, replaceDraftProposal, replacePartyLeader, resolvePlayerHandoff, resolveProposalVote, revokePoliticalOffice, setControlledPerson, setPartyLeadership, setPartyMembership, submitProposal, withdrawProposal } from '../governance/runtime';
import { initializeNewGame } from '../initialization';
import { emptyInformation } from '../information/model';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { simulationDelta } from '../world';
import { analyzeProposal, derivePartyGoalProfile, evaluatePartyProposal, GOVERNANCE_VOTE_THRESHOLDS } from '../governance/analysis';
import type { GovernanceGoal, PartyGoalProfile } from '../governance/model';
import type { FiscalProposalPayload } from '../governance/model';
import type { TaxKind, TaxRule } from '../fiscal/model';
import { evaluateImmediateFiscalPolicyCounterfactual, scheduleFiscalReform } from '../fiscal/runtime';
import { COHORT } from '../politics/model';
import politicalOffices from '../../data/political-offices.json';
import { StartGame } from '../../components/StartGame';

const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
let initial: SimulationState;
beforeAll(() => { initial = fullWorld(); }, 30_000);

const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
  const institution = politicalRegistry.institutions[country.institutionId];
  return institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats);
}).map(country => country.countryId).sort();

function playerFor(state: SimulationState, countryId: string, name = 'Player Person') {
  let next = createPoliticalPerson(state, { displayName: name, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  next = setControlledPerson(next, id);
  next = assignPoliticalOffice(next, id, { role: 'head_of_government', countryId });
  return { state: next, id };
}

function budgetProposal(state: SimulationState, personId: string, countryId: string, factor: 2 | 0) {
  const current = state.fiscal.countries[countryId].annualBudget;
  return createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: factor ? current.infrastructure * factor : 0 } } });
}

const resolvableCountry = () => completeCountryIds().find(id => politicalRegistry.countries[id].partyIds.length && initial.fiscal.countries[id].annualBudget.incomeSupport > 0 && initial.fiscal.countries[id].annualBudget.infrastructure > 0)!;
function draft(state: SimulationState, personId: string, countryId: string, payload: FiscalProposalPayload, effectiveDate = '2026-02-01') {
  const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate, payload });
  return { state: next, proposal: next.governance.proposals[next.governance.proposalOrder.at(-1)!] };
}
function modelled(rule: TaxRule): TaxRule { return { ...structuredClone(rule), status: 'modelled', source: 'explicit governance test evidence', document: 'synthetic fixture', limitations: 'Test-only causal fixture.' }; }
function countryWithRule(kind: TaxKind, present: boolean) { return worldCountryIds.find(id => Boolean(initial.fiscal.countries[id].policy[kind]) === present)!; }
function taxDraft(kind: TaxKind, mutate: (rule: TaxRule) => void, present = true) {
  const countryId = countryWithRule(kind, present), player = playerFor(initial, countryId), policy = structuredClone(player.state.fiscal.countries[countryId].policy);
  if (present) { const rule = modelled(policy[kind]!); mutate(rule); policy[kind] = rule; }
  else { const rule: TaxRule = { id: `test.${countryId}.${kind}`, countryId, kind, status: 'modelled', scope: 'national', currency: 'USD', unit: 'annual USD and basis points', effectiveDate: '2026-02-01', referenceDate: '2026-02-01', retrievedAt: '2026-01-01', source: 'explicit governance test evidence', document: 'synthetic fixture', limitations: 'Unknown production baseline retained as unavailable.', ...(kind === 'payroll' ? { employee: [{ rateBps: 2_000 }], employer: [{ rateBps: 2_000 }] } : kind === 'personal' ? { allowance: 1_000, bands: [{ lower: 0, rateBps: 2_000 }] } : { rateBps: 2_000 }) }; policy[kind] = rule; }
  const made = draft(player.state, player.id, countryId, { policy }); return { ...made, countryId, personId: player.id };
}
function profile(partyId: string, overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>>): PartyGoalProfile {
  return derivePartyGoalProfile(politicalRegistry.parties[partyId], overrides);
}

function schema12Base() {
  const legacy = structuredClone(initial) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 12;
  delete legacy.information;
  legacy.information = emptyInformation('2026-01-01');
  legacy.governance = { version: 'governance-0.14-v1', initializedOn: '2026-01-01', player: {}, persons: {}, proposals: {}, proposalOrder: [], nextPersonSequence: 0, nextProposalSequence: 0 };
  return legacy as unknown as SimulationState;
}

/** Exact aggregate-only persistence boundary used by d2f3ce; never calls the current vote resolver. */
function d2LegacyResolved(mode: 'enacted' | 'rejected' | 'all_abstain') {
  const countryId = resolvableCountry(), player = playerFor(schema12Base(), countryId); let state = budgetProposal(player.state, player.id, countryId, 2), proposalId = state.governance.proposalOrder[0]; state = submitProposal(state, proposalId);
  state = { ...state, fiscal: { ...state.fiscal, reforms: state.fiscal.reforms.map(reform => ({ ...reform })), reformReceipts: [...state.fiscal.reformReceipts] } };
  const proposal = state.governance.proposals[proposalId], institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId];
  const chambers = institution.chambers.map(chamber => {
    const totalSeats = chamber.totalSeats!;
    return { chamberId: chamber.id, yesSeats: mode === 'enacted' ? totalSeats : 0, noSeats: mode === 'rejected' ? totalSeats : 0, abstainSeats: mode === 'all_abstain' ? totalSeats : 0, unavailableSeats: 0, totalSeats, coverage: 'complete' as const, adopted: mode === 'enacted' };
  });
  const sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((total, chamber) => total + chamber[field], 0), totalSeats = chambers.reduce((total, chamber) => total + chamber.totalSeats, 0);
  const parliamentaryEstimate = { yesSeats: sum('yesSeats'), noSeats: sum('noSeats'), abstainSeats: sum('abstainSeats'), unavailableSeats: 0, totalSeats, chambers, coverage: 'complete' as const, confidenceBps: mode === 'all_abstain' ? 500 : 8_000, procedure: 'modelled_procedure_v1' as const };
  const publicEstimate = { supportBps: mode === 'enacted' ? 7_000 : 2_000, opposeBps: mode === 'enacted' ? 2_000 : 7_000, neutralBps: 1_000, coverage: 'complete' as const, representedPersons: 1_000_000, drivers: [] };
  const enacted = mode === 'enacted', outcome = enacted ? 'adopted' as const : 'rejected' as const, sequence = enacted ? state.fiscal.nextSequence : undefined;
  if (enacted) state = scheduleFiscalReform(state, { countryId, effectiveDate: proposal.effectiveDate, ...structuredClone(proposal.payload) });
  state.governance.proposals[proposalId] = { ...proposal, status: enacted ? 'enacted' : 'rejected', resolvedOn: state.date, publicEstimate, parliamentaryEstimate, voteResult: { ...parliamentaryEstimate, outcome, resolvedOn: state.date }, scheduledFiscalReformSequence: sequence } as unknown as typeof proposal;
  expect(state.governance.proposals[proposalId].analysis).toBeUndefined(); expect(state.governance.proposals[proposalId].evaluationVersion).toBeUndefined(); expect(state.governance.proposals[proposalId].enactmentReference).toBeUndefined();
  expect(state.fiscal.reforms.every(reform => reform.origin === undefined)).toBe(true); expect(state.fiscal.reformReceipts).toEqual([]); delete (state.fiscal as Partial<typeof state.fiscal>).reformReceipts;
  const legacy = structuredClone(state) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 12;
  delete legacy.information;
  const oldGovernance = legacy.governance as Record<string, unknown>;
  delete oldGovernance.leadersInitializedOn;
  delete oldGovernance.successions;
  delete oldGovernance.successionOrder;
  delete oldGovernance.nextSuccessionSequence;
  return { state: legacy as unknown as SimulationState, proposalId, countryId, sequence };
}

function findResolvable(adopted: boolean) {
  for (const countryId of completeCountryIds()) {
    const player = playerFor(initial, countryId), candidates = [budgetProposal(player.state, player.id, countryId, 2)];
    for (const state of candidates) {
      const proposal = state.governance.proposals[state.governance.proposalOrder.at(-1)!], registry = structuredClone(politicalRegistry) as PoliticalRegistry;
      const analysis = inspectProposalSupport(state, proposal.id).analysis, profiles: Record<string, PartyGoalProfile> = {};
      for (const partyId of registry.countries[countryId].partyIds) {
        const overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>> = {};
        for (const [goal, direction] of Object.entries(analysis.issueEffects) as Array<[GovernanceGoal, number]>) if (direction) overrides[goal] = { idealPointBps: direction > 0 === adopted ? 10_000 : 0, importanceBps: 10_000, compromiseToleranceBps: adopted ? 10_000 : 0, confidenceBps: 10_000, status: 'sourced_or_partial_prior' };
        profiles[partyId] = derivePartyGoalProfile(registry.parties[partyId], overrides);
      }
      const estimate = estimateParliamentarySupport(state, proposal, registry, profiles);
      if (estimate.coverage === 'complete' && estimate.chambers.every(chamber => Boolean(chamber.adopted) === adopted)) return { state, personId: player.id, proposalId: proposal.id, countryId, registry, profiles };
    }
  }
  throw new Error(`No ${adopted ? 'adopted' : 'rejected'} deterministic fixture in current registry.`);
}

describe('governance 0.14 player and political decisions', () => {
  it('initializes party leaders and materializes sourced executives independently of party-leadership coverage', () => {
    expect(initial).toMatchObject({ schemaVersion: 13, governance: { version: 'governance-0.14-v1', initializedOn: '2026-01-01', player: {}, proposals: {}, proposalOrder: [], nextProposalSequence: 0, leadersInitializedOn: '2026-01-01' } });
    expect(Object.values(initial.governance.persons).filter(person => person.isPartyLeader && person.status === 'active')).toHaveLength(Object.keys(politicalRegistry.parties).length);
    const offices = new Map(politicalOffices.offices.map(office => [office.id, office]));
    const eligible = politicalOffices.officeholders.filter(record => {
      const definition = offices.get(record.officeId);
      return record.status === 'available' && record.referenceDate === initial.date && record.person?.id
        && (!record.startDate || record.startDate <= initial.date) && definition && ['head_of_government', 'head_of_state'].includes(definition.kind);
    });
    const keys = new Set(eligible.map(record => `${offices.get(record.officeId)!.countryId}:${record.person!.id}`));
    const materialized = Object.values(initial.governance.persons).filter(person => person.office?.evidence);
    expect(materialized).toHaveLength(keys.size);
    expect(materialized.length).toBeGreaterThan(300);
    expect(materialized.filter(person => person.isPartyLeader)).toHaveLength(3);
    for (const person of materialized) {
      const evidence = person.office!.evidence!;
      expect(keys.has(`${person.countryId}:${evidence.sourcePersonId}`)).toBe(true);
      expect(person.displayName).not.toBe(eligible.find(record => record.person!.id === evidence.sourcePersonId)!.person!.name);
      if (!person.isPartyLeader) expect(person.partyId).toBeUndefined();
      if (evidence.authorityBasis === 'institutional_authority_unresolved') expect(person.office!.authorityProfile.capabilities).toEqual([]);
    }
    console.info(`EXECUTIVE_OFFICEHOLDER_AUDIT ${JSON.stringify({
      availableRecords: eligible.length, materializedPersons: materialized.length,
      reusedPartyLeaders: materialized.filter(person => person.isPartyLeader).length,
      standalonePersons: materialized.filter(person => !person.isPartyLeader).length,
      authorityResolved: materialized.filter(person => person.office!.authorityProfile.capabilities.length > 0).length,
      authorityUnresolved: materialized.filter(person => person.office!.authorityProfile.capabilities.length === 0).length,
    })}`);
    expect(assertSimulationInvariants(initial, worldContext, 'save')).toBe(true);
  });

  it('creates stable sequence IDs independent of display names', () => {
    const countryId = worldCountryIds[0], a = createPoliticalPerson(initial, { displayName: 'Alpha', countryId }), b = createPoliticalPerson(initial, { displayName: 'Beta', countryId });
    const newId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    expect(a.governance.persons[newId]).toMatchObject({ displayName: 'Alpha', countryId, isPartyLeader: false });
    expect(b.governance.persons[newId]).toMatchObject({ displayName: 'Beta', countryId, isPartyLeader: false });
  });

  it('generates identical party leaders regardless of registry insertion order', () => {
    const reordered = structuredClone(politicalRegistry);
    reordered.parties = Object.fromEntries(Object.entries(reordered.parties).reverse());
    const first = initializePartyLeaders(worldBase(), politicalRegistry), second = initializePartyLeaders(worldBase(), reordered);
    expect(second.governance.persons).toEqual(first.governance.persons);
    const leaders = Object.values(first.governance.persons).filter(person => person.isPartyLeader);
    expect(leaders).toHaveLength(Object.keys(politicalRegistry.parties).length);
    const sourceDerivedLeaders = leaders.filter(person => person.leaderProvenance?.basis === 'derived_analogue');
    expect(sourceDerivedLeaders).toHaveLength(7);
    expect(leaders.filter(person => person.leaderProvenance?.sourceLeaderStatus === 'ambiguous')).toHaveLength(1);
    expect(leaders.filter(person => person.leaderProvenance?.basis === 'modelled_fallback')).toHaveLength(leaders.length - 7);
    expect(new Set(leaders.map(person => person.displayName)).size).toBe(leaders.length);
    expect(sourceDerivedLeaders.every(person => person.displayName !== person.leaderProvenance?.sourceLeader?.name && person.leaderProvenance?.sourceLeader?.sourceRole)).toBe(true);
    const canadianAliases = new Map(sourceDerivedLeaders.filter(person => person.countryId === 'country.1aj872z').map(person => [person.leaderProvenance!.sourceLeader!.name, person.displayName]));
    expect(canadianAliases).toEqual(new Map([
      ['Yves-François Blanchet', 'Yves-François Blancheval'],
      ['Don Davies', 'Don Davison'],
      ['Pierre Poilievre', 'Pierre Poilapin'],
    ]));
    const reconciledOffices = leaders.filter(person => person.office?.evidence);
    expect(reconciledOffices).toHaveLength(3);
    expect(reconciledOffices.some(person => person.office?.title === 'Federal Chancellor')).toBe(true);
    expect(reconciledOffices.some(person => person.office?.title === 'Prime Minister')).toBe(true);
  });

  it('renders fictional Canadian party leaders and never exposes their source names in the start flow', () => {
    const state = initializePartyLeaders(worldBase());
    const canadianLeaders = Object.values(state.governance.persons).filter(person => person.countryId === 'country.1aj872z' && person.isPartyLeader);
    const markup = renderToStaticMarkup(createElement(StartGame, {
      countries: [{ id: 'country.1aj872z', commonName: 'Canada' }],
      leaders: canadianLeaders,
      onPlay: () => undefined,
    }));
    expect(markup).toContain('Yves-François Blancheval');
    expect(markup).toContain('Fictional gameplay analogue based on reviewed party-leadership evidence');
    expect(markup).not.toContain('Yves-François Blanchet');
    expect(markup).not.toContain('Pierre Poilievre');
    expect(markup).not.toContain('Don Davies');
  });

  it('preserves schema-13 persisted identity/provenance even when it differs from current mappings', () => {
    const started = advanceSimulationDays(initial, 5);
    const legacy = structuredClone(started) as SimulationState;
    const republican = Object.values(legacy.governance.persons).find(person => person.partyId === 'party:country.u6myyj:90c6a09fd8f4' && person.isPartyLeader)!;
    legacy.governance.persons[republican.id] = {
      ...republican,
      displayName: 'Reviewed historical fictional chair',
      leaderProvenance: {
        ...republican.leaderProvenance!,
        method: 'reviewed_party_leadership_evidence_v1',
        sourceLeader: { id: 'wikidata:Q124450754', name: 'Historical fixture source chair', sourceRole: 'party_chairperson', sourceRecordIds: ['archived-test-mapping-v1'] },
      },
    };
    const unsupported = Object.values(legacy.governance.persons).find(person => person.partyId === 'party:country.zwicjl:0fb2b6a211ca' && person.isPartyLeader)!;
    legacy.governance.persons[unsupported.id] = {
      ...unsupported,
      displayName: 'Reviewed historical fictional leader',
      leaderProvenance: {
        ...unsupported.leaderProvenance!,
        basis: 'derived_analogue',
        method: 'reviewed_global_party_chair_snapshot_v1',
        sourceLeaderStatus: 'derived',
        sourceLeader: { id: 'wikidata:Q21592171', name: 'Historical fixture source leader', sourceRecordIds: ['archived-test-mapping-v1'] },
      },
    };
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.schemaVersion).toBe(13);
    expect(restored.date).toBe(started.date);
    expect(restored.engine.tick).toBe(started.engine.tick);
    expect(restored.engine.seed).toBe(started.engine.seed);
    expect(restored.fiscal).toEqual(started.fiscal);
    expect(restored).toEqual(legacy);
    expect(restored.governance.persons[republican.id]).toEqual(legacy.governance.persons[republican.id]);
    expect(restored.governance.persons[unsupported.id]).toEqual(legacy.governance.persons[unsupported.id]);
  }, 30_000);

  it('does not rematerialize or rename scenario-date schema-13 persons on reload', () => {
    const archived = structuredClone(initial);
    const executive = Object.values(archived.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    executive.displayName = 'Archived reviewed fictional chancellor';
    archived.governance.player.controlledPersonId = executive.id;
    const restored = restoreSimulationState(serializeSimulationState(archived, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(archived);
    const invalid = structuredClone(archived);
    invalid.governance.persons[executive.id].displayName = executive.leaderProvenance!.sourceLeader!.name;
    expect(() => restoreSimulationState(JSON.stringify(invalid), worldRegions, {}, {}, worldContext)).toThrow(/Invalid party leader provenance/);
  }, 30_000);

  it('rejects incompatible schema-13 static registries instead of rebuilding political history', () => {
    const archived = structuredClone(initial);
    Object.assign(archived.politics, { registryVersion: 'future-or-incompatible-registry' });
    expect(() => restoreSimulationState(JSON.stringify(archived), worldRegions, {}, {}, worldContext)).toThrow(/explicit versioned migration/);
  });

  it('retains exact reviewed leader provenance, fictional names, and one-person office reconciliation through save reload', () => {
    const state = initializePartyLeaders(worldBase());
    const chancellor = Object.values(state.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    expect(chancellor).toMatchObject({
      displayName: 'Friedrich Merzen',
      isPartyLeader: true,
      leaderProvenance: {
        basis: 'derived_analogue',
        sourceLeaderStatus: 'derived',
        sourceLeader: { id: 'wikidata:Q566257', name: 'Friedrich Merz' },
      },
      office: {
        role: 'head_of_government',
        title: 'Federal Chancellor',
        evidence: { status: 'source_reconciled', sourcePersonId: 'wikidata:Q566257', effectiveFrom: '2025-05-06' },
      },
    });
    expect(Object.values(state.governance.persons).filter(person =>
      person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257'
      || person.office?.evidence?.sourcePersonId === 'wikidata:Q566257',
    )).toHaveLength(1);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.persons[chancellor.id]).toEqual(chancellor);
  });

  it('starts a verified government leader with executive authority but leaves opposition leaders without it', () => {
    const state = initializePartyLeaders(worldBase());
    const governmentParty = politicalRegistry.parties['party:country.sxojze:08a93106ca5f'];
    const oppositionParty = politicalRegistry.parties['party:country.sxojze:6244f2d93a49'];
    const governmentLeader = Object.values(state.governance.persons).find(person => person.partyId === governmentParty.id && person.isPartyLeader)!;
    const oppositionLeader = Object.values(state.governance.persons).find(person => person.partyId === oppositionParty.id && person.isPartyLeader)!;
    expect(governmentParty.governmentStatus).toBe('government');
    expect(governmentLeader.office?.evidence?.authorityBasis).toBe('sourced_parliamentary_head_of_government');
    expect(governmentLeader.office?.authorityProfile.capabilities).toContain('access_government_information');
    expect(governmentLeader.office?.authorityProfile.capabilities).toContain('sponsor_fiscal_reform');
    expect(oppositionParty.governmentStatus).toBe('opposition');
    expect(oppositionLeader.office).toBeUndefined();
    expect(oppositionLeader.leaderProvenance?.basis).toBe('modelled_fallback');
    expect(oppositionLeader.leaderProvenance?.sourceLeaderStatus).toBe('unavailable');
  });

  it('derives presidential executive authority only from resolved institutional evidence', () => {
    const makeReconciledHeadOfState = (requirePresidential: boolean) => {
      const offices = new Map(politicalOffices.offices.map(office => [office.id, office]));
      const record = politicalOffices.officeholders.find(item => {
        const office = offices.get(item.officeId);
        const institution = office && politicalRegistry.institutions[politicalRegistry.countries[office.countryId]?.institutionId];
        return item.status === 'available'
          && item.referenceDate === politicalOffices.referenceDate
          && item.person?.id.startsWith('wikidata:')
          && office?.kind === 'head_of_state'
          && (requirePresidential
            ? institution?.executiveSystemStatus === 'sourced' && institution.executiveSystem === 'presidential'
            : institution?.executiveSystemStatus !== 'sourced' || institution.executiveSystem !== 'presidential');
      });
      expect(record).toBeDefined();
      const sourceOffice = offices.get(record!.officeId)!;
      const authorityBasis = requirePresidential
        ? 'sourced_presidential_head_of_state' as const
        : 'institutional_authority_unresolved' as const;
      const withoutSourcePerson = { ...initial, governance: { ...initial.governance, persons: Object.fromEntries(Object.entries(initial.governance.persons).filter(([, person]) => person.office?.evidence?.sourcePersonId !== record!.person!.id || person.countryId !== sourceOffice.countryId)) } };
      const created = createPoliticalPerson(withoutSourcePerson, { displayName: `Test ${record!.person!.name}`, countryId: sourceOffice.countryId });
      const id = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
      const capabilities = capabilitiesForReconciledAuthority(authorityBasis);
      const state = {
        ...created,
        governance: {
          ...created.governance,
          persons: {
            ...created.governance.persons,
            [id]: {
              ...created.governance.persons[id],
              office: {
                role: 'head_of_state' as const,
                countryId: sourceOffice.countryId,
                title: sourceOffice.title,
                appointedOn: initial.date,
                evidence: {
                  status: 'source_reconciled' as const,
                  sourceOfficeId: sourceOffice.id,
                  sourceOfficeIds: [sourceOffice.id],
                  sourcePersonId: record!.person!.id,
                  referenceDate: politicalOffices.referenceDate,
                  effectiveFrom: record!.startDate,
                  sourceRecordIds: [record!.source.datasetId],
                  authorityBasis,
                },
                authorityProfile: {
                  status: 'modelled_constitutional_abstraction' as const,
                  capabilities,
                  limitation: 'Tested source-reconciled authority basis.',
                },
              },
            },
          },
        },
      };
      return { state, id, capabilities };
    };
    const presidential = makeReconciledHeadOfState(true);
    expect(presidential.capabilities).toEqual([
      'sponsor_legislation',
      'sponsor_fiscal_reform',
      'sponsor_budget_reform',
      'vote_legislation',
      'access_government_information',
    ]);
    expect(governanceInvariant.check(presidential.state, worldContext, 'save')).toEqual([]);

    const unresolved = makeReconciledHeadOfState(false);
    expect(unresolved.capabilities).toEqual([]);
    expect(governanceInvariant.check(unresolved.state, worldContext, 'save')).toEqual([]);
    const invalid = structuredClone(unresolved.state);
    invalid.governance.persons[unresolved.id].office!.evidence!.authorityBasis = 'sourced_presidential_head_of_state';
    invalid.governance.persons[unresolved.id].office!.authorityProfile.capabilities = capabilitiesForReconciledAuthority('sourced_presidential_head_of_state');
    expect(governanceInvariant.check(invalid, worldContext, 'save').join(' ')).toContain('capabilities inconsistent with its institutional evidence');
  });

  it('preserves the former leader, office and player control until an explicit handoff choice', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    let state = createPoliticalPerson(initial, { displayName: 'Eligible party member', countryId: leader.countryId });
    const memberId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    state = setPartyMembership(state, memberId, leader.partyId);
    state = assignPoliticalOffice(state, leader.id, { role: 'head_of_state', countryId: leader.countryId });
    state = setControlledPerson(state, leader.id);
    const replaced = replacePartyLeader(state, leader.partyId!, memberId);
    const successionId = replaced.governance.successionOrder.at(-1)!;
    expect(replaced.governance.successions[successionId].playerHandoff?.status).toBe('pending');
    expect(replaced.governance.persons[leader.id]).toMatchObject({ isPartyLeader: false, office: expect.any(Object) });
    expect(replaced.governance.player.controlledPersonId).toBe(leader.id);
    const continued = resolvePlayerHandoff(replaced, successionId, 'continue');
    expect(continued.governance.player.controlledPersonId).toBe(leader.id);
    expect(() => resolvePlayerHandoff(continued, successionId, 'switch')).toThrow(/no pending/);
    const switched = resolvePlayerHandoff(replaced, successionId, 'switch');
    expect(switched.governance.player.controlledPersonId).toBe(memberId);
    expect(switched.governance.persons[leader.id]).toBeDefined();
  });

  it('creates a deterministic bounded-profile successor and persists explicit player transfer', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    const start = setControlledPerson(initial, leader.id);
    const first = replacePartyLeader(start, leader.partyId!);
    const second = replacePartyLeader(start, leader.partyId!);
    const successionId = first.governance.successionOrder.at(-1)!;
    const successor = first.governance.persons[first.governance.successions[successionId].newPersonId];
    expect(successor).toEqual(second.governance.persons[second.governance.successions[successionId].newPersonId]);
    expect(successor).toMatchObject({ isPartyLeader: true, partyId: leader.partyId, leaderProvenance: { method: 'bounded_party_platform_succession_v2', basis: 'modelled_fallback', sourceLeaderStatus: 'unavailable' } });
    expect(Object.values(successor.leaderProfile!).every(item => item.valueBps >= 0 && item.valueBps <= 10_000)).toBe(true);
    const switched = resolvePlayerHandoff(first, successionId, 'switch');
    const restored = restoreSimulationState(serializeSimulationState(switched, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(switched);
    expect(restored.governance.player.controlledPersonId).toBe(successor.id);
  });

  it('rejects leadership succession dates that run backwards', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    const firstMemberState = createPoliticalPerson(initial, { displayName: 'First succession member', countryId: leader.countryId });
    const firstMemberId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    const secondMemberState = createPoliticalPerson(firstMemberState, { displayName: 'Second succession member', countryId: leader.countryId });
    const secondMemberId = `person.${String(firstMemberState.governance.nextPersonSequence).padStart(8, '0')}`;
    let state = setPartyMembership(secondMemberState, firstMemberId, leader.partyId);
    state = setPartyMembership(state, secondMemberId, leader.partyId);
    state = replacePartyLeader({ ...state, date: '2026-01-02' }, leader.partyId!, firstMemberId);
    state = replacePartyLeader({ ...state, date: '2026-01-03' }, leader.partyId!, secondMemberId);
    const [firstSuccessionId, secondSuccessionId] = state.governance.successionOrder;
    const malformed = structuredClone(state);
    malformed.governance.successions[firstSuccessionId].effectiveDate = '2026-01-03';
    malformed.governance.successions[secondSuccessionId].effectiveDate = '2026-01-02';
    expect(() => assertSimulationInvariants(malformed, worldContext, 'tick')).toThrow(/dates are not monotonic/);
  });

  it('reports governance-only command changes to UI/worker deltas', () => {
    const changed = createPoliticalPerson(initial, { displayName: 'Delta Person', countryId: worldCountryIds[0] });
    expect(simulationDelta(initial, changed).changedDomains).toEqual(['governance']);
  });

  it('validates party membership and keeps leadership separate from state authority', () => {
    const countryId = Object.values(politicalRegistry.countries).find(item => item.partyIds.length)!.countryId, other = worldCountryIds.find(id => id !== countryId)!;
    let { state, id } = playerFor(initial, countryId); state = revokePoliticalOffice(state, id);
    const partyId = politicalRegistry.countries[countryId].partyIds[0], otherParty = politicalRegistry.countries[other]?.partyIds[0];
    state = setPartyLeadership(setPartyMembership(state, id, partyId), id, true);
    expect(state.governance.persons[id]).toMatchObject({ partyId, isPartyLeader: true }); expect(state.governance.persons[id].office).toBeUndefined();
    const draft = budgetProposal(state, id, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder.at(-1)!)).toThrow(/lacks authority/);
    if (otherParty) expect(() => setPartyMembership(state, id, otherParty)).toThrow(/leadership succession/);
  });

  it('revoking office preserves player identity and control while removing capabilities', () => {
    const countryId = worldCountryIds[0], player = playerFor(initial, countryId), next = revokePoliticalOffice(player.state, player.id);
    expect(next.governance.player.controlledPersonId).toBe(player.id); expect(next.governance.persons[player.id]).toBeDefined(); expect(next.governance.persons[player.id].office).toBeUndefined();
  });

  it('creates editable drafts and freezes logical content after submission', () => {
    const fixture = findResolvable(true), id = fixture.proposalId;
    const edited = replaceDraftProposal(fixture.state, id, { effectiveDate: '2026-03-01' });
    const submitted = submitProposal(edited, id); expect(submitted.governance.proposals[id]).toMatchObject({ status: 'submitted', submittedOn: submitted.date });
    expect(() => replaceDraftProposal(submitted, id, { effectiveDate: '2026-03-01' })).toThrow(/immutable/);
    expect(edited.governance.proposals[id].effectiveDate).toBe('2026-03-01');
    const corrupted = structuredClone(submitted); corrupted.governance.proposals[id].effectiveDate = '2026-04-01'; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/payload was modified/);
  });

  it('requires edited sourced tax rules to become explicitly modelled', () => {
    const countryId = worldCountryIds.find(id => Object.values(initial.fiscal.countries[id].policy).some(Boolean))!, player = playerFor(initial, countryId), policy = structuredClone(player.state.fiscal.countries[countryId].policy);
    const rule = Object.values(policy).find(value => value !== null)!;
    if (rule.kind === 'personal') rule.bands![0].rateBps += rule.bands![0].rateBps < 10_000 ? 1 : -1; else if (rule.kind === 'payroll') rule.employee![0].rateBps += rule.employee![0].rateBps < 10_000 ? 1 : -1; else rule.rateBps! += rule.rateBps! < 10_000 ? 1 : -1;
    expect(() => createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } })).toThrow(/explicitly modelled/);
    rule.status = 'modelled'; expect(createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } }).governance.proposalOrder).toHaveLength(1);
  });

  it('requires the controlled proposer and the correct office scope', () => {
    const countryId = worldCountryIds[0]; let first = createPoliticalPerson(initial, { displayName: 'One', countryId }); const one = `person.${String(first.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    first = assignPoliticalOffice(first, one, { role: 'head_of_government', countryId }); first = createPoliticalPerson(first, { displayName: 'Two', countryId }); const two = `person.${String(first.governance.nextPersonSequence - 1).padStart(8, '0')}`; first = setControlledPerson(first, two);
    const draft = budgetProposal(first, one, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder[0])).toThrow(/not the controlled person/);
  });

  it('requires vote authority to remain present at resolution time', () => {
    const fixture = findResolvable(true); let state = submitProposal(fixture.state, fixture.proposalId); state = revokePoliticalOffice(state, fixture.personId);
    expect(() => resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles)).toThrow(/lacks authority/);
  });

  it('produces normalized public estimates and deterministic reconciled parliamentary estimates', () => {
    const fixture = findResolvable(true), proposal = fixture.state.governance.proposals[fixture.proposalId], publicEstimate = estimatePublicSupport(fixture.state, proposal), parliament = estimateParliamentarySupport(fixture.state, proposal, fixture.registry, fixture.profiles);
    expect(publicEstimate.supportBps + publicEstimate.opposeBps + publicEstimate.neutralBps + publicEstimate.unknownBps).toBe(10_000); expect(publicEstimate.representedPersons).toBeGreaterThan(0);
    expect(parliament.yesSeats + parliament.noSeats + parliament.abstainSeats + parliament.unavailableSeats).toBe(parliament.totalSeats);
    expect(estimatePublicSupport(fixture.state, proposal)).toEqual(publicEstimate); expect(estimateParliamentarySupport(fixture.state, proposal, fixture.registry, fixture.profiles)).toEqual(parliament);
    const inspected = inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry, fixture.profiles); expect(inspected.informationStatus).toBe('engine_debug_reality'); expect(inspected.impact.drivers[0]?.source).toMatch(/^(policy|annualBudget)\./);
  });

  it('is independent of dynamic Country and Region insertion order', () => {
    const fixture = findResolvable(true), reordered = structuredClone(fixture.state);
    reordered.politics.countries = Object.fromEntries(Object.entries(reordered.politics.countries).reverse()); reordered.politics.regionalOpinion = Object.fromEntries(Object.entries(reordered.politics.regionalOpinion).reverse()); reordered.socioeconomy.regions = Object.fromEntries(Object.entries(reordered.socioeconomy.regions).reverse());
    expect(inspectProposalSupport(reordered, fixture.proposalId, fixture.registry, fixture.profiles)).toEqual(inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry, fixture.profiles));
  });

  it('keeps unavailable seats distinct and prevents bicameral/incomplete enactment', () => {
    const unavailableCountry = Object.values(politicalRegistry.countries).map(item => item.countryId).find(countryId => {
      const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId]; return institution?.chambers.some(chamber => chamber.seatAllocationStatus !== 'sourced' || (chamber.independentOtherSeats ?? 0) > 0);
    })!;
    const player = playerFor(initial, unavailableCountry); let state = budgetProposal(player.state, player.id, unavailableCountry, 2), id = state.governance.proposalOrder.at(-1)!; state = submitProposal(state, id); const estimate = estimateParliamentarySupport(state, state.governance.proposals[id]);
    expect(estimate.coverage).not.toBe('complete'); expect(estimate.unavailableSeats).toBeGreaterThanOrEqual(0);
    const fiscalBefore = state.fiscal; state = resolveProposalVote(state, id); expect(state.governance.proposals[id].status).toBe('unavailable'); expect(state.fiscal).toBe(fiscalBefore);
  });

  it('adopts through exactly one queued FiscalReform without direct material effects', () => {
    const fixture = findResolvable(true); let state = submitProposal({ ...fixture.state, paused: true }, fixture.proposalId), fiscalBefore = state.fiscal, socioBefore = state.socioeconomy, politicsBefore = state.politics, crisisBefore = state.crisis;
    state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles); const proposal = state.governance.proposals[fixture.proposalId];
    expect(proposal.status).toBe('enacted'); expect(proposal.voteResult?.outcome).toBe('adopted'); expect(state.paused).toBe(true); expect(state.fiscal.reforms.filter(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1);
    expect(state.fiscal.countries).toBe(fiscalBefore.countries); expect(state.socioeconomy).toBe(socioBefore); expect(state.politics).toBe(politicsBefore); expect(state.crisis).toBe(crisisBefore);
    const applied = advanceSimulationDays(state, 31); expect(applied.fiscal.reforms.some(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toBe(false);
    if (proposal.payload.policy) expect(applied.fiscal.countries[fixture.countryId].policy).toEqual(proposal.payload.policy); else expect(applied.fiscal.countries[fixture.countryId].annualBudget).toEqual(proposal.payload.annualBudget);
  }, 30_000);

  it('allows later material fiscal consequences to reach opinion through the existing scheduler', () => {
    const countryId = completeCountryIds().find(id => initial.fiscal.countries[id].annualBudget.infrastructure > 0)!, player = playerFor(initial, countryId);
    let changed = budgetProposal(player.state, player.id, countryId, 0), proposalId = changed.governance.proposalOrder.at(-1)!, registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    for (const partyId of registry.countries[countryId].partyIds) registry.parties[partyId].issuePositions.infrastructure = { ...registry.parties[partyId].issuePositions.infrastructure, preferenceBps: 1_000, intensityBps: 10_000, confidenceBps: 10_000, ideologicalPrior: 'explicit governance causal-path test evidence' };
    changed = resolveProposalVote(submitProposal(changed, proposalId), proposalId, registry); expect(changed.governance.proposals[proposalId].status).toBe('enacted');
    const baseline = advanceSimulationDays(player.state, 70), consequence = advanceSimulationDays(changed, 70);
    expect(consequence.fiscal.countries[countryId].services.infrastructure.coverageBps).not.toBe(baseline.fiscal.countries[countryId].services.infrastructure.coverageBps);
    expect(consequence.politics.countries[countryId]).not.toEqual(baseline.politics.countries[countryId]);
  }, 60_000);

  it('rejects deterministically without scheduling or changing fiscal state', () => {
    const fixture = findResolvable(false); let state = submitProposal(fixture.state, fixture.proposalId), fiscal = state.fiscal; state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles);
    expect(state.governance.proposals[fixture.proposalId].status).toBe('rejected'); expect(state.fiscal).toBe(fiscal); expect(state.governance.proposals[fixture.proposalId].scheduledFiscalReformSequence).toBeUndefined();
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
    expect(() => resolveProposalVote(state, fixture.proposalId)).toThrow(/Only an unresolved/);
  });

  it('withdraws without enacting and persists loss of office, drafts and resolutions', () => {
    const fixture = findResolvable(true), withdrawn = withdrawProposal(fixture.state, fixture.proposalId); expect(withdrawn.governance.proposals[fixture.proposalId].status).toBe('withdrawn');
    let enacted = submitProposal(fixture.state, fixture.proposalId); enacted = resolveProposalVote(enacted, fixture.proposalId, fixture.registry, fixture.profiles); enacted = revokePoliticalOffice(enacted, fixture.personId);
    const restored = restoreSimulationState(serializeSimulationState(enacted, worldContext), worldRegions, {}, {}, worldContext); expect(restored).toEqual(enacted); expect(restored.governance.persons[fixture.personId].office).toBeUndefined();
  }, 30_000);

  it('migrates schema 11 on the saved date without fake governance history or changing other branches', () => {
    const legacy = structuredClone(initial) as unknown as Record<string, unknown>; legacy.schemaVersion = 11; legacy.date = '2034-05-06'; delete legacy.governance;
    const politics = legacy.politics, fiscal = legacy.fiscal, socioeconomy = legacy.socioeconomy, crisis = legacy.crisis;
    const migrated = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(migrated.governance.initializedOn).toBe('2034-05-06'); expect(migrated.governance.proposalOrder).toEqual([]); expect(migrated.schemaVersion).toBe(13);
    expect(migrated.information).toMatchObject({ initializedOn: '2034-05-06', briefings: [], latestGovernmentReports: {} });
    expect(migrated.politics).toEqual(JSON.parse(JSON.stringify(politics))); expect(migrated.fiscal).toEqual(JSON.parse(JSON.stringify(fiscal))); expect(migrated.socioeconomy).toEqual(JSON.parse(JSON.stringify(socioeconomy))); expect(migrated.crisis).toEqual(JSON.parse(JSON.stringify(crisis)));
  }, 30_000);

  it('conserves governance across fidelity transitions and returns defensive inspections', () => {
    const fixture = findResolvable(true), queued = requestFidelityTransition(fixture.state, fixture.countryId, 'Detailed', worldContext.countryIds), applied = applyPendingFidelityTransitions(queued);
    expect(applied.governance).toBe(queued.governance); expect(validateFidelityConservation(queued, applied)).toEqual([]);
    const inspected = inspectGovernance(fixture.state); inspected.proposalOrder.length = 0; expect(fixture.state.governance.proposalOrder).toHaveLength(1); expect(inspectPlayer(fixture.state)?.id).toBe(fixture.personId);
  });

  it('validates governance invariants and prevents unimplemented political systems or non-deterministic RNG', () => {
    const fixture = findResolvable(true); expect(assertSimulationInvariants(fixture.state, worldContext, 'tick')).toBe(true);
    const malformed = structuredClone(fixture.state); malformed.governance.player.controlledPersonId = 'person.unknown'; expect(() => assertSimulationInvariants(malformed, worldContext, 'tick')).toThrow(/Controlled person/);
    const source = readFileSync('src/simulation/governance/runtime.ts', 'utf8'); expect(source).not.toContain('Math.random'); expect(source).not.toMatch(/\belection\b|\bcampaign\b|\bmedia\b|\bprotest\b|\bstrike\b|\bcoup\b|\blobby\b|\bcoalition negotiation\b|\bparty AI\b|\bgovernment AI\b/i);
  });
});

describe('governance 0.14 situational corrective contracts', () => {
  it('keeps an unavailable tax rule distinct from a legal zero rate', () => {
    const made = taxDraft('corporate', () => {}, false), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'policy.corporate', before: null, coverage: 'unavailable' })]));
    expect(analysis.unsupportedChanges).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'policy.corporate', coverage: 'unavailable' })]));
    expect(analysis.expectedConsequences.some(item => item.source.includes('corporate'))).toBe(false);
    expect(analysis.genuinelyNeutral).toBe(false); expect(analysis.coverage).toBe('unavailable');
  });

  it('reports consumption-tax changes and their immediate causal evidence', () => {
    const made = taxDraft('consumption', rule => { rule.rateBps = Math.min(10_000, (rule.rateBps ?? 0) + 250); }), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges.some(item => item.path.includes('policy.consumption.rateBps'))).toBe(true);
    expect(analysis.expectedConsequences.some(item => item.source.includes('consumption'))).toBe(true); expect(analysis.genuinelyNeutral).toBe(false);
  });

  it('reports payroll changes and explicitly limits the future employment response', () => {
    const made = taxDraft('payroll', rule => { rule.employee![0].rateBps = Math.min(10_000, rule.employee![0].rateBps + 100); }), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges.some(item => item.path.includes('policy.payroll.employee[0].rateBps'))).toBe(true);
    expect(analysis.unsupportedChanges).toContainEqual(expect.objectContaining({ path: 'policy.payroll.employment_response', coverage: 'partial' }));
  });

  it('detects personal allowances and bracket thresholds structurally', () => {
    const made = taxDraft('personal', rule => { rule.allowance = (rule.allowance ?? 0) + 10; if (rule.bands!.length > 1) rule.bands![1].lower += 1; else rule.bands!.push({ lower: 100_000, rateBps: Math.min(10_000, rule.bands![0].rateBps + 100) }); }), paths = analyzeProposal(made.state, made.proposal).directPolicyChanges.map(item => item.path);
    expect(paths).toContain('policy.personal.allowance'); expect(paths.some(path => path.includes('policy.personal.bands[1]'))).toBe(true);
  });

  it('distinguishes a genuinely neutral proposal from unknown consequences', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), neutral = draft(player.state, player.id, countryId, { annualBudget: structuredClone(player.state.fiscal.countries[countryId].annualBudget) });
    const neutralAnalysis = analyzeProposal(neutral.state, neutral.proposal), unknownAnalysis = analyzeProposal(taxDraft('corporate', () => {}, false).state, taxDraft('corporate', () => {}, false).proposal);
    expect(neutralAnalysis).toMatchObject({ genuinelyNeutral: true, coverage: 'complete', directPolicyChanges: [], unsupportedChanges: [] });
    expect(unknownAnalysis).toMatchObject({ genuinelyNeutral: false, coverage: 'unavailable' });
  });

  it('uses current fiscal stress to change agreement for the same party and proposal', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), current = player.state.fiscal.countries[countryId].annualBudget;
    const made = draft(player.state, player.id, countryId, { annualBudget: { ...current, incomeSupport: Math.round(current.incomeSupport * .8) } });
    const partyId = politicalRegistry.countries[countryId].partyIds[0], goals = profile(partyId, { income_security: { idealPointBps: 8_500, importanceBps: 5_000, compromiseToleranceBps: 2_500, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 9_000, importanceBps: 9_000, compromiseToleranceBps: 4_000, confidenceBps: 9_000 } });
    const calm = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, goals), extremeState = structuredClone(made.state), fiscal = extremeState.fiscal.countries[countryId];
    fiscal.debt = fiscal.debtLimit; fiscal.interestArrears = Math.max(1, current.administration * 12); fiscal.arrears.administration = Math.max(1, current.administration * 12);
    const extreme = evaluatePartyProposal(extremeState, made.proposal, partyId, politicalRegistry, goals);
    expect(extreme.agreementBps).toBeGreaterThan(calm.agreementBps); expect(goals.goals.income_security.idealPointBps).toBe(8_500);
    expect(extreme.issueEvaluations.find(item => item.goal === 'income_security')!.compromiseCostBps).toBeLessThanOrEqual(calm.issueEvaluations.find(item => item.goal === 'income_security')!.compromiseCostBps);
  });

  it('lets two parties weigh the same material trade-off differently', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: Math.round(budget.incomeSupport * .7) } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const discipline = profile(partyId, { income_security: { idealPointBps: 7_000, importanceBps: 2_000, compromiseToleranceBps: 6_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 10_000, importanceBps: 10_000, compromiseToleranceBps: 5_000, confidenceBps: 9_000 } });
    const security = profile(partyId, { income_security: { idealPointBps: 10_000, importanceBps: 10_000, compromiseToleranceBps: 500, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_000, importanceBps: 2_000, compromiseToleranceBps: 8_000, confidenceBps: 9_000 } });
    expect(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, discipline).agreementBps).toBeGreaterThan(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, security).agreementBps);
  });

  it('makes proposal magnitude matter and does not reward overshooting an ideal', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, partyId = politicalRegistry.countries[countryId].partyIds[0];
    const small = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: Math.round(budget.infrastructure * 1.1) } }), large = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 4 } });
    const goals = profile(partyId, { infrastructure: { idealPointBps: 9_000, importanceBps: 9_000, compromiseToleranceBps: 3_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_500, importanceBps: 8_000, compromiseToleranceBps: 2_000, confidenceBps: 9_000 } });
    const a = evaluatePartyProposal(small.state, small.proposal, partyId, politicalRegistry, goals), b = evaluatePartyProposal(large.state, large.proposal, partyId, politicalRegistry, goals);
    expect(a.agreementBps).not.toBe(b.agreementBps); expect(b.agreementBps).toBeLessThan(a.agreementBps);
  });

  it('models compromise tolerance per issue and without absolute ideological vetoes', () => {
    const party = Object.values(politicalRegistry.parties)[0], derived = derivePartyGoalProfile(party);
    expect(Object.values(derived.goals).every(goal => goal.compromiseToleranceBps > 0)).toBe(true);
    const custom = derivePartyGoalProfile(party, { fiscal_distribution: { compromiseToleranceBps: 800 }, infrastructure: { compromiseToleranceBps: 8_000 } });
    expect(custom.goals.fiscal_distribution.compromiseToleranceBps).toBe(800); expect(custom.goals.infrastructure.compromiseToleranceBps).toBe(8_000);
  });

  it('gives stricter same-side parties a higher compromise cost', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: Math.round(budget.incomeSupport * .75) } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const moderate = profile(partyId, { income_security: { idealPointBps: 10_000, importanceBps: 8_000, compromiseToleranceBps: 5_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_500, importanceBps: 2_000, confidenceBps: 9_000 } }), rigid = structuredClone(moderate); rigid.goals.income_security.compromiseToleranceBps = 100;
    const a = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, moderate), b = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, rigid);
    expect(b.compromiseCostBps).toBeGreaterThan(a.compromiseCostBps); expect(b.agreementBps).toBeLessThan(a.agreementBps);
  });

  it('applies symmetric rigidity to a fiscal-discipline core issue', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: budget.incomeSupport * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const flexible = profile(partyId, { income_security: { idealPointBps: 9_000, importanceBps: 3_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 9_500, importanceBps: 9_000, compromiseToleranceBps: 6_000, confidenceBps: 9_000 } }), rigid = structuredClone(flexible); rigid.goals.fiscal_sustainability.compromiseToleranceBps = 500;
    expect(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, rigid).agreementBps).toBeLessThan(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, flexible).agreementBps);
  });

  it('keeps fallback ideology low-confidence and deterministic', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0], fallback = profile(partyId, {});
    for (const goal of Object.values(fallback.goals)) { goal.confidenceBps = 500; goal.status = 'modelled_fallback'; }
    const first = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, fallback), second = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, fallback);
    expect(first).toEqual(second); expect(first.confidenceBps).toBeLessThan(GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps); expect(first.vote).toBe('unknown');
  });

  it('centralizes the deterministic conversion from agreement to a vote', () => {
    expect(GOVERNANCE_VOTE_THRESHOLDS).toEqual({ yesAgreementBps: 6_000, noAgreementBps: 4_000, minimumConfidenceBps: 3_000 });
    expect(Object.isFrozen(GOVERNANCE_VOTE_THRESHOLDS)).toBe(true);
  });

  it('propagates unavailable material context into coverage and confidence', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), unavailable = structuredClone(player.state), country = unavailable.fiscal.countries[countryId]; country.services.infrastructure.coverageBps = null; country.services.infrastructure.required = 0; country.services.infrastructure.backlog = 0;
    const budget = country.annualBudget, made = draft(unavailable, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0], result = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, profile(partyId, { infrastructure: { confidenceBps: 9_000 } }));
    expect(analyzeProposal(made.state, made.proposal).materialContext.infrastructure.coverage).toBe('unavailable'); expect(result.coverage).toBe('partial');
  });

  it('rejects retroactive people and appointments at the API boundary', () => {
    const countryId = resolvableCountry(); expect(() => createPoliticalPerson(initial, { displayName: 'Past', countryId, createdOn: '2025-12-31' })).toThrow(/creation date/);
    const created = createPoliticalPerson(initial, { displayName: 'Present', countryId }); expect(() => assignPoliticalOffice(created, 'person.00000000', { role: 'head_of_government', countryId, appointedOn: '2025-12-31' })).toThrow(/appointment date/);
  });

  it('terminates an expired submitted proposal without retroactive reform', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }, '2026-01-02');
    const submitted = submitProposal(made.state, made.proposal.id), late = { ...submitted, date: '2026-01-03' }, before = late.fiscal, resolved = resolveProposalVote(late, made.proposal.id);
    expect(resolved.governance.proposals[made.proposal.id]).toMatchObject({ status: 'unavailable', voteResult: { outcome: 'unavailable', reason: 'effective_date_expired' } }); expect(resolved.fiscal).toBe(before); expect(resolved.fiscal.reforms).toHaveLength(0);
  });

  it('proves enacted ownership through one matching reform and later receipt', () => {
    const fixture = findResolvable(true); let state = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), proposal = state.governance.proposals[fixture.proposalId];
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true); expect(state.fiscal.reforms.filter(item => item.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1);
    state = advanceSimulationDays(state, 31); proposal = state.governance.proposals[fixture.proposalId]; expect(state.fiscal.reformReceipts.filter(item => item.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1); expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
  }, 30_000);

  it('rejects tampered enactment ownership and duplicate resolution', () => {
    const fixture = findResolvable(true); const enacted = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), corrupted = structuredClone(enacted);
    corrupted.governance.proposals[fixture.proposalId].enactmentReference!.reformFingerprint = 'tampered'; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/enactment reference/);
    expect(() => resolveProposalVote(enacted, fixture.proposalId, fixture.registry, fixture.profiles)).toThrow(/Only an unresolved/);
  });

  it('rejects corrupted persisted support outputs', () => {
    const fixture = findResolvable(true); const enacted = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), corrupted = structuredClone(enacted), proposal = corrupted.governance.proposals[fixture.proposalId];
    proposal.publicEstimate!.supportBps = 10_001; proposal.voteResult!.yesSeats += 1; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid public estimate|Invalid vote result/);
  });

  it('preserves situational outputs across deterministic save and reload', () => {
    const fixture = findResolvable(true), enacted = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), restored = restoreSimulationState(serializeSimulationState(enacted, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(enacted); expect(restored.governance.proposals[fixture.proposalId].evaluationVersion).toBe('situational-0.14-v2');
  }, 30_000);

  it('reloads an actual d2f3ce aggregate-only enacted schema-12 proposal', () => {
    const legacy = d2LegacyResolved('enacted'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(restored).toMatchObject({ schemaVersion: 13, governance: { version: 'governance-0.14-v1' } }); expect(proposal).toMatchObject({ status: 'enacted', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'adopted', coverage: 'complete' } });
    expect(proposal.parliamentaryEstimate!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true);
    const evidence = [...restored.fiscal.reforms, ...restored.fiscal.reformReceipts].filter(item => item.sequence === legacy.sequence); expect(evidence).toHaveLength(1); expect(evidence[0].origin?.proposalId).toBe(legacy.proposalId); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('reloads a meaningful d2f3ce aggregate-only rejection without fabricating party evidence', () => {
    const legacy = d2LegacyResolved('rejected'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(proposal).toMatchObject({ status: 'rejected', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'rejected', coverage: 'complete' } });
    expect(proposal.parliamentaryEstimate!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('conservatively makes a d2f3ce all-abstain rejection unavailable', () => {
    const legacy = d2LegacyResolved('all_abstain'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(proposal).toMatchObject({ status: 'unavailable', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'unavailable', reason: 'institutional_data_unavailable', coverage: 'unavailable', abstainSeats: 0 } });
    expect(proposal.voteResult!.unavailableSeats).toBe(proposal.voteResult!.totalSeats); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('round-trips the upgraded aggregate-only save deterministically', () => {
    const legacy = d2LegacyResolved('enacted'), first = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), serialized = serializeSimulationState(first, worldContext), second = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext);
    expect(second).toEqual(first); expect(serializeSimulationState(second, worldContext)).toBe(serialized);
  });

  it('rejects malformed aggregate-only legacy chamber totals', () => {
    const legacy = d2LegacyResolved('rejected'), proposal = legacy.state.governance.proposals[legacy.proposalId], chamber = proposal.voteResult!.chambers[0]; chamber.totalSeats! += 1;
    expect(() => restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext)).toThrow(/Invalid vote result/);
  });

  it('does not let a situational-v2 proposal use aggregate-only compatibility', () => {
    const fixture = findResolvable(true), state = structuredClone(resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles)), proposal = state.governance.proposals[fixture.proposalId];
    delete proposal.parliamentaryEstimate!.chambers[0].partyEvaluations; delete proposal.voteResult!.chambers[0].partyEvaluations;
    expect(proposal.evaluationVersion).toBe('situational-0.14-v2'); expect(() => assertSimulationInvariants(state, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate|Invalid vote result/);
  });

  it('holds transfers constant in a tax-only counterfactual', () => {
    const made = taxDraft('personal', rule => { rule.bands![0].rateBps = Math.min(10_000, rule.bands![0].rateBps + 500); }), state = structuredClone(made.state), regionId = Object.keys(state.fiscal.regions).find(id => state.regionOwnership[id] === made.countryId)!;
    const region = state.fiscal.regions[regionId]; region.transfers = [101, 202, 303]; region.disposable = region.disposable.map((value, index) => value + region.transfers[index]);
    const result = evaluateImmediateFiscalPolicyCounterfactual(state, made.countryId, made.proposal.payload.policy!, made.proposal.effectiveDate);
    expect(result.proposedTransfersByIncome).toEqual(result.currentTransfersByIncome); expect(result.currentTransfersByIncome.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(606);
  });

  it('attributes disposable-income change only to direct-tax incidence', () => {
    const made = taxDraft('personal', rule => { rule.bands![0].rateBps = Math.min(10_000, rule.bands![0].rateBps + 500); }), state = structuredClone(made.state), regionId = Object.keys(state.fiscal.regions).find(id => state.regionOwnership[id] === made.countryId)!;
    const region = state.fiscal.regions[regionId]; region.transfers = [111, 222, 333]; region.disposable = region.disposable.map((value, index) => value + region.transfers[index]);
    const result = evaluateImmediateFiscalPolicyCounterfactual(state, made.countryId, made.proposal.payload.policy!, made.proposal.effectiveDate);
    for (let index = 0; index < 3; index++) expect(result.proposedDisposableByIncome[index] - result.currentDisposableByIncome[index]).toBe(-(result.proposedDirectTaxByIncome[index] - result.currentDirectTaxByIncome[index]));
  });

  it('records both fiscal benefit and household burden for a VAT increase', () => {
    const made = taxDraft('consumption', rule => { rule.rateBps = Math.min(10_000, (rule.rateBps ?? 0) + 2_000); }), consequences = analyzeProposal(made.state, made.proposal).expectedConsequences;
    expect(consequences).toEqual(expect.arrayContaining([expect.objectContaining({ goal: 'fiscal_sustainability', source: expect.stringContaining('consumption') }), expect.objectContaining({ goal: 'income_security', source: 'fiscal.counterfactual.consumption_tax_burden' })]));
    expect(consequences.find(item => item.source === 'fiscal.counterfactual.consumption_tax_burden')!.directionBps).toBeLessThan(0); expect(consequences.some(item => item.source === 'fiscal.counterfactual.consumption_tax_incidence')).toBe(true);
  });

  it('keeps unknown party evidence distinct from a real abstention', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), made = budgetProposal(player.state, player.id, countryId, 2), proposal = made.governance.proposals[made.governance.proposalOrder[0]], partyId = politicalRegistry.countries[countryId].partyIds[0], fallback = profile(partyId, {});
    for (const goal of Object.values(fallback.goals)) { goal.confidenceBps = 500; goal.status = 'modelled_fallback'; }
    expect(evaluatePartyProposal(made, proposal, partyId, politicalRegistry, fallback).vote).toBe('unknown');
  });

  it('makes an all-unknown chamber unavailable instead of rejected', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId); let state = budgetProposal(player.state, player.id, countryId, 2), proposalId = state.governance.proposalOrder[0], estimate = estimateParliamentarySupport(state, state.governance.proposals[proposalId]);
    expect(estimate.coverage).toBe('unavailable'); expect(estimate.yesSeats + estimate.noSeats + estimate.abstainSeats).toBe(0); expect(estimate.unavailableSeats).toBe(estimate.totalSeats); expect(estimate.chambers.flatMap(item => item.partyEvaluations ?? []).every(item => item.vote === 'unknown')).toBe(true);
    state = resolveProposalVote(submitProposal(state, proposalId), proposalId); expect(state.governance.proposals[proposalId]).toMatchObject({ status: 'unavailable', voteResult: { outcome: 'unavailable', reason: 'institutional_data_unavailable' } });
  });

  it('counts a sufficiently known middle-range position as a real abstention', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure + Math.max(1, Math.round(budget.infrastructure / 100)) } }), analysis = analyzeProposal(made.state, made.proposal), profiles: Record<string, PartyGoalProfile> = {};
    const currentFiscal = Math.min(analysis.materialContext.fiscalSustainability.valueBps!, 10_000 - analysis.materialContext.fiscalDistress.valueBps!);
    for (const partyId of politicalRegistry.countries[countryId].partyIds) profiles[partyId] = profile(partyId, { infrastructure: { idealPointBps: analysis.materialContext.infrastructure.valueBps!, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000 }, fiscal_sustainability: { idealPointBps: currentFiscal, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000 } });
    const estimate = estimateParliamentarySupport(made.state, made.proposal, politicalRegistry, profiles, analysis); expect(estimate.coverage).toBe('complete'); expect(estimate.abstainSeats).toBe(estimate.totalSeats); expect(estimate.unavailableSeats).toBe(0); expect(estimate.chambers.flatMap(item => item.partyEvaluations ?? []).every(item => item.vote === 'abstain')).toBe(true);
  });

  it('keeps unknown public evidence out of the neutral bucket', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), state = structuredClone(budgetProposal(player.state, player.id, countryId, 2)), proposal = state.governance.proposals[state.governance.proposalOrder[0]];
    for (const regional of Object.values(state.politics.regionalOpinion)) if (regional.countryId === countryId) for (const opinion of Object.values(regional.cohorts)) opinion[COHORT.engagement] = 0;
    const estimate = estimatePublicSupport(state, proposal); expect(estimate.coverage).toBe('unavailable'); expect(estimate.knownPersons).toBe(0); expect(estimate.unknownPersons).toBe(estimate.representedPersons); expect(estimate.unknownBps).toBe(10_000); expect(estimate.neutralBps).toBe(0);
  });

  it('rejects party vote decisions that contradict confidence or agreement thresholds', () => {
    const fixture = findResolvable(true), corrupted = structuredClone(resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles)), proposal = corrupted.governance.proposals[fixture.proposalId], evaluation = proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0]; evaluation.vote = 'unknown';
    expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate/);
  });

  it('rejects chamber seat buckets that disagree with party decisions', () => {
    const fixture = findResolvable(true), corrupted = structuredClone(resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles)), proposal = corrupted.governance.proposals[fixture.proposalId], estimate = proposal.parliamentaryEstimate!, chamber = estimate.chambers[0], moved = chamber.partyEvaluations![0].seats;
    chamber.yesSeats -= moved; chamber.abstainSeats += moved; estimate.yesSeats -= moved; estimate.abstainSeats += moved;
    expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate/);
  });

  it('keeps governance on-demand and material branches unchanged during evaluation', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), before = { fiscal: made.state.fiscal, socioeconomy: made.state.socioeconomy, politics: made.state.politics, crisis: made.state.crisis };
    inspectProposalSupport(made.state, made.proposal.id); expect(made.state.fiscal).toBe(before.fiscal); expect(made.state.socioeconomy).toBe(before.socioeconomy); expect(made.state.politics).toBe(before.politics); expect(made.state.crisis).toBe(before.crisis);
  });
});
