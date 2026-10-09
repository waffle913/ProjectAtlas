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
export type AssetCoverageStatus = 'sourced' | 'modelled' | 'partial' | 'unavailable';

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
 * part. Provenance is expected for `'sourced'` and `'partial'` coverage and is
 * absent for `'modelled'` and `'unavailable'`, where no real-world datum
 * supports the record.
 */
export interface AssetCoverageRecord {
  status: AssetCoverageStatus;
  provenance?: AssetSourceProvenance;
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
