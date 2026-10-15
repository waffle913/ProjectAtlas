import { describe, it, expect } from 'vitest';
import {
  ENERGY_PLANT_KINDS, validateEnergyPlant, energyOutput, fuelRequired,
  type EnergyPlant,
} from '../resources/energy';

const thermal = (over: Partial<EnergyPlant> = {}): EnergyPlant => ({
  id: 'coal-a', kind: 'thermal', regionId: 'region-7', capacityMwhPerMonth: 1000,
  fuelInputId: 'coal', efficiencyBps: 4000, intermittencyBps: 0,
  maintenancePerMonth: 500, status: 'operating',
  ...over,
});

describe('resources energy production (0.27.5)', () => {
  it('declares the plant kinds and validates a fuelled plant', () => {
    expect(ENERGY_PLANT_KINDS).toEqual(['thermal', 'hydro', 'wind', 'solar', 'nuclear', 'other']);
    expect(() => validateEnergyPlant(thermal())).not.toThrow();
    expect(() => validateEnergyPlant(thermal({ kind: 'solar', fuelInputId: null, intermittencyBps: 3000 }))).not.toThrow();
  });

  it('requires a fuel for thermal/nuclear and forbids fuel for renewables', () => {
    expect(() => validateEnergyPlant(thermal({ fuelInputId: null }))).toThrow(/needs a non-empty fuel input id/);
    expect(() => validateEnergyPlant(thermal({ kind: 'wind', fuelInputId: 'coal' }))).toThrow(/must not declare a fuel input/);
  });

  it('rejects malformed efficiency, intermittency and capacity', () => {
    expect(() => validateEnergyPlant(thermal({ efficiencyBps: 0 }))).toThrow(/efficiencyBps/);
    expect(() => validateEnergyPlant(thermal({ efficiencyBps: 20000 }))).toThrow(/efficiencyBps/);
    expect(() => validateEnergyPlant(thermal({ intermittencyBps: -1 }))).toThrow(/intermittencyBps/);
    expect(() => validateEnergyPlant(thermal({ capacityMwhPerMonth: 0 }))).toThrow(/positive whole MWh\/month or null/);
  });

  it('computes output bounded by capacity and availability (intermittency)', () => {
    expect(energyOutput(thermal(), 2)).toBe(2000); // dispatchable: availability 100%
    const wind = thermal({ kind: 'wind', fuelInputId: null, capacityMwhPerMonth: 1000, intermittencyBps: 3000 });
    expect(energyOutput(wind, 1)).toBe(700);       // 1000 × 70%
    expect(energyOutput(thermal({ status: 'paused' }), 1)).toBe(0);
    expect(energyOutput(thermal({ capacityMwhPerMonth: null }), 1)).toBe(0);
  });

  it('derives fuel required from efficiency and never over-creates energy', () => {
    const fuel = fuelRequired(thermal(), 1000);   // 1000 × 10000 / 4000 = 2500
    expect(fuel).toBe(2500);
    expect(Math.floor((fuel * thermal().efficiencyBps) / 10000)).toBe(1000); // conservation
    expect(fuelRequired(thermal({ kind: 'solar', fuelInputId: null }), 1000)).toBe(0);
  });
});
