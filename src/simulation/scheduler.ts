import type { SchedulerCadence, SimulationState } from '../types';
import { deterministicFloat, deterministicInteger, deterministicUint32, type SimulationRandomKey } from './rng';

export interface SchedulerTaskContext {
  readonly date: string;
  readonly tick: number;
  readonly cadence: SchedulerCadence;
  readonly execution: 'scheduled' | 'immediate';
  readonly eventKey: string;
  random: {
    uint32(key?: Omit<SimulationRandomKey, 'system' | 'date' | 'tick' | 'eventKey'>): number;
    float(key?: Omit<SimulationRandomKey, 'system' | 'date' | 'tick' | 'eventKey'>): number;
    integer(minInclusive: number, maxExclusive: number, key?: Omit<SimulationRandomKey, 'system' | 'date' | 'tick' | 'eventKey'>): number;
  };
}
export interface SchedulerTask {
  id: string;
  cadence: SchedulerCadence;
  priority?: number;
  run(state: SimulationState, context: SchedulerTaskContext): SimulationState;
}
export interface SchedulerTraceEntry { taskId: string; cadence: SchedulerCadence; execution: 'scheduled' | 'immediate'; eventKey: string }
export interface SchedulerStep { state: SimulationState; trace: SchedulerTraceEntry[] }

const dateAfterDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const due = (cadence: SchedulerCadence, isoDate: string) => {
  if (cadence === 'daily') return true;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (cadence === 'weekly') return date.getUTCDay() === 1;
  if (cadence === 'monthly') return date.getUTCDate() === 1;
  if (cadence === 'quarterly') return date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0;
  return date.getUTCDate() === 1 && date.getUTCMonth() === 0;
};

export class SimulationScheduler {
  private readonly tasks = new Map<string, SchedulerTask>();
  register(task: SchedulerTask) {
    if (!task.id.trim() || this.tasks.has(task.id)) throw new Error(`Duplicate or missing scheduler task ID: ${task.id}`);
    this.tasks.set(task.id, task);
    return this;
  }
  describe() { return [...this.tasks.values()].sort(taskOrder).map(task => ({ id: task.id, cadence: task.cadence, priority: task.priority ?? 0 })); }
  requestImmediate(state: SimulationState, taskId: string, eventKey: string): SimulationState {
    if (!this.tasks.has(taskId)) throw new Error(`Unknown scheduler task: ${taskId}`);
    if (!eventKey.trim()) throw new Error('Immediate scheduler updates require a stable event key.');
    const sequence = state.engine.nextSequence;
    return { ...state, engine: { ...state.engine, nextSequence: sequence + 1, pendingImmediateUpdates: [...state.engine.pendingImmediateUpdates, { taskId, eventKey, requestedAtTick: state.engine.tick, sequence }] } };
  }
  advanceOneDay(input: SimulationState): SchedulerStep {
    let state: SimulationState = { ...input, date: dateAfterDays(input.date, 1), engine: { ...input.engine, tick: input.engine.tick + 1 } };
    const immediate = [...state.engine.pendingImmediateUpdates];
    state = { ...state, engine: { ...state.engine, pendingImmediateUpdates: [] } };
    const executions = [
      ...[...this.tasks.values()].filter(task => due(task.cadence, state.date)).map(task => ({ task, execution: 'scheduled' as const, eventKey: `cadence:${task.cadence}`, sequence: -1 })),
      ...immediate.map(request => {
        const task = this.tasks.get(request.taskId);
        if (!task) throw new Error(`Saved immediate update references unknown scheduler task: ${request.taskId}`);
        return { task, execution: 'immediate' as const, eventKey: request.eventKey, sequence: request.sequence };
      }),
    ].sort((left, right) => taskOrder(left.task, right.task) || (left.execution === right.execution ? left.sequence - right.sequence : left.execution === 'scheduled' ? -1 : 1));
    const trace: SchedulerTraceEntry[] = [];
    for (const execution of executions) {
      const baseKey = { system: execution.task.id, date: state.date, tick: state.engine.tick, eventKey: execution.eventKey };
      const context: SchedulerTaskContext = {
        date: state.date, tick: state.engine.tick, cadence: execution.task.cadence, execution: execution.execution, eventKey: execution.eventKey,
        random: {
          uint32: key => deterministicUint32(state.engine.seed, { ...baseKey, ...key }),
          float: key => deterministicFloat(state.engine.seed, { ...baseKey, ...key }),
          integer: (min, max, key) => deterministicInteger(state.engine.seed, { ...baseKey, ...key }, min, max),
        },
      };
      state = execution.task.run(state, context);
      trace.push({ taskId: execution.task.id, cadence: execution.task.cadence, execution: execution.execution, eventKey: execution.eventKey });
    }
    return { state, trace };
  }
}

const taskOrder = (left: SchedulerTask, right: SchedulerTask) => (left.priority ?? 0) - (right.priority ?? 0) || left.id.localeCompare(right.id);
