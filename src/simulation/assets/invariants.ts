import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { ASSETS_VERSION, assetAvailability, type AssetSourceProvenance } from './model';

const OPERATING_STATUSES = ['operational', 'degraded', 'out_of_service', 'under_construction', 'decommissioned', 'unavailable'] as const;
const PHYSICAL_CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'critical', 'unavailable'] as const;
const AVAILABILITIES = ['available', 'partial', 'unavailable'] as const;
const COVERAGE_STATUSES = ['sourced', 'derived', 'modelled', 'partial', 'unavailable', 'not_applicable'] as const;
/** Full provenance with coherent, non-future dates (0.24.9D): every field present,
 *  both dates valid, the reference date not after the retrieval date, and the
 *  reference date not in the future of the simulation. */
const hasValidProvenance = (provenance: AssetSourceProvenance | undefined, stateDate: string): boolean => provenance !== undefined
  && [provenance.publisher, provenance.dataset, provenance.url, provenance.referenceDate, provenance.retrievedAt, provenance.licence, provenance.attribution, provenance.limitation]
    .every(value => typeof value === 'string' && value.trim() !== '')
  && validDate(provenance.referenceDate) && validDate(provenance.retrievedAt)
  && provenance.referenceDate <= provenance.retrievedAt
  && provenance.referenceDate <= stateDate;

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
      } else {
        if (capacity.amount === undefined || !Number.isSafeInteger(capacity.amount) || capacity.amount < 0) errors.push(`Asset ${id} has an invalid capacity amount.`);
        if ((capacity.coverage === 'sourced' || capacity.coverage === 'derived' || capacity.coverage === 'partial') && !hasValidProvenance(capacity.provenance, state.date)) {
          errors.push(`Asset ${id} has sourced/derived/partial capacity without full provenance.`);
        }
        if (capacity.coverage === 'not_applicable' && (typeof capacity.limitation !== 'string' || !capacity.limitation.trim())) {
          errors.push(`Asset ${id} has not_applicable capacity without an explicit justification.`);
        }
      }
      const coverage = asset.coverage;
      if (!coverage || !COVERAGE_STATUSES.includes(coverage.status)) errors.push(`Asset ${id} has an invalid coverage.`);
      else {
        if ((coverage.status === 'sourced' || coverage.status === 'derived' || coverage.status === 'partial') && !hasValidProvenance(coverage.provenance, state.date)) {
          errors.push(`Asset ${id} has sourced/derived/partial coverage without full provenance.`);
        }
        if (coverage.status === 'not_applicable' && (typeof coverage.justification !== 'string' || !coverage.justification.trim())) {
          errors.push(`Asset ${id} has not_applicable coverage without an explicit justification.`);
        }
      }
      // 0.24.6D/0.24.7 — operating status, physical condition and availability stay
      // compatible: a worn (poor/critical) asset loses availability even while operational.
      const expectedAvailability = assetAvailability(asset.operatingStatus, asset.physicalCondition);
      if (asset.availability !== expectedAvailability) errors.push(`Asset ${id} has incompatible operating status and availability.`);
      if (asset.repairReadyOn !== undefined && !validDate(asset.repairReadyOn)) errors.push(`Asset ${id} has an invalid repair schedule.`);
    }
    const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed', 'cancelled'];
    const seenProjects = new Set<string>();
    for (const pid of assets.projectOrder) {
      if (seenProjects.has(pid)) { errors.push(`Project order contains a duplicated id ${pid}.`); continue; }
      seenProjects.add(pid);
      if (!assets.projects[pid]) errors.push(`Project order references an unknown project ${pid}.`);
    }
    for (const [pid, project] of Object.entries(assets.projects)) {
      if (!seenProjects.has(pid)) errors.push(`Project ${pid} exists but is absent from projectOrder.`);
      if (project.projectId !== pid || !/^project\.\d{8}$/.test(pid)) { errors.push(`Project ${pid} has an invalid identity.`); continue; }
      const pseq = Number(pid.slice(8));
      if (!Number.isSafeInteger(pseq) || pseq >= assets.nextProjectSequence) errors.push(`Project ${pid} has an out-of-range sequence.`);
      if (!PROJECT_STATUSES.includes(project.status)) errors.push(`Project ${pid} has an invalid status.`);
      if (typeof project.countryId !== 'string' || !context.countryIds.has(project.countryId)) errors.push(`Project ${pid} references an unknown Country ${String(project.countryId)}.`);
      if (typeof project.regionId !== 'string' || !context.regionIds.has(project.regionId)) errors.push(`Project ${pid} references an unknown Region ${String(project.regionId)}.`);
      if (typeof project.assetTypeId !== 'string' || !project.assetTypeId.trim()) errors.push(`Project ${pid} has an invalid asset type.`);
      if (typeof project.title !== 'string' || !project.title.trim()) errors.push(`Project ${pid} has an invalid title.`);
      if (!validDate(project.proposedOn) || project.proposedOn > state.date) errors.push(`Project ${pid} has an invalid proposal date.`);
      if (typeof project.proposedByPersonId !== 'string' || !state.governance.persons[project.proposedByPersonId]) errors.push(`Project ${pid} has an invalid proposer.`);
      // Lifecycle residue: each status admits exactly its own dated transitions.
      if (project.status === 'planned' && (project.authorizedOn || project.startedOn || project.completedOn || project.cancelledOn || project.resultingAssetId)) errors.push(`Planned project ${pid} carries lifecycle residue.`);
      if (project.status === 'active' && (!project.authorizedOn || !project.authorizedByPersonId || !project.startedOn || project.pausedOn || project.completedOn || project.cancelledOn)) errors.push(`Active project ${pid} has an incoherent lifecycle.`);
      if (project.status === 'paused' && (!project.authorizedOn || !project.startedOn || !project.pausedOn || project.completedOn || project.cancelledOn)) errors.push(`Paused project ${pid} has an incoherent lifecycle.`);
      if (project.status === 'completed' && (!project.authorizedOn || !project.startedOn || !project.completedOn || !project.resultingAssetId || project.cancelledOn)) errors.push(`Completed project ${pid} has an incoherent lifecycle.`);
      if (project.status === 'cancelled' && (!project.cancelledOn || !project.cancelledByPersonId || project.completedOn || project.resultingAssetId)) errors.push(`Cancelled project ${pid} has an incoherent lifecycle.`);
      if (project.authorizedByPersonId && !state.governance.persons[project.authorizedByPersonId]) errors.push(`Project ${pid} has an invalid authorizer.`);
      if (project.cancelledByPersonId && !state.governance.persons[project.cancelledByPersonId]) errors.push(`Project ${pid} has an invalid canceller.`);
      if (project.resultingAssetId) {
        const resultAsset = assets.assets[project.resultingAssetId];
        if (!resultAsset) errors.push(`Project ${pid} references an unknown resulting asset.`);
        else if (resultAsset.regionId !== project.regionId || resultAsset.assetTypeId !== project.assetTypeId) errors.push(`Project ${pid} resulting asset does not match the project site or type.`);
      }
      const pcoverage = project.coverage;
      if (!pcoverage || !COVERAGE_STATUSES.includes(pcoverage.status)) errors.push(`Project ${pid} has an invalid coverage.`);
      else {
        if ((pcoverage.status === 'sourced' || pcoverage.status === 'derived' || pcoverage.status === 'partial') && !hasValidProvenance(pcoverage.provenance, state.date)) {
          errors.push(`Project ${pid} has sourced/derived/partial coverage without full provenance.`);
        }
        if (pcoverage.status === 'not_applicable' && (typeof pcoverage.justification !== 'string' || !pcoverage.justification.trim())) {
          errors.push(`Project ${pid} has not_applicable coverage without an explicit justification.`);
        }
      }
      // 0.24.3A — explicit cost estimate, kept distinct from the committed amount.
      if (project.estimatedCostUsd !== undefined && (!Number.isSafeInteger(project.estimatedCostUsd) || project.estimatedCostUsd < 0)) errors.push(`Project ${pid} has an invalid cost estimate.`);
      if (project.committedUsd !== undefined && (!Number.isSafeInteger(project.committedUsd) || project.committedUsd < 0 || project.estimatedCostUsd === undefined || project.committedUsd > project.estimatedCostUsd)) errors.push(`Project ${pid} has an invalid cost commitment.`);
      // 0.24.4A/C — labour reservation and cumulative funded work.
      if (project.reservedWorkers !== undefined && (!Number.isSafeInteger(project.reservedWorkers) || project.reservedWorkers < 0)) errors.push(`Project ${pid} has an invalid worker reservation.`);
      if (project.completedWorkUsd !== undefined && (!Number.isSafeInteger(project.completedWorkUsd) || project.completedWorkUsd < 0 || (project.committedUsd !== undefined && project.completedWorkUsd > project.committedUsd))) errors.push(`Project ${pid} has invalid work progress.`);
      if (project.status !== 'active' && project.status !== 'paused' && project.reservedWorkers !== undefined) errors.push(`Project ${pid} carries a worker reservation in a non-working status.`);
      if (project.status === 'planned' && project.completedWorkUsd !== undefined) errors.push(`Planned project ${pid} carries work progress before starting.`);
    }
    return errors;
  },
};
