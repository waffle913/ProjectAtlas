import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type AmendmentStatus, type ConstitutionalDispositionKind, type ConstitutionalRights, type EmergencyConstitution, type JudicialEffect, type JudicialTiming, type JudicialVerdict, type PendingAmendment } from './model';
import { POLITICAL_ISSUES } from '../politics/model';

/** A person holding the executive office of the Country (head of government or head of state). */
const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const activeCrisisEpisodes = (state: SimulationState, countryId: string) =>
  Object.values(state.crisis.countries[countryId]?.currentByType ?? {}).filter(episode => episode.state === 'ACTIVE');

const hasActiveCrisis = (state: SimulationState, countryId: string): boolean => activeCrisisEpisodes(state, countryId).length > 0;

/** Declare a state of emergency. Requires an active crisis and the executive office. The justifying
 *  crises are recorded by permanent episode identity, never by type alone. */
export function declareEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may declare a state of emergency.');
  if (!hasActiveCrisis(state, countryId)) throw new Error('A state of emergency requires an active crisis.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const justificationEpisodeIds = activeCrisisEpisodes(state, countryId).map(episode => episode.id);
  const emergency: EmergencyConstitution = {
    status: 'active', justificationEpisodeIds,
    restrictions: { assembliesBanned: true, strikesBanned: true, policePowersEnhanced: true, bordersClosed: true },
  };
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency } } } };
}

/** End a state of emergency and lift every restriction. */
export function endEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may end a state of emergency.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency: { status: 'none', justificationEpisodeIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false } } } } } };
}

/** Schedule an adopted amendment to apply at its effective date, recording the constitutional
 *  judicial-review timing/effect (the court's power, never a verdict). The effect is never applied
 *  before the effective date. */
export function scheduleConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; effectiveDate: string; payload: PendingAmendment['payload'] }): SimulationState {
  const judicialReview = state.constitution.countries[proposal.countryId]?.judicialReview ?? { timing: 'unavailable' as const, effect: 'unavailable' as const };
  const pending: PendingAmendment = { instrumentId: proposal.id, countryId: proposal.countryId, applyOn: proposal.effectiveDate, payload: proposal.payload, status: 'scheduled', judicialReview: { timing: judicialReview.timing, effect: judicialReview.effect } };
  return { ...state, constitution: { ...state.constitution, pendingAmendments: [...state.constitution.pendingAmendments, pending] } };
}

const findPending = (state: SimulationState, instrumentId: string): PendingAmendment => {
  const amendment = state.constitution.pendingAmendments.find(item => item.instrumentId === instrumentId);
  if (!amendment) throw new Error(`Unknown scheduled constitutional amendment: ${instrumentId}.`);
  return amendment;
};

const replacePending = (state: SimulationState, amendment: PendingAmendment): SimulationState => ({
  ...state,
  constitution: { ...state.constitution, pendingAmendments: state.constitution.pendingAmendments.map(item => item.instrumentId === amendment.instrumentId ? amendment : item) },
});

const courtExists = (state: SimulationState, countryId: string): boolean => state.constitution.countries[countryId]?.judicialReview.courtExists === 'exists';

const hasDecision = (amendment: PendingAmendment): boolean => amendment.decision !== undefined;

const pickFields = <T extends object>(source: T, changed: object): Partial<T> =>
  Object.fromEntries(Object.keys(changed).filter(key => key in source).map(key => [key, (source as Record<string, unknown>)[key]])) as Partial<T>;

/** Capture the limited inverse: only the pre-amendment values of the fields this payload actually
 *  changes. A posteriori annulment restores exactly these, never a full snapshot that could erase a
 *  later amendment. Material keys are reversed from the payload lists, not from this record. */
function captureAppliedInverse(state: SimulationState, countryId: string, payload: PendingAmendment['payload']): PendingAmendment['appliedInverse'] {
  const entry = state.constitution.countries[countryId];
  if (!entry) return undefined;
  const inverse: NonNullable<PendingAmendment['appliedInverse']> = {};
  if (payload.rightsChanges && Object.keys(payload.rightsChanges).length) inverse.rights = pickFields(entry.rights, payload.rightsChanges);
  if (payload.parliamentChanges && Object.keys(payload.parliamentChanges).length) inverse.parliament = pickFields(entry.parliament, payload.parliamentChanges);
  if (payload.executiveChanges?.headOfState && Object.keys(payload.executiveChanges.headOfState).length) inverse.headOfState = pickFields(entry.headOfState, payload.executiveChanges.headOfState);
  if (payload.executiveChanges?.government && Object.keys(payload.executiveChanges.government).length) inverse.government = pickFields(entry.government, payload.executiveChanges.government);
  if (payload.electionChanges && Object.keys(payload.electionChanges).length) inverse.election = pickFields(entry.election, payload.electionChanges);
  if (payload.judicialChanges && Object.keys(payload.judicialChanges).length) inverse.judicialReview = pickFields(entry.judicialReview, payload.judicialChanges);
  if (payload.territoryChanges) inverse.territory = pickFields(entry.territory, payload.territoryChanges);
  if (payload.amendmentChanges && Object.keys(payload.amendmentChanges).length) inverse.amendment = pickFields(entry.amendment, payload.amendmentChanges);
  return inverse;
}

const personAccessorKinds = (person: SimulationState['governance']['persons'][string]): Array<'executive' | 'government' | 'parliament' | 'parliamentary_parties' | 'citizens'> => {
  const kinds: Array<'executive' | 'government' | 'parliament' | 'parliamentary_parties' | 'citizens'> = [];
  const role = person.office?.role;
  if (person.office?.countryId === person.countryId) {
    if (role === 'head_of_government' || role === 'head_of_state') kinds.push('executive');
    if (role === 'head_of_government' || role === 'minister') kinds.push('government');
    if (role === 'legislator') kinds.push('parliament');
  }
  if (person.isPartyLeader) kinds.push('parliamentary_parties');
  kinds.push('citizens');
  return kinds;
};

/** Refer an amendment to the constitutional court (saisine). The constitution's accessors are
 *  enforced, and the saisine timing follows the real judicial-review timing: `both` allows a priori
 *  (before application) and a posteriori (after application); `none`/`unavailable` refuse a saisine. */
export function referAmendmentForJudicialReview(state: SimulationState, instrumentId: string, byPersonId: string): SimulationState {
  const amendment = findPending(state, instrumentId);
  const person = state.governance.persons[byPersonId];
  if (!person || person.status !== 'active' || person.countryId !== amendment.countryId) throw new Error('Only an active person of the Country may refer the amendment.');
  const timing: JudicialTiming = amendment.judicialReview.timing;
  if (timing === 'none' || timing === 'unavailable') throw new Error('This constitution provides no judicial review; no saisine is possible.');
  if (!['scheduled', 'promulgated'].includes(amendment.status)) throw new Error('Only a scheduled or applied amendment may be referred for judicial review.');
  if (!courtExists(state, amendment.countryId)) throw new Error('This Country has no constitutional court to review the amendment.');
  const accessors = state.constitution.countries[amendment.countryId]?.judicialReview.accessors ?? [];
  const kinds = personAccessorKinds(person);
  if (!accessors.some(kind => kinds.includes(kind))) throw new Error('This person is not among the constitutional accessors who may seize the court.');
  const applied = amendment.appliedOn !== undefined;
  if (timing === 'before_promulgation' && applied) throw new Error('This constitution allows only a priori review; an already-applied amendment cannot be seized again.');
  if (timing === 'after_promulgation' && !applied) throw new Error('This constitution allows only a posteriori review; the amendment has not been applied yet.');
  const referralTiming: AmendmentReferralTiming = applied ? 'after_promulgation' : 'before_promulgation';
  return replacePending(state, { ...amendment, status: 'referred', referral: { on: state.date, byPersonId, timing: referralTiming } });
}

type AmendmentReferralTiming = 'before_promulgation' | 'after_promulgation';

/** The constitutional court's verdict. This is a modelled institution, not a person acting: the
 *  verdict is distinct from the court's constitutional power (judicialReview.effect), which only
 *  constrains which verdicts are admissible. */
export function decideAmendmentJudicialReview(state: SimulationState, instrumentId: string, verdict: { outcome: JudicialVerdict; effect: JudicialEffect }): SimulationState {
  const amendment = findPending(state, instrumentId);
  if (amendment.status !== 'referred') throw new Error('Only a referred amendment may receive a judicial decision.');
  const grantedEffect = amendment.judicialReview.effect;
  if (grantedEffect === 'unavailable') throw new Error('This constitution grants the court no known power; a verdict cannot be issued from an unavailable power.');
  const admissible = verdict.outcome === 'clear'
    ? true
    : verdict.outcome === 'annulled' ? grantedEffect === 'annul'
    : verdict.outcome === 'incompatible' ? grantedEffect === 'declare_incompatibility'
    : verdict.outcome === 'advisory' ? grantedEffect === 'advisory_only'
    : false;
  if (!admissible) throw new Error(`Verdict ${verdict.outcome} is not within the court's constitutional power (${grantedEffect}).`);
  if (verdict.effect !== grantedEffect) throw new Error('The exercised effect must equal the court\'s granted constitutional effect.');
  const decision = { outcome: verdict.outcome, effect: verdict.effect, on: state.date };
  if (verdict.outcome === 'annulled') {
    // A posteriori annulment reverses only this amendment's own changes; a priori annulment just blocks.
    if (amendment.appliedOn) {
      const reversed = reverseConstitutionalAmendment(state, amendment);
      return replacePending(reversed, { ...amendment, status: 'annulled', decision });
    }
    return replacePending(state, { ...amendment, status: 'annulled', decision });
  }
  if (verdict.outcome === 'incompatible') {
    // Distinct from annulment: the incompatibility is recorded without reversing the applied effects.
    return replacePending(state, { ...amendment, status: 'incompatible', decision });
  }
  // A clear or advisory verdict removes the a priori block only when the amendment was not yet applied.
  if (amendment.appliedOn) {
    // Already applied (a posteriori review): stays promulgated — never re-scheduled or re-applied.
    return replacePending(state, { ...amendment, status: 'promulgated', decision });
  }
  return replacePending(state, { ...amendment, status: 'scheduled', decision });
}

/** Apply amendments whose effective date has arrived, exactly once. Terminal amendments are never
 *  reprocessed; a mandatory a priori review that is still pending is recorded as `referred`, not
 *  silently dropped or repeatedly retried. */
export function applyDueAmendments(state: SimulationState): SimulationState {
  const due = state.constitution.pendingAmendments.filter(amendment => amendment.applyOn <= state.date && amendment.status === 'scheduled');
  if (!due.length) return state;
  let next = state;
  for (const amendment of due) {
    const terminal = (status: AmendmentStatus, extra: Partial<PendingAmendment> = {}): void => {
      next = replacePending(next, { ...amendment, ...extra, status });
    };
    const enacted = next.governance.proposals[amendment.instrumentId]?.status === 'enacted' && next.governance.proposals[amendment.instrumentId]?.kind === 'constitutional_amendment';
    if (!enacted) { terminal('blocked', { blockReason: 'not_enacted' }); continue; }
    const timing: JudicialTiming = amendment.judicialReview.timing;
    const requiresPrior = timing === 'before_promulgation' || timing === 'both';
    if (requiresPrior) {
      if (!courtExists(next, amendment.countryId)) { terminal('blocked', { blockReason: 'judicial_review_unavailable' }); continue; }
      if (!hasDecision(amendment)) {
        // Obligatory a priori control: the amendment is seized by the court and awaits a verdict.
        terminal('referred', { referral: { on: state.date, timing: 'before_promulgation' } });
        continue;
      }
      if (amendment.decision!.outcome === 'annulled' || amendment.decision!.outcome === 'incompatible') { continue; }
    }
    const appliedInverse = timing === 'after_promulgation' || timing === 'both' ? captureAppliedInverse(next, amendment.countryId, amendment.payload) : undefined;
    next = applyConstitutionalAmendment(next, { id: amendment.instrumentId, countryId: amendment.countryId, payload: amendment.payload }).next;
    terminal('promulgated', { appliedOn: state.date, ...(appliedInverse ? { appliedInverse } : {}) });
  }
  return next;
}

/** Monthly pass: while an emergency's justification episodes are no longer active, expire it and add
 *  a progressively accumulating causal dissatisfaction driver for every month the restrictions are
 *  maintained without justification. Episode identity — not crisis type — decides justification. */
export function runEmergencyMonth(state: SimulationState): SimulationState {
  let changed = false;
  const countries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    const emergency = entry.emergency;
    if (emergency.status === 'none') { countries[countryId] = entry; continue; }
    const currentEpisodes = state.crisis.countries[countryId]?.currentByType ?? {};
    const justificationActive = emergency.justificationEpisodeIds.length > 0 && emergency.justificationEpisodeIds.some(episodeId =>
      Object.values(currentEpisodes).some(episode => episode.id === episodeId && episode.state === 'ACTIVE'));
    if (justificationActive) {
      if (emergency.status === 'expired' && emergency.justificationEpisodeIds.length) {
        // A justifying crisis resumed; the emergency is justified again.
        countries[countryId] = { ...entry, emergency: { ...emergency, status: 'active', unjustifiedSince: undefined } };
        changed = true;
      } else countries[countryId] = entry;
      continue;
    }
    // No justification: expire (once) and add a progressive public-order driver every month.
    const unjustifiedSince = emergency.unjustifiedSince ?? state.date;
    countries[countryId] = { ...entry, emergency: { ...emergency, status: 'expired', unjustifiedSince, discontentDriversApplied: (emergency.discontentDriversApplied ?? 0) + 1 } };
    changed = true;
    const country = state.politics.countries[countryId];
    if (country) {
      state = { ...state, politics: { ...state.politics, countries: { ...state.politics.countries, [countryId]: { ...country, recentOpinionDrivers: [...country.recentOpinionDrivers, { date: state.date, drivers: [POLITICAL_ISSUES.indexOf('public_order')] }].slice(-12) } } } };
    }
  }
  return changed ? { ...state, constitution: { ...state.constitution, countries } } : state;
}

/** Canonical material keys a fiscal proposal would actually modify, determined by comparing the
 *  proposed value against the current fiscal state — not by the mere presence of a payload field. */
const fiscalMaterialKeys = (state: SimulationState, countryId: string, payload: { policy?: Record<string, unknown>; annualBudget?: Record<string, number> }): string[] => {
  const keys: string[] = [];
  const current = state.fiscal.countries[countryId];
  const currentPolicy = (current?.policy ?? {}) as Record<string, unknown>;
  for (const [category, proposed] of Object.entries(payload.policy ?? {})) {
    if (proposed === undefined) continue;
    const key = `fiscal.${category}`;
    if (proposed === null) { if (currentPolicy[category] !== undefined && currentPolicy[category] !== null) keys.push(key); continue; }
    const existing = currentPolicy[category];
    if (JSON.stringify(proposed) !== JSON.stringify(existing)) keys.push(key);
  }
  const currentBudget = (current?.annualBudget ?? {}) as Record<string, number>;
  for (const [category, value] of Object.entries(payload.annualBudget ?? {})) {
    if (currentBudget[category] !== value) keys.push(`fiscal.annualBudget.${category}`);
  }
  return keys;
};

/** Reject an ordinary-law proposal that would modify a constitutionally protected material key. */
export function rejectProtectedModification(state: SimulationState, countryId: string, instrumentClass: string, payload: { policy?: Record<string, unknown>; annualBudget?: Record<string, number> }): string | undefined {
  if (instrumentClass === 'constitutional_amendment') return undefined;
  const protectedKeys = state.constitution.countries[countryId]?.protectedMaterialKeys ?? [];
  const modified = fiscalMaterialKeys(state, countryId, payload).filter(key => protectedKeys.includes(key));
  if (modified.length) return `Ordinary law cannot modify constitutionally protected material keys: ${modified.join(', ')}. A constitutional amendment is required.`;
  return undefined;
}

/** Record the material keys a secondary constitutional disposition protects. Internal: only an
 *  enacted amendment (via applyConstitutionalAmendment) may call this. */
function registerConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const merged = [...new Set([...entry.protectedMaterialKeys, ...materialKeys])].sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'protected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

/** Remove constitutional protection of material keys. Internal: only an enacted amendment may call this. */
function removeConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const removed = new Set(materialKeys);
  const merged = entry.protectedMaterialKeys.filter(key => !removed.has(key)).sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'unprotected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

/** Apply an adopted constitutional amendment: protect/unprotect material keys and revise the
 *  constitution's rights record. Internal: it requires canonical proof of an enacted instrument, so
 *  it can never be used to bypass parliamentary adoption. The owning governance runtime schedules
 *  the amendment and the monthly task applies it exactly once. */
function applyConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; payload: PendingAmendment['payload'] }): { next: SimulationState; protectedMaterialKeys: string[]; unprotectedMaterialKeys: string[] } {
  const instrument = state.governance.proposals[proposal.id];
  if (!instrument || instrument.status !== 'enacted' || instrument.kind !== 'constitutional_amendment') throw new Error('Only an enacted constitutional amendment may be applied.');
  const protect = proposal.payload.materialKeysToProtect ?? [];
  const unprotect = proposal.payload.materialKeysToUnprotect ?? [];
  const unknown = [...protect, ...unprotect].filter(key => !(MATERIAL_KEYS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`Unknown material keys cannot be constitutionally protected: ${unknown.join(', ')}.`);
  let next = state;
  if (protect.length) next = registerConstitutionalBinding(next, proposal.countryId, protect, proposal.id);
  if (unprotect.length) next = removeConstitutionalBinding(next, proposal.countryId, unprotect, proposal.id);
  const entry = next.constitution.countries[proposal.countryId];
  if (entry) {
    const p = proposal.payload;
    const updated = { ...entry };
    if (p.rightsChanges && Object.keys(p.rightsChanges).length) updated.rights = { ...entry.rights, ...p.rightsChanges };
    if (p.parliamentChanges && Object.keys(p.parliamentChanges).length) updated.parliament = { ...entry.parliament, ...p.parliamentChanges };
    if (p.executiveChanges?.headOfState) updated.headOfState = { ...entry.headOfState, ...p.executiveChanges.headOfState };
    if (p.executiveChanges?.government) updated.government = { ...entry.government, ...p.executiveChanges.government };
    if (p.electionChanges && Object.keys(p.electionChanges).length) updated.election = { ...entry.election, ...p.electionChanges };
    if (p.judicialChanges && Object.keys(p.judicialChanges).length) updated.judicialReview = { ...entry.judicialReview, ...p.judicialChanges };
    if (p.territoryChanges) updated.territory = { ...entry.territory, ...p.territoryChanges };
    if (p.amendmentChanges && Object.keys(p.amendmentChanges).length) updated.amendment = { ...entry.amendment, ...p.amendmentChanges };
    next = { ...next, constitution: { ...next.constitution, countries: { ...next.constitution.countries, [proposal.countryId]: updated } } };
  }
  return { next, protectedMaterialKeys: protect, unprotectedMaterialKeys: unprotect };
}

/** Reverse an already-applied amendment after a posteriori annulment. It restores only the fields and
 *  material keys this amendment actually changed (the limited inverse), never a full snapshot that
 *  could erase a later amendment. Material keys are rebuilt by replaying the dated binding trace
 *  without this instrument, so a later amendment's protection or removal of the same key survives.
 *  `declare_incompatibility` never calls this — it does not reverse. */
function reverseConstitutionalAmendment(state: SimulationState, amendment: PendingAmendment): SimulationState {
  const entry = state.constitution.countries[amendment.countryId];
  if (!entry) return state;
  const inverse = amendment.appliedInverse;
  // Every protection/removal is traced as a dated binding event, so the protected set is exactly the
  // replay of the remaining trace (baseline empty at initialization). Filtering this instrument out
  // and replaying never erases a later amendment's change — even for the same material key.
  const events = entry.bindingEvents
    .filter(event => event.instrumentId !== amendment.instrumentId)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const keys = new Set<string>();
  for (const event of events) {
    if (event.action === 'protected') keys.add(event.materialKey);
    else keys.delete(event.materialKey);
  }
  const updated = { ...entry, protectedMaterialKeys: [...keys].sort(), bindingEvents: events };
  if (inverse?.rights) updated.rights = { ...entry.rights, ...inverse.rights };
  if (inverse?.parliament) updated.parliament = { ...entry.parliament, ...inverse.parliament };
  if (inverse?.headOfState) updated.headOfState = { ...entry.headOfState, ...inverse.headOfState };
  if (inverse?.government) updated.government = { ...entry.government, ...inverse.government };
  if (inverse?.election) updated.election = { ...entry.election, ...inverse.election };
  if (inverse?.judicialReview) updated.judicialReview = { ...entry.judicialReview, ...inverse.judicialReview };
  if (inverse?.territory) updated.territory = { ...entry.territory, ...inverse.territory };
  if (inverse?.amendment) updated.amendment = { ...entry.amendment, ...inverse.amendment };
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [amendment.countryId]: updated } } };
}

export const constitutionVersion = () => CONSTITUTION_VERSION;

export const runConstitutionMonth = (state: SimulationState) => runEmergencyMonth(applyDueAmendments(state));

export const registerConstitutionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'constitution.monthly', cadence: 'monthly', priority: 460, run: runConstitutionMonth });
