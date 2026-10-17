import { describe, it, expect } from 'vitest';
import {
  validateOrderCost, orderFunded, canAccessMilitaryInformation, ORDER_COST_OWNERS,
  type OrderCost, type InformationAccess,
} from '../operations/orderCosts';

const cost = (over: Partial<OrderCost> = {}): OrderCost => ({
  id: 'c1', costUsd: 1000, fundedUsd: 1500, date: '2026-02-01', note: 'order cost', ...over,
});
const access = (over: Partial<InformationAccess> = {}): InformationAccess => ({
  level: 'office', hasOfficeAccess: true, intelligenceAvailable: false, ...over,
});

describe('information, authorities and costs (0.31.10)', () => {
  it('names canonical owners', () => {
    expect(ORDER_COST_OWNERS.costs).toBe('military.ledger');
    expect(ORDER_COST_OWNERS.information).toBe('information');
  });

  it('funds an order only when committed funds cover it; unknown funding is never assumed funded', () => {
    expect(orderFunded(cost())).toBe(true);
    expect(orderFunded(cost({ fundedUsd: 500 }))).toBe(false);
    expect(orderFunded(cost({ fundedUsd: null }))).toBeNull();
    expect(() => validateOrderCost(cost({ costUsd: 0 }))).toThrow(/positive whole number/);
  });

  it('gates military information: public always, office by access, intelligence only when provided', () => {
    expect(canAccessMilitaryInformation(access({ level: 'public', hasOfficeAccess: false }))).toBe(true);
    expect(canAccessMilitaryInformation(access())).toBe(true);
    expect(canAccessMilitaryInformation(access({ hasOfficeAccess: false }))).toBe(false);
    expect(canAccessMilitaryInformation(access({ level: 'intelligence', hasOfficeAccess: true, intelligenceAvailable: false }))).toBe(false);
    expect(canAccessMilitaryInformation(access({ level: 'intelligence', hasOfficeAccess: true, intelligenceAvailable: true }))).toBe(true);
    expect(() => canAccessMilitaryInformation(access({ level: 'omniscient' as never }))).toThrow(/Unknown information access level/);
  });
});
