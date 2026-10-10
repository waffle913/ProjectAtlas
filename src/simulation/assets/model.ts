/**
 * 0.24.1A — Canonical vocabulary for physical-asset identity.
 *
 * This module defines the permanent identity types and the minimal data
 * contracts that the later 0.24 sub-blocks (construction projects, financing,
 * work, inputs, completion, damage/repair, war/control, data and queries)
 * will build on. It is vocabulary only:
 *
 * - It is not integrated into `SimulationState`, the save schema, migrations,
 *   the scheduler, the RNG or any other engine system.
 * - It defines no behavior, no ID generation, no registry and no real data.
 *   Deterministic ID generation and the static asset-type registry arrive in
 *   later sub-blocks.
 *
 * Contractual rules (see AGENTS.md):
 *
 * - `AssetId`, `ConstructionProjectId` and `AssetTypeId` are permanent and
 *   opaque. They must never be derived from an asset name, an array index,
 *   geometry, import order, a Region name, or ISO codes alone.
 * - A physical asset is attached to exactly one permanent Region identity.
 *   An asset identity never stores a second territorial truth: it never
 *   copies current sovereignty (canonical source: `state.regionOwnership`),
 *   effective control or military occupation, and it never links to mutable
 *   geometry or an `ownerRegionId`. The same asset keeps its identity when
 *   its Region changes sovereign, effective controller or military occupant.
 * - Owner and operator are distinct roles; the same actor may hold both, and
 *   actors are not assumed to be Countries. `AssetActorId` is a minimal
 *   explicit opaque reference that later sub-blocks bind to existing identity
 *   spaces (Countries, public bodies, companies, organisations). No
 *   economic-organisation engine is introduced here.
 * - `unavailable` never means zero, absent or non-existent. An identity whose
 *   real-world coverage is unavailable is still an identity; later systems
 *   must never turn it into a zero capacity, a missing owner or a deleted
 *   asset.
 *
 * Provenance follows the per-domain source contracts already used elsewhere
 * (e.g. `TradeSource`, `MilitarySource`); no generic provenance contract
 * exists to reuse, so the assets domain declares its own minimal one.
 */

/** Permanent opaque identifier of one physical asset. Never derived from the asset name, an array index, geometry, import order, a Region name, or ISO codes alone. */
export type AssetId = string;

/**
 * Permanent opaque identifier of one construction project.
 * Introduced in 0.24.1A; construction-project records belong to a later
 * 0.24 sub-block and are deliberately not defined here.
 */
export type ConstructionProjectId = string;

/**
 * Permanent opaque identifier of one data-driven asset type, to be bound to a
 * static registry in a later sub-block. No complete gameplay taxonomy is
 * invented here.
 */
export type AssetTypeId = string;

/**
 * Minimal explicit reference to an actor that may own or operate a physical
 * asset: a Country, a public body, a company or another organisation. The
 * reference is opaque in 0.24.1A and is bound to concrete identity spaces in a
 * later sub-block.
 */
export type AssetActorId = string;

/**
 * Real-world coverage status of an asset identity datum.
 * `'unavailable'` never means zero, absent or non-existent: it records that
 * the datum could not be sourced, not that the asset, its type or its owner
 * does not exist.
 */
export type AssetCoverageStatus = 'sourced' | 'derived' | 'modelled' | 'partial' | 'unavailable' | 'not_applicable';

/**
 * Dated, traceable provenance of a real-world datum, following the provenance
 * obligations used across ProjectAtlas (publisher, dataset, URL, reference
 * date, retrieval date, licence, attribution, limitation).
 */
export interface AssetSourceProvenance {
  publisher: string;
  dataset: string;
  url: string;
  referenceDate: string;
  retrievedAt: string;
  licence: string;
  attribution: string;
  limitation: string;
}

/**
 * Coverage of an asset identity: its status plus the provenance of any sourced
 * or derived part. Provenance is required for `'sourced'`, `'derived'` and
 * `'partial'` coverage and is absent for `'modelled'`, `'unavailable'` and
 * justified `'not_applicable'`, where no real-world datum supports the record.
 */
export interface AssetCoverageRecord {
  status: AssetCoverageStatus;
  provenance?: AssetSourceProvenance;
  /** Required explicit justification when coverage is `'not_applicable'`. */
  justification?: string;
}

/**
 * Minimal identity of one physical asset — 0.24.1A scope only.
 *
 * Deliberately excluded from this record (later sub-blocks): capacity,
 * production, operational state, maintenance, damage, cost, workers,
 * materials, progression, financing, commissioning date, military control and
 * economic effects.
 */
export interface AssetIdentityRecord {
  /** Permanent asset identity. */
  assetId: AssetId;
  /** Permanent data-driven asset type assigned to this asset. */
  assetTypeId: AssetTypeId;
  /**
   * Exactly one permanent Region identity from the canonical registry. Asset
   * identity never stores a second territorial truth: current sovereignty
   * (`state.regionOwnership`), effective control and military occupation stay
   * canonical elsewhere, and the asset keeps this identity across any change
   * of sovereign, controller or occupier.
   */
  regionId: string;
  /** Known owner, when recorded. Absence does not assert that no owner exists. */
  ownerActorId?: AssetActorId;
  /** Known operator, when recorded; may equal or differ from the owner. */
  operatorActorId?: AssetActorId;
  /** Real-world coverage and provenance of this identity. */
  coverage: AssetCoverageRecord;
}

// ---------------------------------------------------------------------------
// 0.24.1B — Physical state vocabulary.
// ---------------------------------------------------------------------------

/** Operating status of a physical asset. `'unavailable'` means the status could
 *  not be sourced, never that the asset is absent or has zero capacity. */
export type AssetOperatingStatus = 'operational' | 'degraded' | 'out_of_service' | 'under_construction' | 'decommissioned' | 'unavailable';

/** Physical condition of an asset when a source provides it. */
export type AssetPhysicalCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unavailable';

/** Whether the asset's capacity is currently usable. `'unavailable'` never means zero. */
export type AssetAvailability = 'available' | 'partial' | 'unavailable';

/** Physical capacity of an asset: a non-negative quantity with a physical unit
 *  and honest coverage. `amount` is present only when coverage is not
 *  `'unavailable'` — unavailable is never recorded as a zero quantity. */
export interface AssetCapacityRecord {
  amount?: number;
  unit: string;
  coverage: AssetCoverageStatus;
  /** Provenance required when coverage is sourced/derived/partial. */
  provenance?: AssetSourceProvenance;
  limitation?: string;
}

/** Physical state of an asset (0.24.1B): operating status, capacity,
 *  availability and — when a source provides it — physical condition. */
export interface AssetPhysicalStateRecord {
  operatingStatus: AssetOperatingStatus;
  capacity: AssetCapacityRecord;
  availability: AssetAvailability;
  physicalCondition?: AssetPhysicalCondition;
}

/** Canonical record of one physical asset: identity (0.24.1A) plus physical
 *  state (0.24.1B). */
export interface AssetRecord extends AssetIdentityRecord, AssetPhysicalStateRecord {
  /** 0.24.7B — the date a scheduled repair completes; while set and in the
   *  future the asset's capacity stays unavailable. Cleared on restoration. */
  repairReadyOn?: string;
  /** 0.24.6D — date of the last funded maintenance cycle. */
  lastMaintainedOn?: string;
  /** 0.24.6D — consecutive months of unfunded maintenance, driving slow physical
   *  condition wear (one step every MAINTENANCE_WEAR_MONTHS unfunded months). */
  unfundedMaintenanceMonths?: number;
}

// ---------------------------------------------------------------------------
// 0.24.1C — Canonical assets state.
// ---------------------------------------------------------------------------

export const ASSETS_VERSION = 'assets-0.24-v1' as const;

/** The single canonical owner of all physical-asset records. No parallel store. */
export interface AssetsState {
  version: typeof ASSETS_VERSION;
  initializedOn?: string;
  assets: Record<AssetId, AssetRecord>;
  assetOrder: AssetId[];
  nextAssetSequence: number;
  projects: Record<ConstructionProjectId, ConstructionProjectRecord>;
  projectOrder: ConstructionProjectId[];
  nextProjectSequence: number;
}

export const emptyAssets = (initializedOn?: string): AssetsState => ({
  version: ASSETS_VERSION,
  initializedOn,
  assets: {},
  assetOrder: [],
  nextAssetSequence: 0,
  projects: {},
  projectOrder: [],
  nextProjectSequence: 0,
});

/** Deterministic permanent asset identity: opaque, sequence-derived only. */
export const assetId = (sequence: number): AssetId => `asset.${sequence.toString().padStart(8, '0')}`;

// ---------------------------------------------------------------------------
// 0.24.2A/B — Construction projects.
// ---------------------------------------------------------------------------

/** Lifecycle of a construction project. The project and the finished asset are
 *  distinct: a project is the plan/site; an asset is its completed physical result. */
export type ConstructionProjectStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled';

/** One construction project. It is distinct from the finished asset it may one day
 *  produce (`resultingAssetId`, set exactly once on completion). The project keeps
 *  its permanent identity and its permanent Region reference across its whole
 *  lifecycle; current sovereignty, control and occupation stay canonical elsewhere. */
export interface ConstructionProjectRecord {
  projectId: ConstructionProjectId;
  /** Country whose institutions authorize the project. */
  countryId: string;
  /** Permanent Region of the site — never a mutable owner. */
  regionId: string;
  /** The asset type the project will build. */
  assetTypeId: AssetTypeId;
  title: string;
  status: ConstructionProjectStatus;
  proposedOn: string;
  proposedByPersonId: string;
  authorizedOn?: string;
  authorizedByPersonId?: string;
  startedOn?: string;
  pausedOn?: string;
  completedOn?: string;
  cancelledOn?: string;
  cancelledByPersonId?: string;
  /** Set exactly once when the project completes (0.24.6B); never duplicated. */
  resultingAssetId?: AssetId;
  /** Explicit estimated cost in nominal USD (0.24.3A). Absence records that no
   *  cost estimate exists yet — it is never a zero cost. */
  estimatedCostUsd?: number;
  /** Nominal USD committed from the Country treasury toward this project
   *  (0.24.3B), distinct from the estimate and never reusable while committed. */
  committedUsd?: number;
  /** Workers reserved from the site Region's labour force (0.24.4A); a reserved
   *  worker is never simultaneously a civilian employee or a military reservist. */
  reservedWorkers?: number;
  /** Cumulative funded work done (0.24.4C), in nominal USD, never exceeding the
   *  committed amount. */
  completedWorkUsd?: number;
  coverage: AssetCoverageRecord;
}

/** Deterministic permanent construction-project identity: opaque, sequence-derived only. */
export const constructionProjectId = (sequence: number): ConstructionProjectId => `project.${sequence.toString().padStart(8, '0')}`;

/**
 * 0.24.4C — Modelled nominal USD of funded work one reserved worker completes
 * per day. This is a central modelling assumption, not an observed wage; it
 * couples progression to labour and to the committed treasury budget so that no
 * work is done without funded labour and no instant construction is possible.
 */
export const CONSTRUCTION_DAILY_COST_PER_WORKER_USD = 200;

/**
 * 0.24.5A — The modelled physical input construction consumes: the `raw_materials`
 * trade category. Its stock gates progression; an absent stock is a shortage,
 * never free material.
 */
export const CONSTRUCTION_MATERIAL_CATEGORY = 'raw_materials' as const;

/**
 * 0.24.5A — Modelled units of material one reserved worker consumes per day of
 * work. Central modelling assumption, not an observed bill of materials.
 */
export const CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY = 1;

/**
 * 0.24.5A — modelled construction days per month used to express the daily
 * material requirement of an active project as a monthly Trade import need.
 */
export const CONSTRUCTION_DAYS_PER_MONTH = 30;

/**
 * 0.24.6C — Modelled physical capacity a completed asset provides (placeholder).
 * Asset-type-specific capacity mapping arrives with the 0.25 economy registry;
 * capacity is a physical quantity, never a direct GDP multiplier.
 */
export const COMPLETED_ASSET_CAPACITY = 1;
export const COMPLETED_ASSET_CAPACITY_UNIT = 'unit';

/**
 * 0.24.7B — Modelled nominal USD cost of repairing a broken asset, and the
 * modelled number of days a repair takes. Central modelling assumptions, not
 * observed prices or schedules; a repair is never free or instantaneous.
 */
export const REPAIR_COST_USD = 100;
export const REPAIR_DURATION_DAYS = 3;

/**
 * 0.24.6D — modelled monthly maintenance cost per asset and the modelled number
 * of months of unfunded maintenance before physical condition wears one step.
 * Central modelling assumptions, not observed prices or schedules.
 */
export const MAINTENANCE_COST_USD = 10;
export const MAINTENANCE_WEAR_MONTHS = 12;
/** 0.24.6D — modelled units of the construction-material category one maintenance
 *  cycle consumes. Maintenance therefore requires both cash and a real resource. */
export const MAINTENANCE_MATERIALS = 1;

/**
 * 0.24.6D/0.24.7 — availability is derived from operating status and physical
 * condition: a broken asset is unavailable/partial; a worn asset (poor/critical
 * condition) loses availability even while operational.
 */
export const assetAvailability = (operatingStatus: AssetOperatingStatus, physicalCondition?: AssetPhysicalCondition): AssetAvailability => {
  if (operatingStatus === 'degraded') return 'partial';
  if (operatingStatus !== 'operational') return 'unavailable';
  if (physicalCondition === 'poor') return 'partial';
  if (physicalCondition === 'critical') return 'unavailable';
  return 'available';
};
