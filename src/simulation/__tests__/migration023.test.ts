import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { restoreSimulationState } from '../save';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson, createConstitutionalAmendmentProposal, replaceDraftProposal, submitProposalForActor, decideExecutiveProposal } from '../governance/runtime';
import { applyDueAmendments } from '../constitution/runtime';
import { politicalRegistry } from '../politics/registry';
import type { SimulationState } from '../../types';

let initial: SimulationState;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

function executive(state = initial, countryId = worldCountryIds[0]) {
  let next = createPoliticalPerson(state, { displayName: `Migration-test executive ${countryId}`, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  return setControlledPerson(assignPoliticalOffice(next, id, { role: 'head_of_government', countryId }), id);
}

describe('0.23 migrations and discriminated drafting', () => {
  it('discriminates replaceDraftProposal by proposal kind', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    let state = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { materialKeysToProtect: ['fiscal.corporate'] } });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    expect(() => replaceDraftProposal(state, proposalId, { payload: { materialKeysToProtect: ['bogus.key'] } })).toThrow(/Unknown material keys/);
    const replaced = replaceDraftProposal(state, proposalId, { payload: { rightsChanges: { strike: 'guaranteed' } } });
    expect((replaced.governance.proposals[proposalId].payload as { rightsChanges?: unknown }).rightsChanges).toEqual({ strike: 'guaranteed' });
  });

  it('backfills intra-schema-19 cabinets, episode identity, old rightChanges and amendment status', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    const withProposal = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'guaranteed' } } });
    const proposalId = withProposal.governance.proposalOrder.at(-1)!;
    const legacy = structuredClone(withProposal) as unknown as {
      governance: { cabinets?: unknown; proposals: Record<string, Record<string, unknown>> };
      constitution: { countries: Record<string, Record<string, unknown>>; pendingAmendments: Array<Record<string, unknown>> };
    };
    delete legacy.governance.cabinets;
    // Legacy singular `rightChanges` on the proposal payload.
    const proposal = legacy.governance.proposals[proposalId] as Record<string, unknown>;
    const payload = proposal.payload as Record<string, unknown>;
    payload.rightChanges = payload.rightsChanges; delete payload.rightsChanges;
    // Legacy emergency justification by crisis type.
    const entry = legacy.constitution.countries[countryId] as Record<string, unknown>;
    entry.emergency = { status: 'active', justificationCrisisIds: ['fiscal_stress'], restrictions: { assembliesBanned: true, strikesBanned: true, policePowersEnhanced: true, bordersClosed: true } };
    // Legacy pending amendments: one bound to the canonical proposal (old verdict shape, no status,
    // old rightChanges) and one orphan without any canonical proposal. The bound pending is
    // migrated; the orphan is conservatively removed from the executable flow — a migration never
    // fabricates a historical proposal for it.
    legacy.constitution.pendingAmendments = [
      {
        instrumentId: proposalId, countryId, applyOn: '2026-02-01',
        payload: { materialKeysToProtect: ['fiscal.corporate'], rightChanges: { strike: 'guaranteed' } },
        judicialReview: { timing: 'none', effect: 'unavailable' },
        decision: { timing: 'none', effect: 'unavailable', outcome: 'blocked', on: '2026-02-01' },
        blockedOn: '2026-02-01',
      },
      {
        instrumentId: 'proposal.legacy-orphan', countryId, applyOn: '2026-02-01',
        payload: { materialKeysToProtect: ['fiscal.corporate'] },
        judicialReview: { timing: 'none', effect: 'unavailable' },
        status: 'scheduled',
      },
    ];
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.governance.cabinets).toEqual({});
    const restoredEntry = restored.constitution.countries[countryId];
    // The legacy emergency recorded only the crisis TYPE; the historical episode identity cannot
    // be reconstructed (the current episode of that type may be a new one), so the migration
    // preserves the uncertainty instead of fabricating an episode link.
    expect(restoredEntry.emergency.justificationEpisodeIds).toEqual([]);
    expect(restoredEntry.emergency.unjustifiedSince).toBe(restored.date);
    const restoredProposal = restored.governance.proposals[proposalId];
    expect((restoredProposal.payload as { rightsChanges?: unknown }).rightsChanges).toEqual({ strike: 'guaranteed' });
    expect('rightChanges' in (restoredProposal.payload as { rightsChanges?: unknown; rightChanges?: unknown })).toBe(false);
    // The bound pending is migrated with its canonical relation intact; the orphan is gone.
    expect(restored.constitution.pendingAmendments).toHaveLength(1);
    expect(restored.constitution.pendingAmendments.map(pending => pending.instrumentId)).toEqual([proposalId]);
    const pending = restored.constitution.pendingAmendments[0];
    expect(pending.status).toBe('blocked');
    expect((pending.payload as { rightsChanges?: unknown }).rightsChanges).toEqual({ strike: 'guaranteed' });
    expect('rightChanges' in (pending.payload as { rightsChanges?: unknown; rightChanges?: unknown })).toBe(false);
    expect((pending as { decision?: unknown }).decision).toBeUndefined();
  });

  it('reconciles a legacy mono-chamber elections entry with the real registry chamber id', () => {
    const countryId = worldCountryIds[0];
    const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
    const realChamberId = institution?.chambers[0]?.id;
    if (!realChamberId) return;
    const current = initial.elections.countries[countryId];
    const legacy = structuredClone(initial) as unknown as { elections: { countries: Record<string, Record<string, unknown>> } };
    const source = current.chambers[realChamberId] ?? Object.values(current.chambers)[0];
    legacy.elections.countries[countryId] = { countryId, seatsByParty: source.seatsByParty, totalSeats: source.totalSeats, independentOtherSeats: source.independentOtherSeats, lastElectionDate: source.lastElectionDate, nextElectionDate: source.nextElectionDate, government: current.government, parties: current.parties };
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.elections.countries[countryId].chambers[realChamberId]).toBeDefined();
    expect(restored.elections.countries[countryId].chambers[`chamber.${countryId}`]).toBeUndefined();
  });

  it('converts a legacy full appliedPrior snapshot into a limited appliedInverse', () => {
    const countryId = worldCountryIds[0];
    let base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    // Real canonical flow: an enacted instrument with an applied amendment bound to it, so the
    // migrated pending keeps its canonical relation and its real revision trace.
    base = { ...base, constitution: { ...base.constitution, countries: { ...base.constitution.countries, [countryId]: { ...base.constitution.countries[countryId], parliament: { ...base.constitution.countries[countryId].parliament, power: 'none' }, rights: { ...base.constitution.countries[countryId].rights, strike: 'guaranteed' }, judicialReview: { courtExists: 'exists', appointment: 'unavailable', term: 'unavailable', timing: 'after_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    let next = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'not_guaranteed' } } });
    const proposalId = next.governance.proposalOrder.at(-1)!;
    next = submitProposalForActor(next, proposalId, personId);
    next = decideExecutiveProposal(next, proposalId, personId, 'enact');
    expect(next.governance.proposals[proposalId].status).toBe('enacted');
    next = { ...next, date: '2026-02-01' };
    next = applyDueAmendments(next);
    const pending = next.constitution.pendingAmendments[0];
    expect(pending.status).toBe('promulgated');
    expect(pending.appliedInverse?.rights).toEqual({ strike: 'guaranteed' });
    // Transform the save into the legacy shape: a full pre-application snapshot instead of the
    // limited inverse. The pre-amendment rights are the real recorded values.
    const preRights = { ...base.constitution.countries[countryId].rights };
    const legacy = structuredClone(next) as unknown as { constitution: { pendingAmendments: Array<Record<string, unknown>> } };
    const legacyPending = legacy.constitution.pendingAmendments[0] as Record<string, unknown>;
    legacyPending.appliedPrior = { protectedMaterialKeys: [], rights: preRights, parliament: {}, headOfState: {}, government: {}, election: {}, judicialReview: {}, territory: {}, amendment: {} };
    delete legacyPending.appliedInverse;
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.constitution.pendingAmendments).toHaveLength(1);
    const migrated = restored.constitution.pendingAmendments[0] as unknown as Record<string, unknown>;
    expect(migrated.appliedPrior).toBeUndefined();
    const inverse = migrated.appliedInverse as Record<string, unknown>;
    expect(inverse.rights).toEqual({ strike: 'guaranteed' });
    expect(inverse.parliament).toBeUndefined();
  });
});
