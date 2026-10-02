import politicalOffices from '../../data/political-offices.json';
import type { SimulationState } from '../../types';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { executiveAuthorityBasis, persistedOfficeEvidenceErrors } from './officeEvidence';

/** Current-source checks belong to initialization, never historical save validation. */
export function assertInitialOfficeReconciliation(state: SimulationState, registry: PoliticalRegistry = politicalRegistry): void {
  if (state.date !== politicalOffices.referenceDate || state.date !== registry.referenceDate) {
    throw new Error('Initial office reconciliation requires the scenario reference date.');
  }
  const holders = new Map(politicalOffices.officeholders.map(record => [record.officeId, record]));
  const offices = new Map(politicalOffices.offices.map(office => [office.id, office]));
  for (const person of Object.values(state.governance.persons)) {
    const office = person.office, evidence = office?.evidence;
    if (!office || !evidence) continue;
    const errors = persistedOfficeEvidenceErrors(person, state.date);
    if (errors.length) throw new Error(errors.join(' '));
    const holder = holders.get(evidence.sourceOfficeId), definition = offices.get(evidence.sourceOfficeId);
    const institution = registry.institutions[registry.countries[person.countryId]?.institutionId];
    const system = institution?.executiveSystemStatus === 'sourced' ? institution.executiveSystem : 'unavailable';
    if (evidence.referenceDate !== politicalOffices.referenceDate
      || !holder || holder.status !== 'available' || holder.person?.id !== evidence.sourcePersonId
      || holder.referenceDate !== evidence.referenceDate || holder.startDate !== evidence.effectiveFrom
      || !definition || definition.countryId !== person.countryId || definition.kind !== office.role
      || !evidence.sourceRecordIds.includes(holder.source.datasetId)
      || evidence.sourceOfficeIds.some(id => {
        const record = holders.get(id), sourceOffice = offices.get(id);
        return !record || record.status !== 'available' || record.person?.id !== evidence.sourcePersonId
          || record.referenceDate !== evidence.referenceDate || !sourceOffice || sourceOffice.countryId !== person.countryId;
      })) errors.push(`Office ${person.id} does not reconcile with the current initialization sources.`);
    if (evidence.authorityBasis !== executiveAuthorityBasis(system, office.role)) errors.push(`Office ${person.id} has capabilities inconsistent with its institutional evidence.`);
    if (person.displayName === holder?.person?.name) errors.push(`Officeholder ${person.id} uses its source person's name as gameplay identity.`);
    if (errors.length) throw new Error(errors.join(' '));
  }
}
