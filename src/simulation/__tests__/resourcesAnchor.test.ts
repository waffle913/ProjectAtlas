import { describe, it, expect } from 'vitest';
import {
  ANCHOR_PRECISIONS, validateRegionAnchor, anchorToRegion, unavailableAnchor,
  type RegionAnchorProvenance,
} from '../resources/anchor';

const provenance = (): RegionAnchorProvenance => ({
  publisher: 'p', dataset: 'd', url: 'https://example.invalid', referenceDate: '2024-01-01',
  retrievedAt: '2026-01-01', licence: 'l', attribution: 'a', limitation: 'lim',
});

describe('resources territorial anchoring (0.27.2)', () => {
  it('anchors a subject to a whole Region (no intra-region position assumed)', () => {
    const a = anchorToRegion('mine-a', 'region-7', 'https://example.invalid/geometry', provenance());
    expect(a.subjectId).toBe('mine-a');
    expect(a.regionId).toBe('region-7');
    expect(a.precision).toBe('region');
    expect(a.geometryReference).toBe('https://example.invalid/geometry');
    expect(a.provenance?.licence).toBe('l');
  });

  it('declares the three anchor precisions', () => {
    expect(ANCHOR_PRECISIONS).toEqual(['region', 'documented_intra_region', 'unavailable']);
  });

  it('rejects an anchor without a subject or a permanent Region id', () => {
    expect(() => validateRegionAnchor(anchorToRegion('', 'region-7'))).toThrow(/non-empty subject id/);
    expect(() => validateRegionAnchor(anchorToRegion('mine-a', ''))).toThrow(/non-empty permanent Region id/);
  });

  it('blocks documented intra-region anchoring without geometry + provenance (BLOCKED_DESIGN)', () => {
    expect(() => validateRegionAnchor({ subjectId: 'mine-a', regionId: 'region-7', precision: 'documented_intra_region', geometryReference: null }))
      .toThrow(/documented_intra_region anchoring requires/);
  });

  it('keeps an unavailable anchor free of any fabricated geometry or provenance', () => {
    const a = unavailableAnchor('mine-a');
    expect(a.precision).toBe('unavailable');
    expect(a.regionId).toBe('');
    expect(a.geometryReference).toBeNull();
    expect(a.provenance).toBeUndefined();
    expect(() => validateRegionAnchor({ subjectId: 'mine-a', regionId: '', precision: 'unavailable', geometryReference: 'x' }))
      .toThrow(/must not carry a geometry reference/);
  });

  it('rejects provenance with invalid dates', () => {
    expect(() => validateRegionAnchor({ ...anchorToRegion('mine-a', 'region-7'), provenance: { ...provenance(), referenceDate: 'not-a-date' } }))
      .toThrow(/valid simulation dates/);
  });
});
