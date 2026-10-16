/**
 * 0.29.1 — Public services V2: service/capacity/access contract.
 *
 * Vocabulary/accounting-contract milestone (parallel to 0.25.1/0.26.1/0.27.1/
 * 0.28.1). It names where each public service already lives — budget (fiscal),
 * personnel and cohorts (socioeconomy), establishments (assets), access
 * (rights/office) — without building a second budget or a second population.
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

export const SERVICES_VERSION = 'services-0.29-v1' as const;

export const SERVICE_FAMILIES = Object.freeze([
  'health', 'education', 'pensions', 'incomeSupport', 'infrastructure', 'administration',
] as const);
export type ServiceFamily = typeof SERVICE_FAMILIES[number];

export const ACCESS_BASES = Object.freeze(['right', 'office_authorized', 'universal'] as const);
export type AccessBasis = typeof ACCESS_BASES[number];

export interface ServiceOwnerEntry {
  readonly family: ServiceFamily;
  /** Budget is the fiscal engine only — no second budget. */
  readonly budgetOwner: 'fiscal';
  /** Personnel and cohorts are the socioeconomic engine only — no second population. */
  readonly personnelOwner: 'socioeconomy';
  readonly cohortOwner: 'socioeconomy';
  /** Establishments are the 0.24 asset store only. */
  readonly assetOwner: 'assets';
  readonly accessBasis: AccessBasis;
  readonly rationale: string;
}

/** The single canonical ownership map for public services. */
export const SERVICE_OWNERS: readonly ServiceOwnerEntry[] = Object.freeze([
  { family: 'health', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'right', rationale: 'Health is a fiscal-budget service delivered by socioeconomy personnel in 0.24 assets, accessed as a right.' },
  { family: 'education', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'right', rationale: 'Education is a fiscal-budget service delivered by socioeconomy personnel in 0.24 assets.' },
  { family: 'pensions', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'right', rationale: 'Pensions are a fiscal transfer to socioeconomy cohorts, gated by legal eligibility.' },
  { family: 'incomeSupport', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'right', rationale: 'Income support is a fiscal transfer to socioeconomy cohorts, gated by legal eligibility.' },
  { family: 'infrastructure', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'universal', rationale: 'Infrastructure is a fiscal-budget service delivered through 0.24 assets.' },
  { family: 'administration', budgetOwner: 'fiscal', personnelOwner: 'socioeconomy', cohortOwner: 'socioeconomy', assetOwner: 'assets', accessBasis: 'office_authorized', rationale: 'Administration is a fiscal-budget service, access gated by office.' },
]);

export const REQUIRED_SERVICE_FAMILIES = SERVICE_FAMILIES;

// ---------------------------------------------------------------------------
// Open design decisions (BLOCKED_DESIGN until a human decides).
// ---------------------------------------------------------------------------

export interface ServiceDecisionGate {
  readonly id: 'rent_rules';
  readonly status: 'undecided' | 'decided';
  readonly question: string;
  readonly dependsOnSubMilestones: readonly string[];
}

export const SERVICE_DECISIONS: readonly ServiceDecisionGate[] = Object.freeze([
  {
    id: 'rent_rules',
    status: 'undecided',
    question: 'Should rents and rental rules be simulated in this version (0.29.5)?',
    dependsOnSubMilestones: ['0.29.5'],
  },
]);

export const isRentRulesInScope = (): boolean => SERVICE_DECISIONS.find((d) => d.id === 'rent_rules')!.status === 'decided';
