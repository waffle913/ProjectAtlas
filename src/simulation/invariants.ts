import type { RegionEntity, SimulationState } from '../types';
import { validateDiplomacyState, type DiplomacyContext } from './diplomacy';
import { validateWarState } from './war';

export type InvariantPhase = 'tick' | 'save' | 'reload' | 'fidelity-transition';
export interface InvariantViolation { invariantId: string; phase: InvariantPhase; message: string }
export interface InvariantContext extends DiplomacyContext { regions: readonly RegionEntity[] }
export interface SimulationInvariant {
  id: string;
  check(state: SimulationState, context: InvariantContext, phase: InvariantPhase): string[];
}

const captureError = (operation: () => unknown) => {
  try { operation(); return []; } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
};
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const validFidelity = new Set(['Detailed', 'Standard', 'Background']);

export const coreInvariants: readonly SimulationInvariant[] = [
  {
    id: 'canonical-state-shape',
    check: state => {
      const errors: string[] = [];
      if (state.schemaVersion !== 7) errors.push(`Expected schema 7, received ${state.schemaVersion}.`);
      if (!validDate(state.date) || !Number.isSafeInteger(state.engine.tick) || state.engine.tick < 0 || !state.engine.seed) errors.push('Simulation date, tick or seed is malformed.');
      if (Object.values(state.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) errors.push('Region population contains an invalid quantity.');
      if (Object.values(state.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) errors.push('Region economic output contains an invalid quantity.');
      return errors;
    },
  },
  {
    id: 'permanent-region-references',
    check: (state, context) => {
      const known = context.regionIds;
      const errors: string[] = [];
      for (const field of ['regionOwnership', 'populationByRegion', 'economicOutputByRegion', 'occupationByRegion'] as const) {
        for (const id of Object.keys(state[field])) if (!known.has(id)) errors.push(`${field} references unknown Region ${id}.`);
      }
      for (const [regionId, ownerId] of Object.entries(state.regionOwnership)) if (ownerId !== undefined && !context.countryIds.has(ownerId)) errors.push(`Region ${regionId} has unknown sovereign owner ${ownerId}.`);
      return errors;
    },
  },
  {
    id: 'country-fidelity',
    check: (state, context) => {
      const errors: string[] = [];
      for (const countryId of context.countryIds) if (!validFidelity.has(state.engine.fidelityByCountry[countryId])) errors.push(`Country lacks a valid fidelity level: ${countryId}.`);
      for (const countryId of Object.keys(state.engine.fidelityByCountry)) if (!context.countryIds.has(countryId)) errors.push(`Fidelity references unknown Country ${countryId}.`);
      return errors;
    },
  },
  {
    id: 'engine-queues',
    check: (state, context) => {
      const errors: string[] = [];
      if (!Number.isSafeInteger(state.engine.nextSequence) || state.engine.nextSequence < 0) errors.push('Engine sequence is malformed.');
      const sequences = new Set<number>();
      for (const transition of [...state.engine.pendingFidelityTransitions, ...state.engine.recentFidelityTransitions]) {
        if (!context.countryIds.has(transition.countryId) || !validFidelity.has(transition.from) || !validFidelity.has(transition.to)) errors.push(`Malformed fidelity transition for ${transition.countryId}.`);
        if (!Number.isSafeInteger(transition.sequence) || transition.sequence < 0 || transition.sequence >= state.engine.nextSequence || sequences.has(transition.sequence)) errors.push(`Invalid or duplicate engine sequence ${transition.sequence}.`);
        if (!Number.isSafeInteger(transition.requestedAtTick) || transition.requestedAtTick > state.engine.tick) errors.push(`Fidelity transition was requested after current tick for ${transition.countryId}.`);
        sequences.add(transition.sequence);
      }
      for (const request of state.engine.pendingImmediateUpdates) {
        if (!request.taskId || !request.eventKey || !Number.isSafeInteger(request.requestedAtTick) || request.requestedAtTick > state.engine.tick || !Number.isSafeInteger(request.sequence) || request.sequence < 0 || request.sequence >= state.engine.nextSequence || sequences.has(request.sequence)) errors.push(`Malformed immediate update request for ${request.taskId}.`);
        sequences.add(request.sequence);
      }
      for (const dirty of state.engine.dirtyDomains) if (!dirty.domain || !Number.isSafeInteger(dirty.markedAtTick) || dirty.markedAtTick > state.engine.tick || !dirty.reasons.length) errors.push(`Malformed dirty domain ${dirty.domain}.`);
      return errors;
    },
  },
  { id: 'diplomacy', check: (state, context) => captureError(() => validateDiplomacyState(state, context)) },
  { id: 'war-occupation-sovereignty', check: (state, context) => captureError(() => validateWarState(state, context)) },
];

/** Small reusable registry for core and system-owned invariant checks. */
export class InvariantRegistry {
  private readonly invariants = new Map<string, SimulationInvariant>();
  constructor(initial: readonly SimulationInvariant[] = []) { for (const invariant of initial) this.register(invariant); }
  register(invariant: SimulationInvariant) {
    if (!invariant.id.trim() || this.invariants.has(invariant.id)) throw new Error(`Duplicate or missing invariant ID: ${invariant.id}`);
    this.invariants.set(invariant.id, invariant);
    return this;
  }
  describe() { return [...this.invariants.keys()]; }
  validate(state: SimulationState, context: InvariantContext, phase: InvariantPhase) {
    const violations = [...this.invariants.values()].flatMap(invariant => invariant.check(state, context, phase).map(message => ({ invariantId: invariant.id, phase, message })));
    return { valid: violations.length === 0, violations };
  }
  assert(state: SimulationState, context: InvariantContext, phase: InvariantPhase) {
    const report = this.validate(state, context, phase);
    if (!report.valid) throw new Error(report.violations.map(item => `[${item.invariantId}] ${item.message}`).join('\n'));
    return true;
  }
}

export const createCoreInvariantRegistry = () => new InvariantRegistry(coreInvariants);

export function validateSimulationInvariants(state: SimulationState, context: InvariantContext, phase: InvariantPhase, extra: readonly SimulationInvariant[] = []) {
  const registry = createCoreInvariantRegistry();
  for (const invariant of extra) registry.register(invariant);
  return registry.validate(state, context, phase);
}

export function assertSimulationInvariants(state: SimulationState, context: InvariantContext, phase: InvariantPhase, extra: readonly SimulationInvariant[] = []) {
  const registry = createCoreInvariantRegistry();
  for (const invariant of extra) registry.register(invariant);
  return registry.assert(state, context, phase);
}

const conservedFields = ['territoryOwnership', 'regionOwnership', 'populationByRegion', 'economicOutputByRegion', 'bilateralRelations', 'claims', 'explicitCasusBelli', 'wars', 'occupationByRegion'] as const;
export function validateFidelityConservation(before: SimulationState, after: SimulationState): InvariantViolation[] {
  return conservedFields.flatMap(field => JSON.stringify(before[field]) === JSON.stringify(after[field]) ? [] : [{ invariantId: `fidelity-conserves-${field}`, phase: 'fidelity-transition' as const, message: `${field} changed during a fidelity-only transition.` }]);
}
