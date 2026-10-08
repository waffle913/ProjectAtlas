import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type ConstitutionalDispositionKind, type ConstitutionalRights, type EmergencyConstitution } from './model';

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
export function runEmergencyMonth(state: SimulationState): SimulationState {
  let changed = false;
  const countries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    if (entry.emergency.status === 'active' && entry.emergency.justificationCrisisIds.length && !hasActiveCrisis(state, countryId)) {
      countries[countryId] = { ...entry, emergency: { ...entry.emergency, status: 'expired' } };
      changed = true;
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
    if (proposed === null) { keys.push(key); continue; }
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

/** Record the material keys a secondary constitutional disposition protects. Only a constitutional
 *  amendment may call this; the `instrumentId` is required for the dated, traceable binding. */
export function registerConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const merged = [...new Set([...entry.protectedMaterialKeys, ...materialKeys])].sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'protected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

/** Remove constitutional protection of material keys, likewise only through a constitutional amendment. */
export function removeConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const removed = new Set(materialKeys);
  const merged = entry.protectedMaterialKeys.filter(key => !removed.has(key)).sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'unprotected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

/** Apply an adopted constitutional amendment: protect/unprotect material keys and revise the
 *  constitution's rights record. The owning governance runtime calls this exactly once on adoption. */
export function applyConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; payload: { materialKeysToProtect?: string[]; materialKeysToUnprotect?: string[]; rightChanges?: Partial<ConstitutionalRights> } }): { next: SimulationState; protectedMaterialKeys: string[]; unprotectedMaterialKeys: string[] } {
  const protect = proposal.payload.materialKeysToProtect ?? [];
  const unprotect = proposal.payload.materialKeysToUnprotect ?? [];
  const unknown = [...protect, ...unprotect].filter(key => !(MATERIAL_KEYS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`Unknown material keys cannot be constitutionally protected: ${unknown.join(', ')}.`);
  let next = state;
  if (protect.length) next = registerConstitutionalBinding(next, proposal.countryId, protect, proposal.id);
  if (unprotect.length) next = removeConstitutionalBinding(next, proposal.countryId, unprotect, proposal.id);
  if (proposal.payload.rightChanges && Object.keys(proposal.payload.rightChanges).length) {
    const entry = next.constitution.countries[proposal.countryId];
    if (entry) next = { ...next, constitution: { ...next.constitution, countries: { ...next.constitution.countries, [proposal.countryId]: { ...entry, rights: { ...entry.rights, ...proposal.payload.rightChanges } } } } };
  }
  return { next, protectedMaterialKeys: protect, unprotectedMaterialKeys: unprotect };
}

export const constitutionVersion = () => CONSTITUTION_VERSION;

export const registerConstitutionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'constitution.monthly', cadence: 'monthly', priority: 460, run: runEmergencyMonth });
