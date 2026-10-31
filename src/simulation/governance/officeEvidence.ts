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

export function capabilitiesForReconciledAuthority(basis: AuthorityBasis): AuthorityCapability[] {
  return basis === 'institutional_authority_unresolved' ? [] : [...AUTHORITY_CAPABILITIES];
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
  limitations: string[];
}

export function nationalExecutiveAuthority(input: { person: PoliticalPersonState; date: string; registry?: PoliticalRegistry }): NationalExecutiveAuthority {
  const registry = input.registry ?? politicalRegistry;
  const office = input.person.office;
  const system = sourcedExecutiveSystem(input.person.countryId, registry);
  if (!office) return {
    status: 'no_office', system, capabilities: [],
    limitations: ['No public office is recorded for this person; no national executive authority is inferred.'],
  };
  if (!(NATIONAL_EXECUTIVE_OFFICE_ROLES as readonly string[]).includes(office.role)) return {
    status: 'not_a_national_executive_office', role: office.role, title: office.title, system, capabilities: [],
    limitations: [`Role ${office.role} is not a national executive office; it never establishes national governmental authority.`],
  };
  const errors = persistedOfficeEvidenceErrors(input.person, input.date);
  if (errors.length) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, system, capabilities: [],
    limitations: errors,
  };
  const evidence = office.evidence;
  if (!evidence || evidence.status !== 'source_reconciled') return {
    status: 'unresolved', role: office.role, title: office.title, system, capabilities: [],
    limitations: ['The office carries no reconciled institutional provenance, so its gameplay authority is unresolved. No capability is inferred from the role alone.'],
  };
  const basis = evidence.authorityBasis;
  if (!isResolvedExecutiveAuthorityBasis(basis)) return {
    status: 'unresolved', role: office.role, title: office.title, basis, system, capabilities: [],
    limitations: [system === 'unavailable'
      ? 'The political registry does not establish a sourced executive system for this Country, so the officeholder identity is reconciled but the office\'s gameplay authority is unresolved.'
      : `The sourced institutional evidence does not resolve how this ${office.role.replace(/_/g, ' ')} office exercises governmental authority in a ${system.replace(/_/g, ' ')} system. No capabilities are inferred; this does not assert that the office has no powers.`],
  };
  if (basis !== executiveAuthorityBasis(system, office.role)) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, basis, system, capabilities: [],
    limitations: [`Persisted authority basis ${basis} does not match the executive system the political registry establishes for this Country (${system}).`],
  };
  const expected = capabilitiesForReconciledAuthority(basis);
  if (expected.length !== office.authorityProfile.capabilities.length
    || expected.some(capability => !office.authorityProfile.capabilities.includes(capability))) return {
    status: 'evidence_inconsistent', role: office.role, title: office.title, basis, system, capabilities: [],
    limitations: ['Persisted capabilities are inconsistent with the office\'s reconciled authority basis; no gameplay authority is derived from contradictory evidence.'],
  };
  return {
    status: 'resolved', role: office.role, title: office.title, basis, system,
    capabilities: [...office.authorityProfile.capabilities].sort(), limitations: [office.authorityProfile.limitation],
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
