import { describe, it, expect } from 'vitest';
import {
  validateNetworkLink, linkCapacity, deliverEnergy, type NetworkLink,
} from '../resources/network';

const link = (over: Partial<NetworkLink> = {}): NetworkLink => ({
  id: 'l1', fromRegionId: 'region-a', toRegionId: 'region-b',
  capacityMwhPerMonth: 1000, availabilityBps: 10000, status: 'operating',
  ...over,
});

describe('resources networks and accessibility (0.27.6)', () => {
  it('validates a network link and rejects malformed ones', () => {
    expect(() => validateNetworkLink(link())).not.toThrow();
    expect(() => validateNetworkLink(link({ fromRegionId: '' }))).toThrow(/non-empty source Region id/);
    expect(() => validateNetworkLink(link({ toRegionId: 'region-a' }))).toThrow(/distinct source and target Regions/);
    expect(() => validateNetworkLink(link({ capacityMwhPerMonth: 0 }))).toThrow(/positive whole MWh\/month or null/);
    expect(() => validateNetworkLink(link({ availabilityBps: 20000 }))).toThrow(/availabilityBps/);
  });

  it('computes link capacity bounded by availability', () => {
    expect(linkCapacity(link(), 2)).toBe(2000);
    expect(linkCapacity(link({ availabilityBps: 5000 }), 1)).toBe(500);
    expect(linkCapacity(link({ status: 'paused' }), 1)).toBe(0);
    expect(linkCapacity(link({ capacityMwhPerMonth: null }), 1)).toBe(0);
  });

  it('delivers only up to path capacity and reports the curtailment bottleneck', () => {
    const result = deliverEnergy([link()], 'region-a', 'region-b', 1500, 1);
    expect(result.delivered).toBe(1000);
    expect(result.curtailed).toBe(500);
    expect(result.pathIds).toEqual(['l1']);
  });

  it('delivers nothing without a connection (no fabricated flow)', () => {
    const result = deliverEnergy([link()], 'region-a', 'region-c', 500, 1);
    expect(result.delivered).toBe(0);
    expect(result.curtailed).toBe(500);
    expect(result.pathIds).toEqual([]);
  });

  it('rejects a fractional requested MWh', () => {
    expect(() => deliverEnergy([link()], 'region-a', 'region-b', 1.5, 1)).toThrow(/non-negative whole number/);
  });
});
