/**
 * 0.25.1 — Economy V2: contracts and units of account (vocabulary).
 *
 * This module defines the units of account and the goods/services/sector/price
 * vocabulary that the later 0.25 sub-milestones build on. It is vocabulary only,
 * in exactly the same sense as 0.24.1A (`src/simulation/assets/model.ts`):
 *
 * - It is NOT integrated into `SimulationState`, the save schema, migrations,
 *   the scheduler, the RNG or any other engine system.
 * - It defines no behavior, no ID generation, no second economy, no second GDP,
 *   no second population, no second stock store and no second ownership map.
 * - It reuses the existing canonical taxonomies (trade categories, fiscal
 *   service categories) instead of defining parallel ones.
 *
 * Contractual rules (see docs/economy-0.25.md and AGENTS.md):
 *
 * - The single monetary unit of account is nominal US dollars as non-negative
 *   safe integers of whole USD; prices use integer microUSD (1,000,000 microUSD
 *   = 1 USD); rates use basis points (10,000 bps = 100%).
 * - Goods are the immutable trade category taxonomy; services split into the
 *   traded-services aggregate and the fiscal public-service categories.
 *   No second goods/services list is introduced.
 * - Sectors/activities are admitted only with compatible dated evidence or an
 *   explicit synthetic label; no real industrial capacity, stock, price or
 *   productivity is fabricated for 2026-01-01. `unavailable` never means zero.
 * - An observed/derived price requires dated provenance; a modelled price is
 *   never presented as an observation; an unavailable price is never a zero.
 */

import { TRADE_CATEGORIES, CATEGORY_REGISTRY, type TradeCategory } from '../trade/model';
import { CATEGORIES as PUBLIC_SERVICE_CATEGORIES, type Spending } from '../fiscal/model';

// ---------------------------------------------------------------------------
// Identifier vocabulary.
// ---------------------------------------------------------------------------

/** Permanent opaque identifier of one good. Never derived from a name, array
 *  index, import order or ISO code alone. The current aggregate goods
 *  vocabulary is the immutable trade category taxonomy; GoodId only extends it
 *  when a future sub-milestone admits finer goods with real evidence. */
export type GoodId = string;

/** Permanent opaque identifier of one service. */
export type ServiceId = string;

/** Permanent opaque identifier of one productive sector (0.25.2+). */
export type SectorId = string;

/** Permanent opaque identifier of one productive activity (0.25.2+). */
export type ActivityId = string;

/** Permanent opaque identifier of one physical unit of account. */
export type PhysicalUnitId = string;

/** Permanent opaque identifier of one monetary unit of account. */
export type MonetaryUnitId = string;

// ---------------------------------------------------------------------------
// Monetary unit of account.
// ---------------------------------------------------------------------------

/** The single canonical monetary unit. All engine money is integer nominal USD;
 *  prices are integer microUSD; rates are basis points. */
export const MONETARY_UNIT = Object.freeze({
  id: 'USD_NOMINAL' as const,
  label: 'Nominal US dollar',
  wholeUnit: 'USD',
  priceSubUnit: 'microUSD',
  microUsdPerUsd: 1_000_000,
  rateUnit: 'basis_points',
  bpsPerWhole: 10_000,
});
export type MonetaryUnitIdRecord = typeof MONETARY_UNIT.id;

// ---------------------------------------------------------------------------
// Physical units of account.
// ---------------------------------------------------------------------------

export type PhysicalUnitKind = 'count' | 'aggregate_quantity' | 'capacity';

export interface PhysicalUnitRecord {
  readonly id: string;
  readonly kind: PhysicalUnitKind;
  readonly note: string;
}

/** The three physical-unit families used by the existing engine. */
export const PHYSICAL_UNITS = Object.freeze({
  persons: Object.freeze({
    id: 'PERSONS',
    kind: 'count',
    note: 'Person stocks: population, employment, labour reservations.',
  }),
  aggregateGoodUnit: Object.freeze({
    id: 'AGGREGATE_QUANTITY',
    kind: 'aggregate_quantity',
    note: 'Explicitly admitted compatible per-category trade quantity unit (e.g. tonnes, units). Invoice units must cost at least one whole USD.',
  }),
  assetCapacityUnit: Object.freeze({
    id: 'ASSET_CAPACITY',
    kind: 'capacity',
    note: 'Physical capacity of a 0.24 asset; refined by the 0.25 economy registry only when real data is admissible.',
  }),
}) satisfies Readonly<Record<string, PhysicalUnitRecord>>;

// ---------------------------------------------------------------------------
// Goods, services, sectors, activities.
// ---------------------------------------------------------------------------

export interface GoodRecord {
  readonly id: TradeCategory;
  readonly taxonomy: 'trade-0.17-v1';
  readonly essential: boolean;
  readonly note: string;
}

/**
 * The canonical aggregate goods vocabulary is the immutable trade category
 * taxonomy. Reusing it (never redefining it) is the point: 0.25 must not create
 * a second goods list. `services` is the traded-services aggregate and stays
 * distinct from fiscal public services below.
 */
export const GOODS: Readonly<Record<TradeCategory, GoodRecord>> = Object.freeze(
  Object.fromEntries(TRADE_CATEGORIES.map((id) => [id, Object.freeze({
    id,
    taxonomy: 'trade-0.17-v1',
    essential: CATEGORY_REGISTRY[id].essential,
    note: CATEGORY_REGISTRY[id].limitation,
  })])),
) as Readonly<Record<TradeCategory, GoodRecord>>;

export interface PublicServiceRecord {
  readonly id: Spending;
  readonly family: 'public_service';
  readonly taxonomy: 'fiscal-0.11-v2';
}

/** Public services are the fiscal spending/coverage categories, distinct from the
 *  traded-services aggregate and from household consumption identities. */
export const PUBLIC_SERVICES: Readonly<Record<Spending, PublicServiceRecord>> = Object.freeze(
  Object.fromEntries(PUBLIC_SERVICE_CATEGORIES.map((id) => [id, Object.freeze({
    id,
    family: 'public_service' as const,
    taxonomy: 'fiscal-0.11-v2' as const,
  })]))
) as Readonly<Record<Spending, PublicServiceRecord>>;

export const SECTOR_COVERAGE_STATUSES = Object.freeze(['sourced', 'derived', 'modelled', 'synthetic', 'unavailable'] as const);
export type SectorCoverage = typeof SECTOR_COVERAGE_STATUSES[number];

export interface SectorRecord {
  readonly id: SectorId;
  readonly coverage: SectorCoverage;
  readonly note: string;
}

export interface ActivityRecord {
  readonly id: ActivityId;
  readonly sectorId: SectorId;
  readonly coverage: SectorCoverage;
  readonly note: string;
}

/**
 * 0.25.1 admits no real sector/activity taxonomy: the productive-activity space
 * is defined by 0.25.2, and a sector is admitted only with compatible dated
 * evidence or an explicit synthetic label. These registries start empty so a
 * fabricated industrial capacity can never slip in as an observation.
 */
export const SECTORS: Readonly<Record<SectorId, SectorRecord>> = Object.freeze({});
export const ACTIVITIES: Readonly<Record<ActivityId, ActivityRecord>> = Object.freeze({});

// ---------------------------------------------------------------------------
// Prices and provenance.
// ---------------------------------------------------------------------------

export const PRICE_STATUSES = Object.freeze(['observed', 'derived', 'modelled', 'unavailable'] as const);
export type PriceStatus = typeof PRICE_STATUSES[number];

/** Dated, traceable provenance of a real-world datum (publisher, dataset, URL,
 *  reference date, retrieval date, licence, attribution, limitation). */
export interface UnitOfAccountProvenance {
  publisher: string;
  dataset: string;
  url: string;
  referenceDate: string;
  retrievedAt: string;
  licence: string;
  attribution: string;
  limitation: string;
}

/** A price: integer microUSD per explicit physical unit, with coverage status
 *  and — for observed/derived prices — dated provenance. An `unavailable` price
 *  carries no value and is never a zero. */
export interface PriceRecord {
  status: PriceStatus;
  /** microUSD per unit; absent when `status === 'unavailable'`. */
  valueMicroUsd?: number;
  /** the explicit physical unit this price is quoted for. */
  unit: string;
  provenance?: UnitOfAccountProvenance;
}

/** Encode `unavailable != 0`: an unavailable price has no numeric value. */
export const unavailablePrice = (unit: string): PriceRecord => ({ status: 'unavailable', unit });

/** Encode a derived price carrying the required dated provenance (an observed
 *  price is admitted the same way with `status: 'observed'` and dated provenance). */
export const derivedPrice = (unit: string, valueMicroUsd: number, provenance: UnitOfAccountProvenance): PriceRecord => ({
  status: 'derived', unit, valueMicroUsd, provenance,
});
