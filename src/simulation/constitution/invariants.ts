import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type ConstitutionStateEntry, type PendingAmendment } from './model';
import { governanceFingerprint } from '../governance/model';

const thresholds = ['parliamentaryThresholdBps', 'thresholdBps'] as const;
const validStatus = ['sourced', 'derived', 'modelled', 'unavailable'];
const validAmendmentStatus = ['scheduled', 'referred', 'promulgated', 'blocked', 'annulled', 'incompatible'];
const validTiming = ['before_promulgation', 'after_promulgation', 'both', 'none', 'unavailable'];
const validEffect = ['annul', 'declare_incompatibility', 'advisory_only', 'unavailable'];
const validVerdict = ['clear', 'annulled', 'incompatible', 'advisory'];
const PARLIAMENT_POWERS = ['decisive', 'legislative_and_censure', 'legislative', 'weak_legislative', 'consultative', 'none', 'unavailable'];
const HEAD_OF_STATE_SELECTIONS = ['popular_direct', 'popular_indirect', 'parliamentary', 'appointed', 'hereditary', 'other', 'unavailable'];
const GOVERNMENT_APPOINTMENTS = ['elected_directly', 'chosen_by_parliament', 'appointed_by_head_of_state', 'unavailable'];
const GOVERNMENT_RESPONSIBILITIES = ['none', 'government_censurable', 'leader_censurable', 'unavailable'];
const VACANCY_SUCCESSIONS = ['deputy_temporary', 'deputy_permanent', 'unavailable'];
const SUFFRAGE_MODES = ['universal', 'restricted', 'unavailable'];
const PARLIAMENTARY_SYSTEMS = ['majoritarian', 'proportional', 'mixed', 'unavailable'];
const REFERENDUM_RULES = ['never', 'always', 'principal_only', 'unavailable'];
const TERRITORIAL_ORGANIZATIONS = ['unitary', 'federal', 'unavailable'];
const REGIONAL_AUTONOMIES = ['none', 'autonomous_region_elected_leader', 'unavailable'];
const JUDICIAL_COURTS = ['exists', 'none', 'unavailable'];
const JUDICIAL_APPOINTMENTS = ['executive', 'parliament', 'shared', 'unavailable'];
const JUDICIAL_TERMS = ['years', 'life', 'unavailable'];
const JUDICIAL_TIMINGS = ['before_promulgation', 'after_promulgation', 'both', 'none', 'unavailable'];
const JUDICIAL_EFFECTS = ['annul', 'declare_incompatibility', 'advisory_only', 'unavailable'];
const REVISION_DOMAINS = ['rights', 'parliament', 'headOfState', 'government', 'election', 'judicialReview', 'territory', 'amendment'];
const RIGHT_LEVELS: Record<string, readonly string[]> = {
  expression: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], press: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  assembly: ['guaranteed', 'authorization_required', 'strongly_restricted', 'not_guaranteed', 'unavailable'], association: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  religion: ['guaranteed', 'limited', 'official_plus_tolerance', 'official_plus_restrictions', 'not_guaranteed', 'unavailable'],
  equalityBeforeLaw: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], antiDiscrimination: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  privateProperty: ['strong', 'guaranteed_with_legal_expropriation', 'weak', 'not_guaranteed', 'unavailable'], privacy: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  fairTrial: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], protectionFromArbitraryArrest: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  strike: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], union: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  vote: ['constitutional', 'ordinary_law_only', 'unavailable'], health: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'],
  education: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'], socialProtection: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'],
};
const enumOk = (value: unknown, allowed: readonly string[]) => allowed.includes(value as string);
const positiveInt = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
const nonNegativeInt = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const thresholdOk = (value: unknown) => value === undefined || value === null || (Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000);
const nonEmptyStrings = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0);

function validateEntry(entry: ConstitutionStateEntry, stateDate: string): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`Constitution ${entry.countryId}: ${message}`);
  if (!validStatus.includes(entry.coverage) || !validStatus.includes(entry.provenance.status)) { fail('invalid coverage.'); return errors; }
  const parliament = entry.parliament;
  if (!enumOk(parliament.power, PARLIAMENT_POWERS) || !['executive', 'parliament', 'unavailable'].includes(parliament.dissolutionHolder)
    || (parliament.termYears !== undefined && !positiveInt(parliament.termYears)) || !nonNegativeInt(parliament.chambers)) fail('invalid parliament constitution.');
  const head = entry.headOfState;
  if (!enumOk(head.selectionMethod, HEAD_OF_STATE_SELECTIONS) || !enumOk(head.suffrageMode, SUFFRAGE_MODES)
    || (head.termYears !== undefined && !positiveInt(head.termYears)) || (head.maxTerms !== undefined && !positiveInt(head.maxTerms))) fail('invalid head-of-state constitution.');
  const government = entry.government;
  if (!enumOk(government.appointmentMode, GOVERNMENT_APPOINTMENTS) || !enumOk(government.responsibility, GOVERNMENT_RESPONSIBILITIES)
    || !enumOk(government.vacancySuccession, VACANCY_SUCCESSIONS)) fail('invalid government constitution.');
  const amendment = entry.amendment;
  if (amendment && (!thresholdOk(amendment.parliamentaryThresholdBps) || !enumOk(amendment.referendum, REFERENDUM_RULES)
    || (amendment.procedureStatus !== undefined && !['sourced', 'modelled'].includes(amendment.procedureStatus)))) fail('invalid amendment constitution.');
  const election = entry.election;
  if (!enumOk(election.suffrage, SUFFRAGE_MODES)
    || (typeof election.mandatoryVoting !== 'boolean' && election.mandatoryVoting !== 'unavailable')
    || !enumOk(election.parliamentarySystem, PARLIAMENTARY_SYSTEMS)
    || (election.rounds !== 1 && election.rounds !== 2 && election.rounds !== 'unavailable')
    || !thresholdOk(election.thresholdBps)
    || (election.votingAge !== undefined && (!Number.isSafeInteger(election.votingAge) || election.votingAge < 1 || election.votingAge > 120))) fail('invalid election constitution.');
  for (const [field, level] of Object.entries(entry.rights)) {
    if (!RIGHT_LEVELS[field] || !enumOk(level, RIGHT_LEVELS[field])) fail(`invalid rights record for ${field}.`);
  }
  const judicial = entry.judicialReview;
  if (!enumOk(judicial.courtExists, JUDICIAL_COURTS) || !enumOk(judicial.appointment, JUDICIAL_APPOINTMENTS) || !enumOk(judicial.term, JUDICIAL_TERMS)
    || (judicial.termYears !== undefined && !positiveInt(judicial.termYears)) || !enumOk(judicial.timing, JUDICIAL_TIMINGS) || !enumOk(judicial.effect, JUDICIAL_EFFECTS)
    || !Array.isArray(judicial.accessors) || judicial.accessors.some(item => !['executive', 'government', 'parliament', 'parliamentary_parties', 'citizens'].includes(item))) fail('invalid judicial review constitution.');
  const territory = entry.territory;
  if (!enumOk(territory.organization, TERRITORIAL_ORGANIZATIONS) || !enumOk(territory.regionalAutonomy, REGIONAL_AUTONOMIES)
    || !Array.isArray(territory.delegatedCompetences) || territory.delegatedCompetences.some(item => typeof item !== 'string' || !item.trim())
    || !Array.isArray(territory.devolvedPowers)) fail('invalid territorial constitution.');
  for (const power of territory.devolvedPowers) {
    if (!power.regionId?.trim() || !nonEmptyStrings(power.competences) || !power.instrumentId?.trim() || !validDate(power.on) || power.on > stateDate) fail('invalid devolved-power record.');
  }
  for (const member of entry.courtMembers ?? []) {
    if (!member.personId?.trim() || !validDate(member.appointedOn) || member.appointedOn > stateDate
      || (member.termEnd !== undefined && (!validDate(member.termEnd) || member.termEnd < member.appointedOn))) fail('invalid constitutional court member record.');
  }
  for (const key of entry.protectedMaterialKeys) if (!(MATERIAL_KEYS as readonly string[]).includes(key)) fail(`protects an unknown material key ${key}.`);
  if (!Array.isArray(entry.protectedMaterialKeys) || entry.protectedMaterialKeys.some(key => typeof key !== 'string' || !key.trim())) fail('invalid protected material keys.');
  if (entry.bindingEvents && entry.bindingEvents.some(e => e.provenance !== 'constitutional_amendment' || !validDate(e.date) || e.date > stateDate || !['protected', 'unprotected'].includes(e.action) || !e.materialKey?.trim())) fail('invalid binding trace.');
  for (const event of entry.revisionEvents ?? []) {
    if (!validDate(event.date) || event.date > stateDate || !event.instrumentId?.trim() || !REVISION_DOMAINS.includes(event.domain)
      || !Array.isArray(event.changes) || event.changes.length === 0 || event.changes.some(change => !change.field?.trim())) fail('invalid revision trace.');
  }
  const restrictions = entry.emergency.restrictions;
  for (const field of [restrictions.assembliesBanned, restrictions.strikesBanned, restrictions.policePowersEnhanced, restrictions.bordersClosed]) if (typeof field !== 'boolean') fail('invalid emergency restriction.');
  if (!['none', 'active', 'expired'].includes(entry.emergency.status)) fail('invalid emergency status.');
  if (entry.emergency.status === 'none' && (entry.emergency.justificationEpisodeIds.length || entry.emergency.unjustifiedSince)) fail('inactive emergency carries justification residue.');
  // Justification is by permanent crisis episode identity (crisis:country:type:ordinal), never by type.
  for (const episodeId of entry.emergency.justificationEpisodeIds) if (typeof episodeId !== 'string' || !/^crisis:[^:]+:[^:]+:\d+$/.test(episodeId)) fail('invalid justifying episode identity.');
  if (entry.emergency.unjustifiedSince && !validDate(entry.emergency.unjustifiedSince)) fail('invalid unjustified-since date.');
  if (entry.emergency.discontentDriversApplied !== undefined && (!Number.isSafeInteger(entry.emergency.discontentDriversApplied) || entry.emergency.discontentDriversApplied < 0)) fail('invalid discontent counter.');
  if (!Array.isArray(entry.emergency.ministerialRecommendations)) fail('invalid ministerial recommendations.');
  else for (const recommendation of entry.emergency.ministerialRecommendations) {
    if (!validDate(recommendation.on) || recommendation.on > stateDate || !recommendation.byPersonId?.trim() || !recommendation.portfolioId?.trim()
      || recommendation.action !== 'end_emergency' || !recommendation.reason?.trim() || !['pending', 'acted_on'].includes(recommendation.status)) fail('invalid ministerial recommendation.');
  }
  return errors;
}

function validAmendment(amendment: PendingAmendment, stateDate: string): string[] {
  const errors: string[] = [];
  if (!amendment.instrumentId?.trim() || !amendment.countryId?.trim() || !validDate(amendment.applyOn) || typeof amendment.payloadFingerprint !== 'string' || !amendment.payloadFingerprint.trim()) errors.push('A pending amendment has an invalid identity, effective date or payload fingerprint.');
  if (!validAmendmentStatus.includes(amendment.status)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid status.`);
  if (!validTiming.includes(amendment.judicialReview?.timing) || !validEffect.includes(amendment.judicialReview?.effect)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid judicial review record.`);
  if (amendment.status === 'scheduled' && amendment.decision && amendment.decision.outcome !== 'clear' && amendment.decision.outcome !== 'advisory') errors.push(`Scheduled amendment ${amendment.instrumentId} carries a blocking verdict.`);
  if (amendment.status === 'referred' && !amendment.referral) errors.push(`Referred amendment ${amendment.instrumentId} has no referral record.`);
  if (amendment.status === 'referred' && amendment.decision) errors.push(`Referred amendment ${amendment.instrumentId} already carries a verdict.`);
  if (amendment.status === 'promulgated' && !amendment.appliedOn) errors.push(`Promulgated amendment ${amendment.instrumentId} was never applied.`);
  if (amendment.referral && (!validDate(amendment.referral.on) || amendment.referral.on > stateDate || !['before_promulgation', 'after_promulgation'].includes(amendment.referral.timing))) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid referral.`);
  if (amendment.decision && (!validVerdict.includes(amendment.decision.outcome) || !validEffect.includes(amendment.decision.effect) || !validDate(amendment.decision.on) || amendment.decision.on > stateDate)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid judicial decision.`);
  if (amendment.decision && (!Array.isArray(amendment.decision.grounds) || amendment.decision.grounds.length === 0 || amendment.decision.grounds.some(ground => typeof ground !== 'string' || !ground.trim()))) errors.push(`Pending amendment ${amendment.instrumentId} has a verdict without traceable institutional grounds.`);
  if (amendment.decision && amendment.referral && amendment.decision.on < amendment.referral.on) errors.push(`Pending amendment ${amendment.instrumentId} was decided before its saisine.`);
  if (amendment.decision?.outcome === 'annulled' && amendment.status !== 'annulled') errors.push(`Pending amendment ${amendment.instrumentId} has an annulling verdict without an annulled status.`);
  if (amendment.decision?.outcome === 'incompatible' && amendment.status !== 'incompatible') errors.push(`Pending amendment ${amendment.instrumentId} has an incompatibility verdict without an incompatible status.`);
  if (amendment.decision && (amendment.decision.outcome === 'clear' || amendment.decision.outcome === 'advisory') && !['scheduled', 'promulgated'].includes(amendment.status)) errors.push(`Pending amendment ${amendment.instrumentId} has a clearing verdict with an invalid status.`);
  if (amendment.appliedOn && (!validDate(amendment.appliedOn) || amendment.appliedOn > stateDate)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid application date.`);
  if (['annulled', 'incompatible', 'blocked', 'promulgated'].includes(amendment.status) && !amendment.decision && amendment.status !== 'blocked' && amendment.status !== 'promulgated') errors.push(`Pending amendment ${amendment.instrumentId} reached a verdict state without a verdict.`);
  if (amendment.blockReason && !['not_enacted', 'judicial_review_unavailable', 'payload_invalid'].includes(amendment.blockReason)) errors.push(`Pending amendment ${amendment.instrumentId} has an invalid block reason.`);
  // The locked vacancySuccession rule is never amendable.
  const governmentChanges = amendment.payload?.executiveChanges?.government as { vacancySuccession?: unknown } | undefined;
  if (governmentChanges && 'vacancySuccession' in governmentChanges) errors.push(`Pending amendment ${amendment.instrumentId} tries to amend the locked vacancySuccession rule.`);
  // Nested payload enums are validated at adoption; a pending must never carry an uncanonical material key.
  for (const key of [...(amendment.payload?.materialKeysToProtect ?? []), ...(amendment.payload?.materialKeysToUnprotect ?? [])]) {
    if (!(MATERIAL_KEYS as readonly string[]).includes(key)) errors.push(`Pending amendment ${amendment.instrumentId} protects an unknown material key ${key}.`);
  }
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
      if (entry.countryId !== countryId || !context.countryIds.has(countryId)) { errors.push(`Constitution ${countryId} has an invalid identity.`); continue; }
      errors.push(...validateEntry(entry, state.date));
      const nestedThresholds = [entry.amendment?.parliamentaryThresholdBps, entry.election?.thresholdBps];
      for (const value of nestedThresholds) {
        if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 10000)) errors.push(`Constitution ${countryId} has an invalid nested threshold.`);
      }
      if (entry.headOfState.termYears !== undefined && (!Number.isSafeInteger(entry.headOfState.termYears) || entry.headOfState.termYears <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state term.`);
      if (entry.headOfState.maxTerms !== undefined && (!Number.isSafeInteger(entry.headOfState.maxTerms) || entry.headOfState.maxTerms <= 0)) errors.push(`Constitution ${countryId} has an invalid head-of-state max terms.`);
      for (const episodeId of entry.emergency.justificationEpisodeIds) if (typeof episodeId !== 'string' || !episodeId.trim()) errors.push(`Constitution ${countryId} has an invalid justifying episode identity.`);
      // Every devolved competence must be linked to the Regions the amendment actually granted
      // autonomy to, with dated provenance — never a detached list.
      for (const power of entry.territory.devolvedPowers) {
        if (!context.regionIds.has(power.regionId)) errors.push(`Constitution ${countryId} devolves competences to unknown Region ${power.regionId}.`);
      }
    }
    const seen = new Set<string>();
    for (const amendment of constitution.pendingAmendments ?? []) {
      if (!amendment || seen.has(amendment.instrumentId)) { errors.push('Pending amendments contain a missing or duplicated instrument.'); continue; }
      seen.add(amendment.instrumentId);
      if (!constitution.countries[amendment.countryId] || amendment.countryId !== constitution.countries[amendment.countryId]?.countryId) errors.push(`Pending amendment ${amendment.instrumentId} references an unknown Country.`);
      errors.push(...validAmendment(amendment, state.date));
      // A pending is strictly bound to its canonical adopted instrument: the proposal must exist,
      // be a constitutional amendment, match country/effective date/payload, and — for every open
      // or promulgated pending — be enacted.
      const proposal = state.governance.proposals[amendment.instrumentId];
      if (!proposal || proposal.kind !== 'constitutional_amendment' || proposal.countryId !== amendment.countryId
        || proposal.effectiveDate !== amendment.applyOn || JSON.stringify(proposal.payload) !== JSON.stringify(amendment.payload)) {
        errors.push(`Pending amendment ${amendment.instrumentId} does not reconcile with its canonical proposal.`);
      } else {
        const expectedFingerprint = governanceFingerprint({ effectiveDate: amendment.applyOn, payload: amendment.payload });
        if (amendment.payloadFingerprint !== expectedFingerprint) errors.push(`Pending amendment ${amendment.instrumentId} has a payload fingerprint inconsistent with its instrument.`);
        if (!['blocked'].includes(amendment.status) && proposal.status !== 'enacted') errors.push(`Pending amendment ${amendment.instrumentId} is not backed by an enacted instrument.`);
      }
      // appliedInverse must be structurally coherent with the revision trace: every inverse field
      // belongs to a real change this instrument recorded (with the same pre-amendment value).
      const entry = constitution.countries[amendment.countryId];
      const inverseDomains = [
        ['rights', amendment.appliedInverse?.rights], ['parliament', amendment.appliedInverse?.parliament], ['headOfState', amendment.appliedInverse?.headOfState],
        ['government', amendment.appliedInverse?.government], ['election', amendment.appliedInverse?.election], ['judicialReview', amendment.appliedInverse?.judicialReview],
        ['territory', amendment.appliedInverse?.territory], ['amendment', amendment.appliedInverse?.amendment],
      ] as const;
      for (const [domain, inverse] of inverseDomains) {
        if (!inverse) continue;
        const events = (entry?.revisionEvents ?? []).filter(event => event.instrumentId === amendment.instrumentId && event.domain === domain);
        for (const [field, value] of Object.entries(inverse)) {
          const change = events.flatMap(event => event.changes).find(item => item.field === field);
          if (!change) { errors.push(`Pending amendment ${amendment.instrumentId} records an inverse for ${domain}.${field} without a matching revision event.`); continue; }
          if (JSON.stringify(change.before) !== JSON.stringify(value)) errors.push(`Pending amendment ${amendment.instrumentId} inverse for ${domain}.${field} does not match the recorded pre-amendment value.`);
        }
      }
    }
    return errors;
  },
};
