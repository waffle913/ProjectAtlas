import type { PoliticalRegistry, NationalInstitutions } from '../politics/model';
import type { SimulationState } from '../../types';
import { politicalRegistry } from '../politics/registry';

export const CONSTITUTION_VERSION = 'constitution-0.23-v1' as const;

export type ConstitutionCoverage = 'sourced' | 'derived' | 'modelled' | 'unavailable';
export interface ConstitutionProvenance { status: ConstitutionCoverage; referenceDate: string; method: string; limitation: string; }

export type ParliamentPower = 'decisive' | 'legislative_and_censure' | 'legislative' | 'weak_legislative' | 'consultative' | 'none' | 'unavailable';
export type HeadOfStateSelection = 'popular_direct' | 'popular_indirect' | 'parliamentary' | 'appointed' | 'hereditary' | 'other' | 'unavailable';
export type GovernmentAppointment = 'elected_directly' | 'chosen_by_parliament' | 'appointed_by_head_of_state' | 'unavailable';
export type GovernmentResponsibility = 'none' | 'government_censurable' | 'leader_censurable' | 'unavailable';
export type VacancySuccession = 'deputy_temporary' | 'deputy_permanent' | 'unavailable';
export type SuffrageMode = 'universal' | 'restricted' | 'unavailable';
export type ParliamentarySystem = 'majoritarian' | 'proportional' | 'mixed' | 'unavailable';
export type ReferendumRule = 'never' | 'always' | 'principal_only' | 'unavailable';
export type ConstitutionalDispositionKind = 'principal' | 'secondary';

/** Canonical registry of the material keys a constitutional secondary disposition may protect.
 *  An amendment must reference keys from this registry; an unknown key is rejected, never invented. */
export const MATERIAL_KEYS = Object.freeze([
  'fiscal.personal', 'fiscal.consumption', 'fiscal.employee', 'fiscal.employer', 'fiscal.corporate',
  'fiscal.annualBudget.health', 'fiscal.annualBudget.education', 'fiscal.annualBudget.pensions',
  'fiscal.annualBudget.incomeSupport', 'fiscal.annualBudget.infrastructure', 'fiscal.annualBudget.administration', 'fiscal.annualBudget.defense',
] as const);
export type MaterialKey = typeof MATERIAL_KEYS[number];
export type TerritorialOrganization = 'unitary' | 'federal' | 'unavailable';
export type RegionalAutonomy = 'none' | 'autonomous_region_elected_leader' | 'unavailable';
export type JudicialCourt = 'exists' | 'none' | 'unavailable';
export type JudicialAppointment = 'executive' | 'parliament' | 'shared' | 'unavailable';
export type JudicialTerm = 'years' | 'life' | 'unavailable';
export type JudicialTiming = 'before_promulgation' | 'after_promulgation' | 'both' | 'none' | 'unavailable';
export type JudicialEffect = 'annul' | 'declare_incompatibility' | 'advisory_only' | 'unavailable';
export type EmergencyStatus = 'none' | 'active' | 'expired';

export type GuaranteeLevel = 'guaranteed' | 'guaranteed_with_restrictions' | 'not_guaranteed' | 'unavailable';
export type AssemblyRight = 'guaranteed' | 'authorization_required' | 'strongly_restricted' | 'not_guaranteed' | 'unavailable';
export type ReligionRight = 'guaranteed' | 'limited' | 'official_plus_tolerance' | 'official_plus_restrictions' | 'not_guaranteed' | 'unavailable';
export type PropertyRight = 'strong' | 'guaranteed_with_legal_expropriation' | 'weak' | 'not_guaranteed' | 'unavailable';
export type SocialRight = 'constitutional_right' | 'state_objective_not_justiciable' | 'not_constitutionalized' | 'unavailable';
export type VoteRight = 'constitutional' | 'ordinary_law_only' | 'unavailable';

export interface ConstitutionalRights {
  expression: GuaranteeLevel;
  press: GuaranteeLevel;
  assembly: AssemblyRight;
  association: GuaranteeLevel;
  religion: ReligionRight;
  equalityBeforeLaw: GuaranteeLevel;
  antiDiscrimination: GuaranteeLevel;
  privateProperty: PropertyRight;
  privacy: GuaranteeLevel;
  fairTrial: GuaranteeLevel;
  protectionFromArbitraryArrest: GuaranteeLevel;
  strike: GuaranteeLevel;
  union: GuaranteeLevel;
  vote: VoteRight;
  health: SocialRight;
  education: SocialRight;
  socialProtection: SocialRight;
}

export interface ParliamentConstitution {
  power: ParliamentPower;
  termYears?: number;
  dissolutionHolder: 'executive' | 'parliament' | 'unavailable';
  chambers: number;
}

export interface HeadOfStateConstitution {
  selectionMethod: HeadOfStateSelection;
  termYears?: number;
  maxTerms?: number;
  suffrageMode: SuffrageMode;
}

export interface GovernmentConstitution {
  appointmentMode: GovernmentAppointment;
  responsibility: GovernmentResponsibility;
  vacancySuccession: VacancySuccession;
}

export interface AmendmentConstitution {
  parliamentaryThresholdBps?: number; // 0..10000
  referendum: ReferendumRule;
}

export interface ElectionConstitution {
  votingAge?: number;
  suffrage: SuffrageMode;
  mandatoryVoting: boolean | 'unavailable';
  parliamentarySystem: ParliamentarySystem;
  rounds: 1 | 2 | 'unavailable';
  thresholdBps?: number;
}

export interface JudicialReviewConstitution {
  courtExists: JudicialCourt;
  appointment: JudicialAppointment;
  term: JudicialTerm;
  termYears?: number;
  timing: JudicialTiming;
  effect: JudicialEffect;
  accessors: Array<'executive' | 'government' | 'parliament' | 'parliamentary_parties' | 'citizens'>;
}

export interface EmergencyConstitution {
  status: EmergencyStatus;
  justificationCrisisIds: string[];
  restrictions: { assembliesBanned: boolean; strikesBanned: boolean; policePowersEnhanced: boolean; bordersClosed: boolean };
}

export interface ConstitutionalBindingEvent {
  date: string;
  materialKey: string;
  action: 'protected' | 'unprotected';
  instrumentId?: string;
  provenance: 'constitutional_amendment';
}

export interface ConstitutionStateEntry {
  countryId: string;
  coverage: ConstitutionCoverage;
  provenance: ConstitutionProvenance;
  parliament: ParliamentConstitution;
  headOfState: HeadOfStateConstitution;
  government: GovernmentConstitution;
  amendment: AmendmentConstitution;
  election: ElectionConstitution;
  rights: ConstitutionalRights;
  judicialReview: JudicialReviewConstitution;
  territory: { organization: TerritorialOrganization; regionalAutonomy: RegionalAutonomy; delegatedCompetences: string[] };
  emergency: EmergencyConstitution;
  /** Canonical material keys (e.g. 'fiscal.corporate.rate') protected by constitutional secondary dispositions. */
  protectedMaterialKeys: string[];
  /** Dated trace of every protection/removal, created only by a constitutional amendment. */
  bindingEvents: ConstitutionalBindingEvent[];
}

export interface PendingAmendment {
  instrumentId: string;
  countryId: string;
  applyOn: string;
  payload: { materialKeysToProtect?: string[]; materialKeysToUnprotect?: string[]; rightChanges?: Partial<ConstitutionalRights> };
  judicialReview: { timing: JudicialTiming; effect: JudicialEffect };
}

export interface ConstitutionState {
  version: typeof CONSTITUTION_VERSION;
  initializedOn?: string;
  countries: Record<string, ConstitutionStateEntry>;
  /** Amendments adopted but not yet effective; applied at their effective date by the monthly task. */
  pendingAmendments: PendingAmendment[];
}

const unavailableRights = (): ConstitutionalRights => ({
  expression: 'unavailable', press: 'unavailable', assembly: 'unavailable', association: 'unavailable', religion: 'unavailable',
  equalityBeforeLaw: 'unavailable', antiDiscrimination: 'unavailable', privateProperty: 'unavailable', privacy: 'unavailable', fairTrial: 'unavailable',
  protectionFromArbitraryArrest: 'unavailable', strike: 'unavailable', union: 'unavailable', vote: 'unavailable',
  health: 'unavailable', education: 'unavailable', socialProtection: 'unavailable',
});

export const emptyConstitution = (): ConstitutionState => ({ version: CONSTITUTION_VERSION, countries: {}, pendingAmendments: [] });

const headOfStateFromRegistry = (institution: NationalInstitutions | undefined): HeadOfStateConstitution => {
  switch (institution?.executiveSystem) {
    case 'presidential': return { selectionMethod: 'popular_direct', suffrageMode: 'universal' };
    case 'semi_presidential': return { selectionMethod: 'popular_direct', suffrageMode: 'universal' };
    case 'parliamentary': return { selectionMethod: 'parliamentary', suffrageMode: 'universal' };
    case 'monarchy_parliamentary': return { selectionMethod: 'hereditary', suffrageMode: 'unavailable' };
    case 'collective': return { selectionMethod: 'parliamentary', suffrageMode: 'unavailable' };
    case 'other': return { selectionMethod: 'other', suffrageMode: 'unavailable' };
    default: return { selectionMethod: 'unavailable', suffrageMode: 'unavailable' };
  }
};

const parliamentPowerFromRegistry = (institution: NationalInstitutions | undefined): ParliamentPower => {
  switch (institution?.executiveSystem) {
    case 'presidential': return 'legislative';
    case 'parliamentary': return 'legislative_and_censure';
    case 'semi_presidential': return 'legislative_and_censure';
    case 'monarchy_parliamentary': return 'legislative_and_censure';
    default: return institution?.chambers.length ? 'legislative' : 'unavailable';
  }
};

const electionFromRegistry = (institution: NationalInstitutions | undefined): ElectionConstitution => {
  const chamber = institution?.chambers[0];
  const kind = chamber?.electoralRule.kind;
  return {
    suffrage: 'universal',
    mandatoryVoting: 'unavailable',
    parliamentarySystem: kind === 'proportional' ? 'proportional' : kind === 'majoritarian' ? 'majoritarian' : kind === 'mixed' ? 'mixed' : 'unavailable',
    rounds: 'unavailable',
  };
};

/** Derive a country's initial constitutional state from the 0.13 political registry. Everything
 *  here is derived/modelled from the sourced institutions, never relabelled sourced, and every
 *  unknown dimension stays unavailable. This is NOT an observed constitution. */
export function initializeConstitution(state: SimulationState, countryIds?: readonly string[]): SimulationState {
  const ids = [...(countryIds ?? Object.keys(state.politics.countries))].sort();
  const countries: Record<string, ConstitutionStateEntry> = {};
  for (const countryId of ids) {
    const country = politicalRegistry.countries[countryId];
    const institution = country ? politicalRegistry.institutions[country.institutionId] : undefined;
    const hasInstitution = Boolean(institution);
    const termFromChamber = institution?.chambers.map(c => c.termEnd ? (new Date(c.termEnd).getFullYear() - new Date(c.electionDate ?? c.termStart ?? c.termEnd).getFullYear()) : undefined).find((n): n is number => n !== undefined);
    countries[countryId] = {
      countryId,
      coverage: hasInstitution ? 'derived' : 'unavailable',
      provenance: {
        status: hasInstitution ? 'derived' : 'unavailable',
        referenceDate: politicalRegistry.referenceDate,
        method: hasInstitution ? 'derived_from_ipu_parline_institutions' : 'no_admissible_institutional_record',
        limitation: hasInstitution
          ? 'Derived from the sourced executive/legislative classification; constitutional rights, amendment thresholds, emergency and judicial review are unavailable until separately sourced.'
          : 'No admissible national institutional record; the constitution is not fabricated.',
      },
      parliament: { power: parliamentPowerFromRegistry(institution), termYears: termFromChamber, dissolutionHolder: 'unavailable', chambers: institution?.chambers.length ?? 0 },
      headOfState: headOfStateFromRegistry(institution),
      government: { appointmentMode: 'unavailable', responsibility: institution?.executiveSystem === 'parliamentary' || institution?.executiveSystem === 'monarchy_parliamentary' ? 'government_censurable' : 'unavailable', vacancySuccession: 'unavailable' },
      amendment: { referendum: 'unavailable' },
      election: electionFromRegistry(institution),
      rights: unavailableRights(),
      judicialReview: { courtExists: 'unavailable', appointment: 'unavailable', term: 'unavailable', timing: 'unavailable', effect: 'unavailable', accessors: [] },
      territory: { organization: 'unavailable', regionalAutonomy: 'unavailable', delegatedCompetences: [] },
      emergency: { status: 'none', justificationCrisisIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false } },
      protectedMaterialKeys: [],
      bindingEvents: [],
    };
  }
  return { ...state, constitution: { version: CONSTITUTION_VERSION, initializedOn: state.date, countries, pendingAmendments: [] } };
}
