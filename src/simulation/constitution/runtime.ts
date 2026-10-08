import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type ConstitutionalDispositionKind, type ConstitutionalRights, type EmergencyConstitution, type PendingAmendment } from './model';
import { POLITICAL_ISSUES } from '../politics/model';

/** A person holding the executive office of the Country (head of government or head of state). */
const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const hasActiveCrisis = (state: SimulationState, countryId: string): boolean =>
  Object.values(state.crisis.countries[countryId]?.currentByType ?? {}).some(episode => episode.state === 'ACTIVE');

/** Declare a state of emergency. Requires an active crisis and the executive office. */
export function declareEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may declare a state of emergency.');
  if (!hasActiveCrisis(state, countryId)) throw new Error('A state of emergency requires an active crisis.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const justificationCrisisIds = Object.entries(state.crisis.countries[countryId]?.currentByType ?? {})
    .filter(([, episode]) => episode.state === 'ACTIVE').map(([type]) => type);
  const emergency: EmergencyConstitution = {
    status: 'active', justificationCrisisIds,
    restrictions: { assembliesBanned: true, strikesBanned: true, policePowersEnhanced: true, bordersClosed: true },
  };
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency } } } };
}

/** End a state of emergency and lift every restriction. */
export function endEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may end a state of emergency.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency: { status: 'none', justificationCrisisIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false } } } } } };
}

/** Monthly pass: expire the emergency justification once its crises are no longer active. */
/** Schedule an adopted amendment to apply at its effective date, recording the constitutional
 *  judicial-review timing/effect. The effect is never applied before the effective date. */
export function scheduleConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; effectiveDate: string; payload: PendingAmendment['payload'] }): SimulationState {
  const judicialReview = state.constitution.countries[proposal.countryId]?.judicialReview ?? { timing: 'unavailable' as const, effect: 'unavailable' as const };
  const pending: PendingAmendment = { instrumentId: proposal.id, countryId: proposal.countryId, applyOn: proposal.effectiveDate, payload: proposal.payload, judicialReview: { timing: judicialReview.timing, effect: judicialReview.effect } };
  return { ...state, constitution: { ...state.constitution, pendingAmendments: [...state.constitution.pendingAmendments, pending] } };
}

/** Apply amendments whose effective date has arrived, exactly once. A blocked amendment is kept
 *  in the queue with a traceable decision, never silently dropped. */
export function applyDueAmendments(state: SimulationState): SimulationState {
  const due = state.constitution.pendingAmendments.filter(amendment => amendment.applyOn <= state.date);
  if (!due.length) return state;
  let next = state;
  const remaining = next.constitution.pendingAmendments.map(amendment => ({ ...amendment }));
  for (const amendment of due) {
    const index = remaining.findIndex(item => item.instrumentId === amendment.instrumentId);
    // Procedural provenance: only an enacted constitutional amendment may apply.
    const enacted = next.governance.proposals[amendment.instrumentId]?.status === 'enacted' && next.governance.proposals[amendment.instrumentId]?.kind === 'constitutional_amendment';
    if (!enacted) { if (index >= 0) remaining[index] = { ...remaining[index], blockedOn: state.date, decision: { timing: amendment.judicialReview.timing, effect: amendment.judicialReview.effect, outcome: 'blocked', on: state.date } }; continue; }
    if (amendment.judicialReview.timing === 'before_promulgation' || amendment.judicialReview.timing === 'both') {
      const courtExists = next.constitution.countries[amendment.countryId]?.judicialReview.courtExists === 'exists';
      if (!courtExists) { if (index >= 0) remaining[index] = { ...remaining[index], blockedOn: state.date, decision: { timing: amendment.judicialReview.timing, effect: amendment.judicialReview.effect, outcome: 'blocked', on: state.date } }; continue; }
      if (amendment.judicialReview.effect === 'annul') { if (index >= 0) remaining[index] = { ...remaining[index], decision: { timing: amendment.judicialReview.timing, effect: amendment.judicialReview.effect, outcome: 'annulled', on: state.date } }; continue; }
    }
    next = applyConstitutionalAmendment(next, { id: amendment.instrumentId, countryId: amendment.countryId, payload: amendment.payload }).next;
    if (index >= 0) remaining[index] = { ...remaining[index], decision: { timing: amendment.judicialReview.timing, effect: amendment.judicialReview.effect, outcome: 'promulgated', on: state.date } };
  }
  return { ...next, constitution: { ...next.constitution, pendingAmendments: remaining } };
}

/** Monthly pass: expire the emergency once its exact justification crises are no longer active;
 *  maintaining it without justification adds a causal dissatisfaction driver to opinion. */
export function runEmergencyMonth(state: SimulationState): SimulationState {
  let changed = false;
  const countries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    if (entry.emergency.status === 'active' && entry.emergency.justificationCrisisIds.length) {
      const currentByType = state.crisis.countries[countryId]?.currentByType ?? {};
      const justificationActive = entry.emergency.justificationCrisisIds.some(type => (currentByType as Record<string, { state: string } | undefined>)[type]?.state === 'ACTIVE');
      if (!justificationActive) {
        countries[countryId] = { ...entry, emergency: { ...entry.emergency, status: 'expired' } };
        changed = true;
        const country = state.politics.countries[countryId];
        if (country) state = { ...state, politics: { ...state.politics, countries: { ...state.politics.countries, [countryId]: { ...country, recentOpinionDrivers: [...country.recentOpinionDrivers, { date: state.date, drivers: [POLITICAL_ISSUES.indexOf('public_order')] }].slice(-12) } } } };
      } else countries[countryId] = entry;
    } else countries[countryId] = entry;
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
 *  constitution's rights record. The owning governance runtime calls this exactly once on adoption. */
export function applyConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; payload: PendingAmendment['payload'] }): { next: SimulationState; protectedMaterialKeys: string[]; unprotectedMaterialKeys: string[] } {
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

export const constitutionVersion = () => CONSTITUTION_VERSION;

export const runConstitutionMonth = (state: SimulationState) => runEmergencyMonth(applyDueAmendments(state));

export const registerConstitutionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'constitution.monthly', cadence: 'monthly', priority: 460, run: runConstitutionMonth });
