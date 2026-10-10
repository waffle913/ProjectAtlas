import type { SimulationInvariant } from '../invariants';
import { ASSETS_VERSION } from './model';

const OPERATING_STATUSES = ['operational', 'degraded', 'out_of_service', 'under_construction', 'decommissioned', 'unavailable'] as const;
const PHYSICAL_CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'critical', 'unavailable'] as const;
const AVAILABILITIES = ['available', 'partial', 'unavailable'] as const;
const COVERAGE_STATUSES = ['sourced', 'modelled', 'partial', 'unavailable'] as const;

/** 0.24.1C — the assets domain is the single canonical owner of physical-asset
 *  records. This invariant guards identity permanence, honest coverage, and the
 *  permanent Region reference — never a second territorial truth. */
export const assetsInvariant: SimulationInvariant = {
  id: 'assets-0.24-integrity',
  check: (state, context) => {
    const errors: string[] = [];
    const assets = state.assets;
    if (!assets || assets.version !== ASSETS_VERSION) return ['Malformed assets state.'];
    if (assets.initializedOn !== undefined && assets.initializedOn > state.date) errors.push('Assets domain is initialized after the current date.');
    if (!Number.isSafeInteger(assets.nextAssetSequence) || assets.nextAssetSequence < 0) errors.push('Assets domain has an invalid asset sequence.');
    const seen = new Set<string>();
    for (const id of assets.assetOrder) {
      if (seen.has(id)) { errors.push(`Asset order contains a duplicated id ${id}.`); continue; }
      seen.add(id);
      if (!assets.assets[id]) errors.push(`Asset order references an unknown asset ${id}.`);
    }
    for (const [id, asset] of Object.entries(assets.assets)) {
      if (!seen.has(id)) errors.push(`Asset ${id} exists but is absent from assetOrder.`);
      if (asset.assetId !== id || !/^asset\.\d{8}$/.test(id)) { errors.push(`Asset ${id} has an invalid identity.`); continue; }
      const sequence = Number(id.slice(6));
      if (!Number.isSafeInteger(sequence) || sequence >= assets.nextAssetSequence) errors.push(`Asset ${id} has an out-of-range sequence.`);
      if (typeof asset.assetTypeId !== 'string' || !asset.assetTypeId.trim()) errors.push(`Asset ${id} has an invalid asset type.`);
      // Permanent Region reference: exactly one canonical Region identity, never a mutable owner.
      if (typeof asset.regionId !== 'string' || !context.regionIds.has(asset.regionId)) errors.push(`Asset ${id} references an unknown Region ${String(asset.regionId)}.`);
      if (!OPERATING_STATUSES.includes(asset.operatingStatus)) errors.push(`Asset ${id} has an invalid operating status.`);
      if (!AVAILABILITIES.includes(asset.availability)) errors.push(`Asset ${id} has an invalid availability.`);
      if (asset.physicalCondition !== undefined && !PHYSICAL_CONDITIONS.includes(asset.physicalCondition)) errors.push(`Asset ${id} has an invalid physical condition.`);
      const capacity = asset.capacity;
      if (!capacity || typeof capacity.unit !== 'string' || !capacity.unit.trim() || !COVERAGE_STATUSES.includes(capacity.coverage)) {
        errors.push(`Asset ${id} has an invalid capacity record.`);
      } else if (capacity.coverage === 'unavailable') {
        // unavailable is never zero: an unavailable capacity records no numeric amount.
        if (capacity.amount !== undefined) errors.push(`Asset ${id} records a numeric capacity while its coverage is unavailable.`);
      } else if (capacity.amount === undefined || !Number.isSafeInteger(capacity.amount) || capacity.amount < 0) {
        errors.push(`Asset ${id} has an invalid capacity amount.`);
      }
      const coverage = asset.coverage;
      if (!coverage || !COVERAGE_STATUSES.includes(coverage.status)) errors.push(`Asset ${id} has an invalid coverage.`);
      else if ((coverage.status === 'sourced' || coverage.status === 'partial') && (!coverage.provenance || typeof coverage.provenance.publisher !== 'string' || !coverage.provenance.publisher.trim())) {
        errors.push(`Asset ${id} has sourced/partial coverage without provenance.`);
      }
    }
    return errors;
  },
};
