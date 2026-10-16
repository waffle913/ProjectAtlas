import { describe, it, expect } from 'vitest';
import {
  validateAdoption, investmentSteps, equipmentSteps, advanceAdoption, type TechnologyAdoption,
} from '../industry/diffusion';

const adoption = (over: Partial<TechnologyAdoption> = {}): TechnologyAdoption => ({
  id: 'a1', technologyId: 't1', adoptionBps: 0, investmentPerStep: 100,
  equipmentPerStep: { machines: 2 }, diffusionBpsPerStep: 500,
  fundedInvestment: 1000, availableEquipment: { machines: 10 },
  ...over,
});

describe('industry diffusion and adoption (0.28.6)', () => {
  it('validates an adoption record and rejects malformed ones', () => {
    expect(() => validateAdoption(adoption())).not.toThrow();
    expect(() => validateAdoption(adoption({ adoptionBps: 20000 }))).toThrow(/adoptionBps/);
    expect(() => validateAdoption(adoption({ diffusionBpsPerStep: 0 }))).toThrow(/diffusionBpsPerStep/);
    expect(() => validateAdoption(adoption({ equipmentPerStep: { '': 1 } }))).toThrow(/non-empty product ids/);
  });

  it('advances bounded by investment, equipment and the bps ceiling (no global GDP bonus)', () => {
    const r = advanceAdoption(adoption()); // investment 10 steps, equipment 5 steps -> 5
    expect(r.steps).toBe(5);
    expect(r.adoptionBps).toBe(2500);
    expect(r.investmentSpent).toBe(500);
  });

  it('caps adoption at 10,000 bps', () => {
    const r = advanceAdoption(adoption({ adoptionBps: 9500, fundedInvestment: 10000 }));
    expect(r.adoptionBps).toBe(10000);
  });

  it('rejects fractional investment', () => {
    expect(() => advanceAdoption(adoption({ fundedInvestment: 1.5 }))).toThrow(/non-negative whole-USD/);
  });

  it('computes investment and equipment steps', () => {
    expect(investmentSteps(adoption())).toBe(10);
    expect(equipmentSteps(adoption())).toBe(5);
    expect(equipmentSteps(adoption({ equipmentPerStep: {} }))).toBe(0);
  });
});
