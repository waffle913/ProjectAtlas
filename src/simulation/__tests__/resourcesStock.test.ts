import { describe, it, expect } from 'vitest';
import {
  validateStock, stockAvailable, shortage, consumeFromStock, isSubstitutionInScope,
  STOCK_SUBSTITUTION, type StockLedger,
} from '../resources/stock';

// opening 100 + produced 50 + received 20 = consumed 60 + exported 10 + closing 100.
const stock = (over: Partial<StockLedger> = {}): StockLedger => ({
  opening: 100, produced: 50, received: 20, consumed: 60, exported: 10, closing: 100, capacity: null,
  ...over,
});

describe('resources stocks and physical trade (0.27.7)', () => {
  it('validates a conserving stock ledger', () => {
    expect(() => validateStock(stock())).not.toThrow();
  });

  it('rejects a stock that does not conserve (no net creation/destruction)', () => {
    expect(() => validateStock(stock({ closing: 90 }))).toThrow(/does not conserve/);
    expect(() => validateStock(stock({ produced: 60 }))).toThrow(/does not conserve/);
  });

  it('rejects negative quantities and closing above capacity', () => {
    expect(() => validateStock(stock({ opening: -1 }))).toThrow(/non-negative whole numbers/);
    expect(() => validateStock(stock({ capacity: 50 }))).toThrow(/cannot exceed capacity/);
  });

  it('computes shortage as max(0, need - available), never negative', () => {
    expect(shortage(150, 100)).toBe(50);
    expect(shortage(50, 100)).toBe(0);
  });

  it('consumes from closing stock without going negative and reports the shortage', () => {
    const result = consumeFromStock(stock(), 150);
    expect(result.consumed).toBe(100);
    expect(result.shortage).toBe(50);
    expect(result.ledger.closing).toBe(0);
    expect(result.ledger.consumed).toBe(160);
    expect(() => validateStock(result.ledger)).not.toThrow();
  });

  it('keeps substitution out of scope until decided', () => {
    expect(STOCK_SUBSTITUTION.status).toBe('undecided');
    expect(isSubstitutionInScope()).toBe(false);
  });

  it('reports available stock', () => {
    expect(stockAvailable(stock())).toBe(100);
  });
});
