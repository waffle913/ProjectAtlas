import { describe, expect, it } from 'vitest'; import { transferTerritory } from '../territory';
const state = {schemaVersion:6 as const,date:'2026-01-01', paused:true, speed:1 as const, territoryOwnership:{'territory.example':'country.alpha'},regionOwnership:{},populationByRegion:{},economicOutputByRegion:{},bilateralRelations:{},claims:[],explicitCasusBelli:[],wars:[],occupationByRegion:{}};
describe('transferTerritory', () => {
  it('transfers one territory without mutating the previous state', () => { const next = transferTerritory(state, 'territory.example', 'country.alpha', 'country.beta'); expect(next.territoryOwnership['territory.example']).toBe('country.beta'); expect(state.territoryOwnership['territory.example']).toBe('country.alpha'); });
  it('rejects a transfer from an incorrect owner', () => expect(() => transferTerritory(state, 'territory.example', 'country.beta', 'country.alpha')).toThrow(/not owned/));
});
