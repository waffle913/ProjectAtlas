import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { restoreSimulationState } from '../save';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson, createConstitutionalAmendmentProposal, replaceDraftProposal } from '../governance/runtime';
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
    const withProposal = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { rightsChanges: { strike: 'guaranteed' } } });
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
    // Legacy pending amendment: old verdict shape, no status, old rightChanges.
    legacy.constitution.pendingAmendments = [{
      instrumentId: 'proposal.legacy-amendment', countryId, applyOn: '2026-02-01',
      payload: { materialKeysToProtect: ['fiscal.corporate'], rightChanges: { strike: 'guaranteed' } },
      judicialReview: { timing: 'none', effect: 'unavailable' },
      decision: { timing: 'none', effect: 'unavailable', outcome: 'blocked', on: '2026-02-01' },
      blockedOn: '2026-02-01',
    }];
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.governance.cabinets).toEqual({});
    const restoredEntry = restored.constitution.countries[countryId];
    expect(restoredEntry.emergency.justificationEpisodeIds.length).toBeGreaterThan(0);
    const restoredProposal = restored.governance.proposals[proposalId];
    expect((restoredProposal.payload as { rightsChanges?: unknown }).rightsChanges).toEqual({ strike: 'guaranteed' });
    const pending = restored.constitution.pendingAmendments[0];
    expect(pending.status).toBe('blocked');
    expect((pending.payload as { rightsChanges?: unknown }).rightsChanges).toEqual({ strike: 'guaranteed' });
    expect((pending as { decision?: unknown }).decision).toBeUndefined();
  });
});
