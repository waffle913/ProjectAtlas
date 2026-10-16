import { describe, it, expect } from 'vitest';
import {
  validateEducationEstablishment, enrol, validatePathway, graduates,
  type EducationEstablishment, type Pathway,
} from '../services/education';

const school = (over: Partial<EducationEstablishment> = {}): EducationEstablishment => ({
  id: 's1', regionId: 'region-7', capacity: 200, personnelPerUnit: 4, status: 'operating',
  ...over,
});
const pathway = (over: Partial<Pathway> = {}): Pathway => ({
  id: 'p1', durationMonths: 12, enrolment: 50, monthsElapsed: 0,
  ...over,
});

describe('education and training (0.29.4)', () => {
  it('validates an establishment and rejects malformed ones', () => {
    expect(() => validateEducationEstablishment(school())).not.toThrow();
    expect(() => validateEducationEstablishment(school({ capacity: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateEducationEstablishment(school({ status: 'destroyed' as never }))).toThrow(/Unknown status/);
  });

  it('enrols bounded by capacity and personnel; the shortfall is a backlog', () => {
    const r = enrol(school(), 150, 800);
    expect(r.enrolled).toBe(150);
    expect(r.backlog).toBe(0);
    expect(r.personnelUsed).toBe(600);
    const r2 = enrol(school(), 200, 40); // 40 / 4 = 10
    expect(r2.enrolled).toBe(10);
    expect(r2.backlog).toBe(190);
  });

  it('validates a pathway and graduates only after the full duration', () => {
    expect(() => validatePathway(pathway())).not.toThrow();
    expect(graduates(pathway())).toBe(false);
    expect(graduates(pathway({ monthsElapsed: 12 }))).toBe(true);
    expect(() => validatePathway(pathway({ monthsElapsed: 13 }))).toThrow(/within \[0, durationMonths\]/);
  });
});
