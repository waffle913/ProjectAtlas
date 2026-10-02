import { CRISIS_MODEL, type CrisisSeverity, type TripwireDirection } from './model';

export const crisisSeverityRank: Readonly<Record<CrisisSeverity, number>> = { none: 0, low: 1, moderate: 2, severe: 3, critical: 4 };
export const severityForPressure = (pressure: number): CrisisSeverity => pressure <= 0 ? 'none' : pressure < CRISIS_MODEL.severity.moderate ? 'low' : pressure < CRISIS_MODEL.severity.severe ? 'moderate' : pressure < CRISIS_MODEL.severity.critical ? 'severe' : 'critical';
export const tripwireFlags = (value: number, direction: TripwireDirection, danger: number, recovery: number) => ({
  dangerous: direction === 'above' ? value >= danger : value <= danger,
  recovered: direction === 'above' ? value <= recovery : value >= recovery,
});
export const tripwirePersistence = (dangerous: boolean, months: number) => dangerous ? Math.min(CRISIS_MODEL.tripwirePersistenceMaximumBps, months * CRISIS_MODEL.tripwirePersistenceBpsPerMonth) : 0;
