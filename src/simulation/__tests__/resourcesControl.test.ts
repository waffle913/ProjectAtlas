import { describe, it, expect } from 'vitest';
import {
  validateInstallationControl, isOccupied, sovereignControlRetained,
  exploitAuthorized, applyDamage, repairCapacity, type InstallationControl,
} from '../resources/control';

const control = (over: Partial<InstallationControl> = {}): InstallationControl => ({
  installationId: 'mine-a', sovereignOwnerId: 'country-x', operatorId: 'country-x',
  controllerId: 'country-x', occupierId: null,
  ...over,
});

describe('resources war/sovereignty/damage (0.27.8)', () => {
  it('validates control facts and requires each id', () => {
    expect(() => validateInstallationControl(control())).not.toThrow();
    expect(() => validateInstallationControl(control({ installationId: '' }))).toThrow(/non-empty installation id/);
    expect(() => validateInstallationControl(control({ sovereignOwnerId: '' }))).toThrow(/sovereign owner id/);
    expect(() => validateInstallationControl(control({ controllerId: '' }))).toThrow(/controller id/);
  });

  it('keeps sovereignty, control and occupation distinct', () => {
    expect(isOccupied(control())).toBe(false);
    expect(isOccupied(control({ occupierId: 'country-z' }))).toBe(true);
    expect(sovereignControlRetained(control())).toBe(true);
    expect(sovereignControlRetained(control({ controllerId: 'actor-y' }))).toBe(false);
    expect(sovereignControlRetained(control({ occupierId: 'country-z' }))).toBe(false);
  });

  it('authorizes exploitation only for the effective controller (not sovereignty alone under occupation)', () => {
    expect(exploitAuthorized(control())).toBe(true);           // operator == controller == sovereign
    expect(exploitAuthorized(control({ operatorId: 'other' }))).toBe(false);
    const occupied = control({ occupierId: 'country-z', controllerId: 'country-z' });
    expect(sovereignControlRetained(occupied)).toBe(false);    // occupation is not sovereignty
    expect(exploitAuthorized(control({ controllerId: 'country-z', operatorId: 'country-z' }))).toBe(true);
  });

  it('applies damage as a bounded reduction that never goes negative', () => {
    expect(applyDamage(1000, 2500)).toBe(750);
    expect(applyDamage(1000, 10000)).toBe(0);
    expect(applyDamage(null, 2500)).toBeNull();
    expect(() => applyDamage(1000, 20000)).toThrow(/damageBps/);
  });

  it('repairs explicitly, bounded by original capacity (no auto-repair)', () => {
    expect(repairCapacity(1000, 750, 100)).toBe(850);
    expect(repairCapacity(1000, 950, 100)).toBe(1000);  // bounded
    expect(() => repairCapacity(1000, 1200, 10)).toThrow(/cannot exceed the original capacity/);
  });

  it('validates damageBps even when capacity is null', () => {
    expect(() => applyDamage(null, 20000)).toThrow(/damageBps/);
  });
});
