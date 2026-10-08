import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type PendingAmendment } from './model';

const thresholds = ['parliamentaryThresholdBps', 'thresholdBps'] as const;
const validStatus = ['sourced', 'derived', 'modelled', 'unavailable'];
const validAmendmentStatus = ['scheduled', 'referred', 'promulgated', 'blocked', 'annulled', 'incompatible'];
const validTiming = ['before_promulgation', 'after_promulgation', 'both', 'none', 'unavailable'];
const validEffect = ['annul', 'declare_incompatibility', 'advisory_only', 'unavailable'];
const validVerdict = ['clear', 'annulled', 'incompatible', 'advisory'];

function validAmendment(amendment: PendingAmendment, stateDate: string): string[] {
  const errors: string[] = [];
  if (!amendment.instrumentId?.trim() || !amendment.countryId?.trim() || !validDate(amendment.applyOn)) errors.push('A pending amendment has an invalid identity or effective date.');
  if (!validAmendmentStatus.includes(amendment.status)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid status.`);
  if (!validTiming.includes(amendment.judicialReview?.timing) || !validEffect.includes(amendment.judicialReview?.effect)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid judicial review record.`);
  if (amendment.status === 'scheduled' && amendment.decision && amendment.decision.outcome !== 'clear' && amendment.decision.outcome !== 'advisory') errors.push(`Scheduled amendment ${amendment.instrumentId} carries a blocking verdict.`);
  if (amendment.status === 'referred' && !amendment.referral) errors.push(`Referred amendment ${amendment.instrumentId} has no referral record.`);
  if (amendment.status === 'referred' && amendment.decision) errors.push(`Referred amendment ${amendment.instrumentId} already carries a verdict.`);
  if (amendment.status === 'promulgated' && !amendment.appliedOn) errors.push(`Promulgated amendment ${amendment.instrumentId} was never applied.`);
  if (amendment.referral && (!validDate(amendment.referral.on) || amendment.referral.on > stateDate || !['before_promulgation', 'after_promulgation'].includes(amendment.referral.timing))) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid referral.`);
  if (amendment.decision && (!validVerdict.includes(amendment.decision.outcome) || !validEffect.includes(amendment.decision.effect) || !validDate(amendment.decision.on) || amendment.decision.on > stateDate)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid judicial decision.`);
  if (amendment.decision?.outcome === 'annulled' && amendment.status !== 'annulled') errors.push(`Pending amendment ${amendment.instrumentId} has an annulling verdict without an annulled status.`);
  if (amendment.decision?.outcome === 'incompatible' && amendment.status !== 'incompatible') errors.push(`Pending amendment ${amendment.instrumentId} has an incompatibility verdict without an incompatible status.`);
  if (amendment.decision && (amendment.decision.outcome === 'clear' || amendment.decision.outcome === 'advisory') && !['scheduled', 'promulgated'].includes(amendment.status)) errors.push(`Pending amendment ${amendment.instrumentId} has a clearing verdict with an invalid status.`);
  if (amendment.appliedOn && (!validDate(amendment.appliedOn) || amendment.appliedOn > stateDate)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid application date.`);
  if (['annulled', 'incompatible', 'blocked', 'promulgated'].includes(amendment.status) && !amendment.decision && amendment.status !== 'blocked' && amendment.status !== 'promulgated') errors.push(`Pending amendment ${amendment.instrumentId} reached a verdict state without a verdict.`);
  if (amendment.blockReason && !['not_enacted', 'judicial_review_unavailable'].includes(amendment.blockReason)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid block reason.`);
  return errors;
}

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
      if (entry.amendment?.procedureStatus !== undefined && !['sourced', 'modelled'].includes(entry.amendment.procedureStatus)) errors.push(`Constitution ${countryId} has an invalid amendment procedure status.`);
      for (const key of entry.protectedMaterialKeys) if (!(MATERIAL_KEYS as readonly string[]).includes(key)) errors.push(`Constitution ${countryId} protects an unknown material key ${key}.`);
      if (entry.headOfState.termYears !== undefined && (!Number.isSafeInteger(entry.headOfState.termYears) || entry.headOfState.termYears <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state term.`);
      if (entry.headOfState.maxTerms !== undefined && (!Number.isSafeInteger(entry.headOfState.maxTerms) || entry.headOfState.maxTerms <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state max terms.`);
      if (!Array.isArray(entry.protectedMaterialKeys) || entry.protectedMaterialKeys.some(key => typeof key !== 'string' || !key.trim())) errors.push(`Constitution ${countryId} has invalid protected material keys.`);
      if (entry.bindingEvents && entry.bindingEvents.some(e => e.provenance !== 'constitutional_amendment' || !validDate(e.date) || e.date > state.date || !['protected', 'unprotected'].includes(e.action))) errors.push(`Constitution ${countryId} has an invalid binding trace.`);
      const restrictions = entry.emergency.restrictions;
      for (const field of [restrictions.assembliesBanned, restrictions.strikesBanned, restrictions.policePowersEnhanced, restrictions.bordersClosed]) if (typeof field !== 'boolean') errors.push(`Constitution ${countryId} has an invalid emergency restriction.`);
      if (!['none', 'active', 'expired'].includes(entry.emergency.status)) errors.push(`Constitution ${countryId} has an invalid emergency status.`);
      if (entry.emergency.status === 'none' && (entry.emergency.justificationEpisodeIds.length || entry.emergency.unjustifiedSince)) errors.push(`Constitution ${countryId} has an inactive emergency carrying justification residue.`);
      for (const episodeId of entry.emergency.justificationEpisodeIds) if (typeof episodeId !== 'string' || !episodeId.trim()) errors.push(`Constitution ${countryId} has an invalid justifying episode identity.`);
      if (entry.emergency.unjustifiedSince && !validDate(entry.emergency.unjustifiedSince)) errors.push(`Constitution ${countryId} has an invalid unjustified-since date.`);
      if (entry.emergency.discontentDriversApplied !== undefined && (!Number.isSafeInteger(entry.emergency.discontentDriversApplied) || entry.emergency.discontentDriversApplied < 0)) errors.push(`Constitution ${countryId} has an invalid discontent counter.`);
    }
    const seen = new Set<string>();
    for (const amendment of constitution.pendingAmendments ?? []) {
      if (!amendment || seen.has(amendment.instrumentId)) { errors.push('Pending amendments contain a missing or duplicated instrument.'); continue; }
      seen.add(amendment.instrumentId);
      if (!constitution.countries[amendment.countryId] || amendment.countryId !== constitution.countries[amendment.countryId]?.countryId) errors.push(`Pending amendment ${amendment.instrumentId} references an unknown Country.`);
      errors.push(...validAmendment(amendment, state.date));
    }
    return errors;
  },
};
