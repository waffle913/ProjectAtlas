import { describe, it, expect } from 'vitest';
import {
  INSTALLATION_KINDS, INSTALLATION_STATUSES, validateInstallation, extractCapacity,
  type ExtractionInstallation,
} from '../resources/installation';

const inst = (over: Partial<ExtractionInstallation> = {}): ExtractionInstallation => ({
  id: 'mine-a', kind: 'mine', regionId: 'region-7', resourceId: 'copper',
  capacityPerMonth: 100, personnelRequired: 50, maintenancePerMonth: 1000,
  inputs: { energy: 10 }, status: 'operating', ownerCountryId: 'country-x',
  operatorId: 'actor-y', controllerId: 'actor-y',
  ...over,
});

describe('resources extraction installations (0.27.3)', () => {
  it('declares the installation kinds and statuses', () => {
    expect(INSTALLATION_KINDS).toEqual(['mine', 'well', 'quarry']);
    expect(INSTALLATION_STATUSES).toEqual(['planned', 'operating', 'paused', 'decommissioned', 'unavailable']);
  });

  it('accepts a valid operating installation', () => {
    expect(() => validateInstallation(inst())).not.toThrow();
  });

  it('keeps ownership, exploitation and control as three distinct ids', () => {
    const i = inst();
    expect(i.ownerCountryId).toBe('country-x');
    expect(i.operatorId).toBe('actor-y');
    expect(i.controllerId).toBe('actor-y');
    // Distinct concepts, each required and non-empty.
    expect(() => validateInstallation({ ...i, ownerCountryId: '' })).toThrow(/sovereign owner id/);
    expect(() => validateInstallation({ ...i, operatorId: '' })).toThrow(/operator id/);
    expect(() => validateInstallation({ ...i, controllerId: '' })).toThrow(/controller id/);
  });

  it('rejects malformed installations (kind, region, resource, capacity, status)', () => {
    expect(() => validateInstallation(inst({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateInstallation(inst({ kind: 'refinery' as never }))).toThrow(/Unknown installation kind/);
    expect(() => validateInstallation(inst({ regionId: '' }))).toThrow(/non-empty permanent Region id/);
    expect(() => validateInstallation(inst({ resourceId: '' }))).toThrow(/non-empty resource id/);
    expect(() => validateInstallation(inst({ capacityPerMonth: 0 }))).toThrow(/positive whole quantity or null/);
    expect(() => validateInstallation(inst({ status: 'destroyed' as never }))).toThrow(/Unknown installation status/);
    expect(() => validateInstallation(inst({ inputs: { energy: -1 } }))).toThrow(/non-negative whole quantity/);
  });

  it('produces output only when operating with an admitted capacity', () => {
    expect(extractCapacity(inst(), 3)).toBe(300);
    expect(extractCapacity(inst({ status: 'paused' }), 3)).toBe(0);
    expect(extractCapacity(inst({ capacityPerMonth: null }), 3)).toBe(0);
    expect(() => extractCapacity(inst(), 0)).toThrow(/positive whole number/);
  });

  it('allows an unavailable capacity (null) without treating it as zero output', () => {
    const i = inst({ capacityPerMonth: null, status: 'unavailable' });
    expect(i.capacityPerMonth).toBeNull();
    expect(extractCapacity(i, 1)).toBe(0);
  });
});
