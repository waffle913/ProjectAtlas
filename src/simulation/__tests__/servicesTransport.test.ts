import { describe, it, expect } from 'vitest';
import {
  validateTransportAsset, deliverTransport, type TransportAsset,
} from '../services/transport';

const asset = (over: Partial<TransportAsset> = {}): TransportAsset => ({
  id: 't1', regionId: 'region-7', assetId: 'asset-road-1', capacityPerMonth: 500,
  energyPerUnit: 2, personnelPerUnit: 1, status: 'operating',
  ...over,
});

describe('civil transport/infrastructure (0.29.7)', () => {
  it('validates a transport asset and rejects malformed ones', () => {
    expect(() => validateTransportAsset(asset())).not.toThrow();
    expect(() => validateTransportAsset(asset({ assetId: '' }))).toThrow(/non-empty 0.24 asset id/);
    expect(() => validateTransportAsset(asset({ capacityPerMonth: 0 }))).toThrow(/positive whole number or null/);
  });

  it('delivers bounded by capacity, energy and personnel; the shortfall is a backlog', () => {
    const r = deliverTransport(asset(), 300, 1000, 500);
    expect(r.status).toBe('computed');
    expect(r.delivered).toBe(300);
    expect(r.shortfall).toBe(0);
    expect(r.energyUsed).toBe(600);
    expect(r.personnelUsed).toBe(300);
  });

  it('bounds delivery by energy availability', () => {
    const r = deliverTransport(asset(), 500, 100, 500); // energy 100 / 2 = 50
    expect(r.delivered).toBe(50);
    expect(r.shortfall).toBe(450);
  });

  it('A7: unavailable capacity is typed unavailable, never a fabricated shortage', () => {
    const paused = deliverTransport(asset({ status: 'paused' }), 50, 1000, 500);
    expect(paused).toMatchObject({ status: 'paused', delivered: 0, shortfall: null });
    const unknown = deliverTransport(asset({ capacityPerMonth: null }), 50, 1000, 500);
    expect(unknown).toMatchObject({ status: 'unavailable', delivered: 0, shortfall: null });
  });
});
