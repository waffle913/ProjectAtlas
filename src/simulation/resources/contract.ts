/**
 * 0.27.1 — Resources/energy V1: matter and energy taxonomy and contract.
 *
 * This module is the executable counterpart of docs/resources-0.27.md. It is
 * vocabulary and accounting-contract only, in the same sense as 0.25.1 and
 * 0.26.1:
 *
 * - It is NOT integrated into `SimulationState`, the save schema, migrations,
 *   the scheduler or the RNG.
 * - It defines no second material store, no second production engine and no
 *   second stock ledger: every existing quantity still lives in the canonical
 *   trade/socioeconomy/assets owners below.
 * - It records the open design decisions (intra-regional spatial grid, and the
 *   agriculture/climate/environment sub-systems) as `undecided` gates — they
 *   stay BLOCKED_DESIGN until a human decides them.
 *
 * Contractual rules (docs/resources-0.27.md):
 * - distinct scopes: `reserve` (in-situ, not yet extractable), `deposit`
 *   (admitted extractable), `production` (extracted flow), `stock` (stored);
 * - physical units are converted only with explicit, justified factors — never
 *   by mixing incompatible units;
 * - `unavailable != 0`: an unknown reserve, deposit or stock is never a zero,
 *   and no geology/reserve quantity is fabricated for 2026-01-01.
 */

import type { SimulationState } from '../../types';

export const RESOURCES_VERSION = 'resources-0.27-v1' as const;

/** Permanent opaque identifiers (vocabulary only; 0.27.2/0.27.3 attach them). */
export type ResourceId = string;
export type FuelId = string;
export type RefinedProductId = string;
export type EnergyCarrierId = string;
export type InstallationId = string;

export const MATTER_ENERGY_FAMILIES = Object.freeze([
  'resource', 'fuel', 'refined_product', 'energy_carrier',
] as const);
export type MatterEnergyFamily = typeof MATTER_ENERGY_FAMILIES[number];

export const RESOURCE_SCOPES = Object.freeze(['reserve', 'deposit', 'production', 'stock'] as const);
export type ResourceScope = typeof RESOURCE_SCOPES[number];

export const PHYSICAL_UNIT_FAMILIES = Object.freeze(['mass', 'volume', 'energy'] as const);
export type PhysicalUnitFamily = typeof PHYSICAL_UNIT_FAMILIES[number];

export interface PhysicalUnitRecord {
  readonly id: string;
  readonly family: PhysicalUnitFamily;
  readonly note: string;
}

/** Admitted physical units. Conversion across units is allowed only with an
 *  explicit, justified conversion factor; incompatible mixing is rejected. */
export const PHYSICAL_UNITS: Readonly<Record<string, PhysicalUnitRecord>> = Object.freeze({
  tonne: Object.freeze({ id: 'tonne', family: 'mass', note: 'Metric tonne (1,000 kg).' }),
  cubic_metre: Object.freeze({ id: 'cubic_metre', family: 'volume', note: 'Cubic metre, typically for gases/liquids.' }),
  barrel: Object.freeze({ id: 'barrel', family: 'volume', note: 'Oil-industry barrel; conversion to cubic metres needs an explicit factor.' }),
  megawatt_hour: Object.freeze({ id: 'megawatt_hour', family: 'energy', note: 'MWh of electricity/heat.' }),
});

export interface MatterEnergyRecord {
  readonly id: string;
  readonly family: MatterEnergyFamily;
  readonly coverage: 'sourced' | 'derived' | 'modelled' | 'synthetic' | 'unavailable';
  readonly note: string;
}

/**
 * 0.27.1 admits no real resource/fuel/refined-product/energy-carrier inventory:
 * a record is admitted only with compatible dated evidence or an explicit
 * synthetic label. These registries start empty so a fabricated reserve or
 * deposit can never slip in as an observation.
 */
export const RESOURCES: Readonly<Record<ResourceId, MatterEnergyRecord>> = Object.freeze({});
export const FUELS: Readonly<Record<FuelId, MatterEnergyRecord>> = Object.freeze({});
export const REFINED_PRODUCTS: Readonly<Record<RefinedProductId, MatterEnergyRecord>> = Object.freeze({});
export const ENERGY_CARRIERS: Readonly<Record<EnergyCarrierId, MatterEnergyRecord>> = Object.freeze({});

// ---------------------------------------------------------------------------
// Scope -> canonical owner inventory.
// ---------------------------------------------------------------------------

export const SCOPE_OWNER_SUBSYSTEMS = Object.freeze(['socioeconomy', 'trade', 'assets', 'none'] as const);
export type ScopeOwnerSubsystem = typeof SCOPE_OWNER_SUBSYSTEMS[number];

export interface ScopeOwnerEntry {
  readonly scope: ResourceScope;
  readonly ownerPath: string;
  readonly ownerSubsystem: ScopeOwnerSubsystem;
  readonly rationale: string;
  readonly read: (state: SimulationState, countryId: string) => unknown;
}

/**
 * Where each scope's quantity already lives. `reserve`/`deposit` have NO
 * canonical owner yet (they arrive in 0.27.2/0.27.3 with admitted evidence):
 * they are `none`/unavailable, never a fabricated zero.
 */
export const SCOPE_OWNERS: readonly ScopeOwnerEntry[] = Object.freeze([
  {
    scope: 'production',
    ownerPath: 'state.socioeconomy.regions[regionId].economy.output',
    ownerSubsystem: 'socioeconomy',
    rationale: 'Extracted/produced flow is the one socioeconomic output engine; trade category production is an attribution inside that private-residual envelope, never a second production engine.',
    read: (state, _countryId) => state.socioeconomy.regions,
  },
  {
    scope: 'stock',
    ownerPath: 'state.trade.countries[countryId].markets[category].stock',
    ownerSubsystem: 'trade',
    rationale: '`TradeStock` is the sole physical stock store; construction consumes it directly, no parallel material store.',
    read: (state, countryId) => state.trade.countries[countryId]?.markets,
  },
  {
    scope: 'reserve',
    ownerPath: 'none (introduced by 0.27.2 with admitted evidence)',
    ownerSubsystem: 'none',
    rationale: 'In-situ reserves have no canonical owner until 0.27.2 admits dated reserve/deposit evidence; `unavailable != 0`, never a fabricated volume.',
    read: () => undefined,
  },
  {
    scope: 'deposit',
    ownerPath: 'none (introduced by 0.27.2 with admitted evidence)',
    ownerSubsystem: 'none',
    rationale: 'Extractable deposits have no canonical owner until 0.27.2; `unavailable != 0`, never a fabricated volume.',
    read: () => undefined,
  },
]);

export const REQUIRED_SCOPES = Object.freeze(['reserve', 'deposit', 'production', 'stock'] as const);

// ---------------------------------------------------------------------------
// Open design decisions (BLOCKED_DESIGN until a human decides).
// ---------------------------------------------------------------------------

export interface ResourceDecisionGate {
  readonly id: 'intra_region_spatial_grid' | 'agriculture_climate_environment';
  readonly status: 'undecided' | 'decided';
  readonly question: string;
  readonly dependsOnSubMilestones: readonly string[];
}

export const RESOURCE_DECISIONS: readonly ResourceDecisionGate[] = Object.freeze([
  {
    id: 'intra_region_spatial_grid',
    status: 'undecided',
    question: 'For intra-regional localization: points, cells/grid or asset/deposit geometries, with what resolution and level of proof? The presence of a geological basin must never become point-by-point exploitable density without evidence.',
    dependsOnSubMilestones: ['0.27.2'],
  },
  {
    id: 'agriculture_climate_environment',
    status: 'undecided',
    question: 'Which of agriculture, climate, deforestation, emissions and environmental effects are actually validated, with which causal loops and legal powers? Do not activate any silently.',
    dependsOnSubMilestones: ['0.27.9'],
  },
]);

export const isSpatialGridInScope = (): boolean => RESOURCE_DECISIONS.find((d) => d.id === 'intra_region_spatial_grid')!.status === 'decided';
export const isAgricultureClimateInScope = (): boolean => RESOURCE_DECISIONS.find((d) => d.id === 'agriculture_climate_environment')!.status === 'decided';
