import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { CONSTITUTION_VERSION, MATERIAL_KEYS } from './model';

const thresholds = ['parliamentaryThresholdBps', 'thresholdBps'] as const;
const validStatus = ['sourced', 'derived', 'modelled', 'unavailable'];

export const constitutionInvariant: SimulationInvariant = {
  id: 'constitution-0.23-integrity',
  check(state, context) {
    const errors: string[] = [];
    const constitution = state.constitution;
    if (!constitution || constitution.version !== CONSTITUTION_VERSION) return ['Malformed constitution domain.'];
    if (constitution.initializedOn !== undefined && constitution.initializedOn > state.date) errors.push('Constitution domain is initialized after the current date.');
    for (const [countryId, entry] of Object.entries(constitution.countries)) {
      if (entry.countryId !== countryId || !context.countryIds.has(countryId)) errors.push(`Constitution ${countryId} has an invalid identity.`);
      if (!validStatus.includes(entry.coverage) || !validStatus.includes(entry.provenance.status)) errors.push(`Constitution ${countryId} has invalid coverage.`);
      const nestedThresholds = [entry.amendment?.parliamentaryThresholdBps, entry.election?.thresholdBps];
      for (const value of nestedThresholds) {
        if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 10000)) errors.push(`Constitution ${countryId} has an invalid nested threshold.`);
      }
      if (entry.amendment && !['never', 'always', 'principal_only', 'unavailable'].includes(entry.amendment.referendum)) errors.push(`Constitution ${countryId} has an invalid referendum rule.`);
      for (const key of entry.protectedMaterialKeys) if (!(MATERIAL_KEYS as readonly string[]).includes(key)) errors.push(`Constitution ${countryId} protects an unknown material key ${key}.`);
      if (entry.headOfState.termYears !== undefined && (!Number.isSafeInteger(entry.headOfState.termYears) || entry.headOfState.termYears <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state term.`);
      if (entry.headOfState.maxTerms !== undefined && (!Number.isSafeInteger(entry.headOfState.maxTerms) || entry.headOfState.maxTerms <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state max terms.`);
      if (!Array.isArray(entry.protectedMaterialKeys) || entry.protectedMaterialKeys.some(key => typeof key !== 'string' || !key.trim())) errors.push(`Constitution ${countryId} has invalid protected material keys.`);
      if (entry.bindingEvents && entry.bindingEvents.some(e => e.provenance !== 'constitutional_amendment' || !validDate(e.date) || e.date > state.date || !['protected', 'unprotected'].includes(e.action))) errors.push(`Constitution ${countryId} has an invalid binding trace.`);
      const restrictions = entry.emergency.restrictions;
      for (const field of [restrictions.assembliesBanned, restrictions.strikesBanned, restrictions.policePowersEnhanced, restrictions.bordersClosed]) if (typeof field !== 'boolean') errors.push(`Constitution ${countryId} has an invalid emergency restriction.`);
      if (!['none', 'active', 'expired'].includes(entry.emergency.status)) errors.push(`Constitution ${countryId} has an invalid emergency status.`);
    }
    return errors;
  },
};
