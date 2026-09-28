import type { DirtyDomainRecord, SimulationState } from '../types';

export interface DirtyMark { domain: string; entityId?: string; reason: string }

const normalized = (records: DirtyDomainRecord[]) => [...records]
  .map(record => ({ ...record, entityIds: [...new Set(record.entityIds)].sort(), reasons: [...new Set(record.reasons)].sort() }))
  .sort((left, right) => left.domain.localeCompare(right.domain));

export function markDirty(state: SimulationState, mark: DirtyMark): SimulationState {
  if (!mark.domain.trim() || !mark.reason.trim()) throw new Error('Dirty marks require a domain and reason.');
  const existing = state.engine.dirtyDomains.find(record => record.domain === mark.domain);
  const record: DirtyDomainRecord = existing
    ? { ...existing, markedAtTick: Math.min(existing.markedAtTick, state.engine.tick), entityIds: existing.entityIds.length === 0 || !mark.entityId ? [] : [...existing.entityIds, mark.entityId], reasons: [...existing.reasons, mark.reason] }
    : { domain: mark.domain, entityIds: mark.entityId ? [mark.entityId] : [], markedAtTick: state.engine.tick, reasons: [mark.reason] };
  return { ...state, engine: { ...state.engine, dirtyDomains: normalized([...state.engine.dirtyDomains.filter(item => item.domain !== mark.domain), record]) } };
}

export function clearDirty(state: SimulationState, domain: string, entityId?: string): SimulationState {
  const records = state.engine.dirtyDomains.flatMap(record => {
    if (record.domain !== domain) return [record];
    if (!entityId) return [];
    if (record.entityIds.length === 0) return [record];
    const entityIds = record.entityIds.filter(id => id !== entityId);
    return entityIds.length ? [{ ...record, entityIds }] : [];
  });
  return { ...state, engine: { ...state.engine, dirtyDomains: normalized(records) } };
}

export const inspectDirty = (state: SimulationState) => normalized(state.engine.dirtyDomains);
