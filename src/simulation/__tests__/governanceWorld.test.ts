/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { politicalRegistry } from '../politics/registry';
import { createSimulationSnapshotCache } from '../state';
import { serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

describe('full-world governance 0.14 benchmark', () => {
  it('measures empty event-driven state, save size, snapshots and legislative coverage', () => {
    const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs), cache = createSimulationSnapshotCache(); cache(state);
    let t = performance.now(); const snapshot = cache({ ...state, date: '2026-01-02' }); const snapshotMs = performance.now() - t;
    t = performance.now(); const serialized = serializeSimulationState(state, worldContext), serializeMs = performance.now() - t;
    const institutions = Object.values(politicalRegistry.institutions), chambers = institutions.flatMap(item => item.chambers);
    const resolvableCountries = Object.values(politicalRegistry.countries).filter(country => { const institution = politicalRegistry.institutions[country.institutionId]; return Boolean(institution?.chambers.length) && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats); }).length;
    expect(snapshot.governance).toBe(cache(state).governance); expect(Object.keys(state.governance.persons)).toHaveLength(0); expect(Object.keys(state.governance.proposals)).toHaveLength(0); expect(resolvableCountries).toBeGreaterThan(0);
    console.info(`GOVERNANCE_WORLD_BENCHMARK ${JSON.stringify({ benchmark: 'projectatlas-governance-0.14', countries: worldCountryIds.length, chambers: chambers.length, resolvableCountries, unavailableCountries: worldCountryIds.length - resolvableCountries, persons: 0, proposals: 0, saveBytes: Buffer.byteLength(serialized), snapshotMs: Number(snapshotMs.toFixed(4)), serializeMs: Number(serializeMs.toFixed(2)) })}`);
  }, 30_000);
});
