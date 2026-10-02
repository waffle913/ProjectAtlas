import { dateValid } from '../fiscal/math';
import { AUTHORITY_CAPABILITIES, type AuthorityCapability, type PoliticalOfficeRole, type PoliticalPersonState } from './model';

type AuthorityBasis = NonNullable<NonNullable<PoliticalPersonState['office']>['evidence']>['authorityBasis'];
const identifiers = (values: unknown): values is string[] => Array.isArray(values) && values.length > 0
  && values.every(value => typeof value === 'string' && value.trim().length > 0)
  && new Set(values).size === values.length;

export function executiveAuthorityBasis(system: string, role: PoliticalOfficeRole): AuthorityBasis {
  return system === 'presidential' && role === 'head_of_state' ? 'sourced_presidential_head_of_state'
    : (system === 'parliamentary' || system === 'monarchy_parliamentary') && role === 'head_of_government'
      ? 'sourced_parliamentary_head_of_government' : 'institutional_authority_unresolved';
}

export function capabilitiesForReconciledAuthority(basis: AuthorityBasis): AuthorityCapability[] {
  return basis === 'institutional_authority_unresolved' ? [] : [...AUTHORITY_CAPABILITIES];
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
