import type { PoliticalRegistry, NationalInstitutions } from '../politics/model';
import type { SimulationState } from '../../types';
import { politicalRegistry } from '../politics/registry';
import { CATEGORIES, TAXES, type TaxKind } from '../fiscal/model';

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

/** The policy kinds a fiscal rule belongs to (the canonical fiscal model's tax kinds). */
const FISCAL_KINDS = ['personal', 'consumption', 'payroll', 'corporate'] as const satisfies readonly TaxKind[];
/** Canonical registry of the material keys a constitutional secondary disposition may protect.
 *  It is derived from the canonical fiscal model — tax kinds (`fiscal.*`), tax categories
 *  (`fiscal.employee`, `fiscal.employer`) and budget categories (`fiscal.annualBudget.*`) — so any
 *  canonical legal rule of the fiscal engine is protectable, never a hand-maintained whitelist.
 *  An amendment must reference keys from this registry; an unknown key is rejected, never invented. */
export const MATERIAL_KEYS: readonly string[] = Object.freeze([...new Set([
  ...FISCAL_KINDS.map(kind => `fiscal.${kind}`),
  ...TAXES.map(category => `fiscal.${category}`),
  ...CATEGORIES.map(category => `fiscal.annualBudget.${category}`),
  'fiscal.annualBudget.defense',
])]);
export type MaterialKey = string;
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
  /** Provenance of the procedure itself: an observed rule, or a modelled bootstrap default so the
   *  revision procedure is usable (never a sourced claim). `undefined` means unavailable. */
  procedureStatus?: 'sourced' | 'modelled';
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
  /** Permanent crisis episode identities, never crisis types: a new episode of the same type does
   *  not silently re-justify an emergency declared for a previous episode. */
  justificationEpisodeIds: string[];
  /** Set when the justification episodes ceased to be active; the emergency stays unjustified until ended. */
  unjustifiedSince?: string;
  /** Progressive discontent counter incremented each month the restrictions are maintained unjustified. */
  discontentDriversApplied?: number;
  restrictions: { assembliesBanned: boolean; strikesBanned: boolean; policePowersEnhanced: boolean; bordersClosed: boolean };
  /** Dated recommendations of the interior minister to end the emergency when the situation
   *  improves. A recommendation is advisory only: it never lifts the emergency by itself. */
  ministerialRecommendations: Array<{
    on: string;
    byPersonId: string;
    portfolioId: string;
    action: 'end_emergency';
    reason: string;
    status: 'pending' | 'acted_on';
  }>;
}

export interface ConstitutionalBindingEvent {
  date: string;
  materialKey: string;
  action: 'protected' | 'unprotected';
  instrumentId?: string;
  provenance: 'constitutional_amendment';
}

/** Dated, per-field trace of every constitutional revision of the non-material domains
 *  (rights, parliament, headOfState, government, election, judicialReview, territory, amendment).
 *  A posteriori annulment replays this trace without the annulled instrument, so annulling A after
 *  B never erases B's value: ownership of every field is decided by the surviving trace, exactly
 *  like the material-key binding trace. */
export type ConstitutionalRevisionDomain = 'rights' | 'parliament' | 'headOfState' | 'government' | 'election' | 'judicialReview' | 'territory' | 'amendment';
export interface ConstitutionalRevisionEvent {
  date: string;
  instrumentId: string;
  domain: ConstitutionalRevisionDomain;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}

/** A member of the constitutional court, seated through the constitutional appointment rule. */
export interface ConstitutionalCourtMember {
  personId: string;
  appointedOn: string;
  /** Derived from the constitutional term rule (`years` + termYears); absent for life tenure or unavailable terms. */
  termEnd?: string;
}

/** A dated devolution of constitutional competences to a specific Region, created only by an
 *  enacted constitutional amendment that grants autonomy (territoryChanges.regionIds). */
export interface DevolvedPower {
  regionId: string;
  competences: string[];
  instrumentId: string;
  on: string;
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
  territory: { organization: TerritorialOrganization; regionalAutonomy: RegionalAutonomy; delegatedCompetences: string[]; devolvedPowers: DevolvedPower[] };
  emergency: EmergencyConstitution;
  /** Canonical material keys (e.g. 'fiscal.corporate.rate') protected by constitutional secondary dispositions. */
  protectedMaterialKeys: string[];
  /** Dated trace of every protection/removal, created only by a constitutional amendment. */
  bindingEvents: ConstitutionalBindingEvent[];
  /** Dated per-field trace of every constitutional revision of the non-material domains. */
  revisionEvents: ConstitutionalRevisionEvent[];
  /** Seated constitutional court, populated through the constitutional appointment rule. */
  courtMembers: ConstitutionalCourtMember[];
}

/** The lifecycle of a scheduled amendment. `scheduled` and `referred` are open states; the rest are
 *  terminal and are never processed again by the monthly task. */
export type AmendmentStatus = 'scheduled' | 'referred' | 'promulgated' | 'blocked' | 'annulled' | 'incompatible';
/** The constitutional court's verdict, distinct from the constitutional `effect` (its available power). */
export type JudicialVerdict = 'clear' | 'annulled' | 'incompatible' | 'advisory';

export interface AmendmentReferral {
  /** Date of the referral (saisine). */
  on: string;
  /** Set for an explicit saisine; absent for the obligatory a priori review the constitution triggers itself. */
  byPersonId?: string;
  timing: 'before_promulgation' | 'after_promulgation';
}

export interface AmendmentDecision {
  outcome: JudicialVerdict;
  /** The power actually exercised; it must be one the court's constitution grants (judicialReview.effect). */
  effect: JudicialEffect;
  on: string;
  byPersonId?: string;
  /** Traceable institutional grounds: the saisine, the amendment text and the constitutional norms
   *  the verdict applied. A verdict is never an arbitrary caller-injected result. */
  grounds: string[];
}

export interface PendingAmendment {
  instrumentId: string;
  countryId: string;
  applyOn: string;
  payload: {
    materialKeysToProtect?: string[];
    materialKeysToUnprotect?: string[];
    rightsChanges?: Partial<ConstitutionalRights>;
    parliamentChanges?: Partial<ParliamentConstitution>;
    executiveChanges?: { headOfState?: Partial<HeadOfStateConstitution>; government?: Partial<GovernmentConstitution> };
    electionChanges?: Partial<ElectionConstitution>;
    judicialChanges?: Partial<JudicialReviewConstitution>;
    territoryChanges?: Partial<{ organization: TerritorialOrganization; regionalAutonomy: RegionalAutonomy; delegatedCompetences: string[]; regionIds: string[]; sovereigntyTransfer: { regionIds: string[]; toCountryId: string } }>;
    amendmentChanges?: Partial<AmendmentConstitution>;
  };
  /** Fingerprint of { effectiveDate, payload } of the canonical enacted instrument this pending
   *  was adopted from. A pending can never drift from its instrument. */
  payloadFingerprint: string;
  status: AmendmentStatus;
  /** The court's constitutional powers (timing of control + available effects). Never the verdict itself. */
  judicialReview: { timing: JudicialTiming; effect: JudicialEffect };
  /** A recorded referral (saisine) to the constitutional court. */
  referral?: AmendmentReferral;
  /** The court's actual verdict. Distinct from `judicialReview.effect`, which only limits what it may decide. */
  decision?: AmendmentDecision;
  /** Set once the amendment was actually applied; exactly-once application never repeats it. */
  appliedOn?: string;
  /** Limited inverse captured at application time: only the fields this amendment actually changed
   *  (their pre-amendment values). A posteriori annulment restores exactly these, never a full
   *  snapshot that could erase a later amendment. Material keys are reversed from the payload lists. */
  appliedInverse?: {
    rights?: Partial<ConstitutionalRights>;
    parliament?: Partial<ParliamentConstitution>;
    headOfState?: Partial<HeadOfStateConstitution>;
    government?: Partial<GovernmentConstitution>;
    election?: Partial<ElectionConstitution>;
    judicialReview?: Partial<JudicialReviewConstitution>;
    territory?: Partial<{ organization: TerritorialOrganization; regionalAutonomy: RegionalAutonomy; delegatedCompetences: string[] }>;
    amendment?: Partial<AmendmentConstitution>;
  };
  /** Procedural block reason; never a court verdict. */
  blockReason?: 'not_enacted' | 'judicial_review_unavailable' | 'payload_invalid';
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
    // The executive system alone never proves a precise selection method. In particular, a
    // `parliamentary` (or `collective`) system does not prove that parliament selects the head of
    // state: the method stays unavailable without adequate evidence.
    case 'presidential': return { selectionMethod: 'unavailable', suffrageMode: 'unavailable' };
    case 'semi_presidential': return { selectionMethod: 'unavailable', suffrageMode: 'unavailable' };
    case 'parliamentary': return { selectionMethod: 'unavailable', suffrageMode: 'unavailable' };
    case 'monarchy_parliamentary': return { selectionMethod: 'hereditary', suffrageMode: 'unavailable' };
    case 'collective': return { selectionMethod: 'unavailable', suffrageMode: 'unavailable' };
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
    suffrage: 'unavailable',
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
      // Bootstrap: no sourced amendment threshold/referendum rule exists in the 0.13 registry. A usable
      // modelled procedure (two-thirds supermajority, no referendum) keeps the revision procedure reachable;
      // it is marked `modelled`, never relabelled sourced. Countries without an institution stay unavailable.
      amendment: hasInstitution ? { parliamentaryThresholdBps: 6_667, referendum: 'never', procedureStatus: 'modelled' } : { referendum: 'unavailable' },
      election: electionFromRegistry(institution),
      rights: unavailableRights(),
      judicialReview: { courtExists: 'unavailable', appointment: 'unavailable', term: 'unavailable', timing: 'unavailable', effect: 'unavailable', accessors: [] },
      territory: { organization: 'unavailable', regionalAutonomy: 'unavailable', delegatedCompetences: [], devolvedPowers: [] },
      emergency: { status: 'none', justificationEpisodeIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false }, ministerialRecommendations: [] },
      protectedMaterialKeys: [],
      bindingEvents: [],
      revisionEvents: [],
      courtMembers: [],
    };
  }
  return { ...state, constitution: { version: CONSTITUTION_VERSION, initializedOn: state.date, countries, pendingAmendments: [] } };
}
