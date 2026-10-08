import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { CONSTITUTION_VERSION, type ConstitutionalDispositionKind, type EmergencyConstitution } from './model';

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

/** Canonical material keys a fiscal proposal would modify, used to reject ordinary modification
 *  of a constitutionally protected policy. */
const fiscalMaterialKeys = (payload: { policy?: { corporate?: unknown; personal?: unknown; consumption?: unknown; payroll?: unknown }; annualBudget?: Record<string, number> }): string[] => {
  const keys: string[] = [];
  if (payload.policy?.corporate) keys.push('fiscal.corporate.rate');
  if (payload.policy?.personal) keys.push('fiscal.personal');
  if (payload.policy?.consumption) keys.push('fiscal.consumption');
  if (payload.policy?.payroll) keys.push('fiscal.payroll');
  for (const category of Object.keys(payload.annualBudget ?? {})) keys.push(`fiscal.annualBudget.${category}`);
  return keys;
};

/** Reject an ordinary-law proposal that would modify a constitutionally protected material key. */
export function rejectProtectedModification(state: SimulationState, countryId: string, instrumentClass: string, fiscalPayload: { policy?: { corporate?: unknown; personal?: unknown; consumption?: unknown; payroll?: unknown }; annualBudget?: Record<string, number> }): string | undefined {
  if (instrumentClass === 'constitutional_amendment') return undefined;
  const protectedKeys = state.constitution.countries[countryId]?.protectedMaterialKeys ?? [];
  const modified = fiscalMaterialKeys(fiscalPayload).filter(key => protectedKeys.includes(key));
  if (modified.length) return `Ordinary law cannot modify constitutionally protected material keys: ${modified.join(', ')}. A constitutional amendment is required.`;
  return undefined;
}

/** Record the material keys a secondary constitutional disposition protects. */
export function registerConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[]): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const merged = [...new Set([...entry.protectedMaterialKeys, ...materialKeys])].sort();
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged } } } };
}

export const constitutionVersion = () => CONSTITUTION_VERSION;

export const registerConstitutionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'constitution.monthly', cadence: 'monthly', priority: 460, run: runEmergencyMonth });
