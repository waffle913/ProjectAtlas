import { dateValid } from '../fiscal/math';
export function militaryDeliveryDate(date: string, months: number) {
  if (!dateValid(date) || !Number.isSafeInteger(months) || months < 1) throw new Error('Invalid military production boundary.');
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const result = d.toISOString().slice(0, 10);
  if (!dateValid(result)) throw new Error('Military production date exceeds supported calendar.');
  return result;
}
