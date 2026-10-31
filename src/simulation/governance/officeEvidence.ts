import { dateValid } from '../fiscal/math';
import type { ExecutiveSystem, PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { AUTHORITY_CAPABILITIES, type AuthorityCapability, type PoliticalOfficeRole, type PoliticalPersonState } from './model';

export type AuthorityBasis = NonNullable<NonNullable<PoliticalPersonState['office']>['evidence']>['authorityBasis'];
const identifiers = (values: unknown): values is string[] => Array.isArray(values) && values.length > 0
  && values.every(value => typeof value === 'string' && value.trim().length > 0)
  && new Set(values).size === values.length;

/** The national executive offices a Country may hold. A legislator or a minister never exercises
 *  national executive authority through the office alone. */
export const NATIONAL_EXECUTIVE_OFFICE_ROLES = ['head_of_state', 'head_of_government'] as const;

/** Authority bases that actually establish an executive authority for gameplay. Every other
 *  persisted basis (in particular `institutional_authority_unresolved`) establishes the identity of
 *  the officeholder but not what the office may do. */
export const RESOLVED_EXECUTIVE_AUTHORITY_BASES = ['sourced_presidential_head_of_state', 'sourced_parliamentary_head_of_government'] as const;
export type ResolvedExecutiveAuthorityBasis = typeof RESOLVED_EXECUTIVE_AUTHORITY_BASES[number];
export const isResolvedExecutiveAuthorityBasis = (basis: AuthorityBasis | undefined): basis is ResolvedExecutiveAuthorityBasis =>
  basis !== undefined && (RESOLVED_EXECUTIVE_AUTHORITY_BASES as readonly string[]).includes(basis);

/** The executive system the political registry actually establishes for a Country. A registry entry
 *  whose `executiveSystemStatus` is not `sourced` never yields a system: it is `unavailable`, never a
 *  guessed constitutional form. */
export function sourcedExecutiveSystem(countryId: string, registry: PoliticalRegistry = politicalRegistry): ExecutiveSystem {
  const country = registry.countries[countryId];
  const institution = country ? registry.institutions[country.institutionId] : undefined;
  return institution?.executiveSystemStatus === 'sourced' ? institution.executiveSystem : 'unavailable';
}

export function executiveAuthorityBasis(system: string, role: PoliticalOfficeRole): AuthorityBasis {
  return system === 'presidential' && role === 'head_of_state' ? 'sourced_presidential_head_of_state'
    : (system === 'parliamentary' || system === 'monarchy_parliamentary') && role === 'head_of_government'
      ? 'sourced_parliamentary_head_of_government' : 'institutional_authority_unresolved';
}

/** The capabilities carried by a parliamentary mandate: the suffrage a legislator exercises. It is
 *  deliberately absent from every executive scope. The executive presents its bill to the chamber
 *  (that is `sponsor_legislation`) and the chamber's vote is modelled by the party/seat distribution,
 *  so an executive never inherits a parliamentary vote. */
export const LEGISLATOR_CAPABILITIES = ['vote_legislation'] as const satisfies readonly AuthorityCapability[];

/** The state functions a head of state carries when the represented arrangement does not give it
 *  the government agenda (a share of power between a president and a head of government, or a
 *  Country whose executive system is not represented). Government information and military command
 *  are the two functions the engine already models for a head of state; nothing else is invented. */
export const HEAD_OF_STATE_FUNCTIONS = ['access_government_information', 'command_military_operations'] as const satisfies readonly AuthorityCapability[];

/** The modelled governing scope of the office that actually carries the government agenda in a
 *  Country: legislative and budget initiative, government information, military command and public
 *  construction. This is a deliberate subset — a recognised executive office never inherits every
 *  capability. Ceremonial head-of-state functions, decree powers, appointment/confidence powers and
 *  the real constitutional distribution of powers are not represented here; what the engine does
 *  gate by role (ministerial appointment, government nomination, ban/dissolution decisions,
 *  executive override) stays role-based and unchanged. */
export const GOVERNMENT_AGENDA_CAPABILITIES = [
  'access_government_information', 'authorize_construction', 'cancel_construction',
  'command_military_operations', 'fund_construction', 'propose_construction',
  'sponsor_budget_reform', 'sponsor_fiscal_reform', 'sponsor_legislation',
] as const satisfies readonly AuthorityCapability[];

const agendaCapabilities = (): AuthorityCapability[] => [...GOVERNMENT_AGENDA_CAPABILITIES];

/** What a reconciled authority basis establishes: the government agenda when the basis makes the
 *  office the Country's chief executive, nothing when the authority stays unresolved. */
export function capabilitiesForReconciledAuthority(basis: AuthorityBasis): AuthorityCapability[] {
  return isResolvedExecutiveAuthorityBasis(basis) ? agendaCapabilities() : [];
}

/** The capabilities the modelled abstraction deliberately does not grant to an executive office, so
 *  an unavailable or non-modelled power is stated rather than silently missing. */
export function withheldExecutiveCapabilities(role: PoliticalOfficeRole, granted: readonly AuthorityCapability[]): AuthorityCapability[] {
  if (!(NATIONAL_EXECUTIVE_OFFICE_ROLES as readonly string[]).includes(role)) return [];
  return AUTHORITY_CAPABILITIES.filter(capability => !granted.includes(capability));
}

export type NationalExecutiveAuthorityStatus =
  | 'resolved'
  | 'unresolved'
  | 'no_office'
  | 'not_a_national_executive_office'
  | 'evidence_inconsistent';

/** What the persisted evidence of a person's office establishes about the exercise of national
 *  governmental authority. This is the single source of truth for the national-leader start route:
 *  a reconciled identity is not a resolved authority, and an unresolved authority is never turned
 *  into capabilities to make the person playable. */
export interface NationalExecutiveAuthority {
  status: NationalExecutiveAuthorityStatus;
  /** Sourced executive system of the person's Country, or `unavailable`. */
  system: ExecutiveSystem;
  role?: PoliticalOfficeRole;
  title?: string;
  basis?: AuthorityBasis;
  /** Capabilities established by the office evidence. Empty unless the status is `resolved`. */
  capabilities: AuthorityCapability[];
  /** Capabilities the modelled abstraction deliberately does not grant this office (the
   *  parliamentary suffrage, and every power an unresolved or contradictory status could not
   *  establish). Stated explicitly so a withheld power is never mistaken for a modelled one. */
  withheldCapabilities: AuthorityCapability[];
  limitations: string[];
}

export function nationalExecutiveAuthority(input: { person: PoliticalPersonState; date: string; registry?: PoliticalRegistry }): NationalExecutiveAuthority {
  const registry = input.registry ?? politicalRegistry;
  const office = input.person.office;
  const system = sourcedExecutiveSystem(input.person.countryId, registry);
  if (!office) return {
    status: 'no_office', system, capabilities: [], withheldCapabilities: [],
    limitations: ['No public office is recorded for this person; no national executive authority is inferred.'],
  };
  if (!(NATIONAL_EXECUTIVE_OFFICE_ROLES as readonly string[]).includes(office.role)) return {
    status: 'not_a_national_executive_office', role: office.role, title: office.title, system, capabilities: [], withheldCapabilities: [],
    limitations: [`Role ${office.role} is not a national executive office; it never establishes national governmental authority.`],
  };
  const errors = persistedOfficeEvidenceErrors(input.person, input.date);
  if (errors.length) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, system, capabilities: [], withheldCapabilities: [...AUTHORITY_CAPABILITIES],
    limitations: errors,
  };
  const evidence = office.evidence;
  if (!evidence || evidence.status !== 'source_reconciled') return {
    status: 'unresolved', role: office.role, title: office.title, system, capabilities: [], withheldCapabilities: [...AUTHORITY_CAPABILITIES],
    limitations: ['The office carries no reconciled institutional provenance, so its gameplay authority is unresolved. No capability is inferred from the role alone.'],
  };
  const basis = evidence.authorityBasis;
  if (!isResolvedExecutiveAuthorityBasis(basis)) return {
    status: 'unresolved', role: office.role, title: office.title, basis, system, capabilities: [], withheldCapabilities: [...AUTHORITY_CAPABILITIES],
    limitations: [system === 'unavailable'
      ? 'The political registry does not establish a sourced executive system for this Country, so the officeholder identity is reconciled but the office\'s gameplay authority is unresolved.'
      : `The sourced institutional evidence does not resolve how this ${office.role.replace(/_/g, ' ')} office exercises governmental authority in a ${system.replace(/_/g, ' ')} system. No capabilities are inferred; this does not assert that the office has no powers.`],
  };
  if (basis !== executiveAuthorityBasis(system, office.role)) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, basis, system, capabilities: [], withheldCapabilities: [...AUTHORITY_CAPABILITIES],
    limitations: [`Persisted authority basis ${basis} does not match the executive system the political registry establishes for this Country (${system}).`],
  };
  const expected = capabilitiesForReconciledAuthority(basis);
  if (expected.length !== office.authorityProfile.capabilities.length
    || expected.some(capability => !office.authorityProfile.capabilities.includes(capability))) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, basis, system, capabilities: [], withheldCapabilities: [...AUTHORITY_CAPABILITIES],
    limitations: ['Persisted capabilities are inconsistent with the office\'s reconciled authority basis; no gameplay authority is derived from contradictory evidence.'],
  };
  const capabilities = [...office.authorityProfile.capabilities].sort() as AuthorityCapability[];
  return {
    status: 'resolved', role: office.role, title: office.title, basis, system, capabilities,
    withheldCapabilities: withheldExecutiveCapabilities(office.role, capabilities),
    limitations: [office.authorityProfile.limitation],
  };
}

export function persistedOfficeEvidenceErrors(person: PoliticalPersonState, date: string): string[] {
  const office = person.office, evidence = office?.evidence;
  if (!office || !evidence) return [];
  const errors: string[] = [];
  if (evidence.status !== 'source_reconciled' || office.countryId !== person.countryId
    || !['head_of_government', 'head_of_state'].includes(office.role)
    || !identifiers(evidence.sourceOfficeIds) || !evidence.sourceOfficeIds.includes(evidence.sourceOfficeId)
    || !identifiers(evidence.sourceRecordIds) || !/^wikidata:Q[1-9]\d*$/.test(evidence.sourcePersonId)
    || !dateValid(evidence.referenceDate) || evidence.referenceDate > date
    || evidence.effectiveFrom !== undefined && (!dateValid(evidence.effectiveFrom) || evidence.effectiveFrom > evidence.referenceDate)
    || person.leaderProvenance?.sourceLeader && person.leaderProvenance.sourceLeader.id !== evidence.sourcePersonId) {
    errors.push(`Office ${person.id} has invalid persisted source reconciliation evidence.`);
  }
  const capabilities = office.authorityProfile.capabilities;
  const expected = capabilitiesForReconciledAuthority(evidence.authorityBasis);
  if (!['institutional_authority_unresolved', 'sourced_parliamentary_head_of_government', 'sourced_presidential_head_of_state'].includes(evidence.authorityBasis)
    || evidence.authorityBasis === 'sourced_parliamentary_head_of_government' && office.role !== 'head_of_government'
    || evidence.authorityBasis === 'sourced_presidential_head_of_state' && office.role !== 'head_of_state'
    || capabilities.length !== expected.length || expected.some(capability => !capabilities.includes(capability))) {
    errors.push(`Office ${person.id} has capabilities inconsistent with its persisted authority basis.`);
  }
  return errors;
}
