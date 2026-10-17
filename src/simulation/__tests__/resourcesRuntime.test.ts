import { describe, it, expect } from 'vitest';
import { stockLedgerFromTrade, reconcileTradeStock } from '../resources/stock';
import type { TradeStock } from '../trade/model';
import { tradeFixture, tradeMonth, tradeCountries } from './tradeFixture';

// opening 100 + produced 50 + received 20 = consumed 60 + exported 10 + closing 100.
const tstock = (over: Partial<TradeStock> = {}): TradeStock => ({
  opening: 100, produced: 50, received: 20, consumed: 60, exported: 10, quantity: 100, capacity: 200, target: 100,
  ...over,
});

describe('resources 0.27 runtime integration', () => {
  it('maps the canonical TradeStock to the 0.27 StockLedger vocabulary exactly', () => {
    const ledger = stockLedgerFromTrade(tstock());
    expect(ledger).toEqual({
      opening: 100, produced: 50, received: 20, consumed: 60, exported: 10, closing: 100, capacity: 200,
    });
  });

  it('reconciles a conserving canonical store and rejects a non-conserving one', () => {
    expect(() => reconcileTradeStock(tstock())).not.toThrow();
    expect(() => reconcileTradeStock(tstock({ quantity: 90 }))).toThrow(/does not conserve/);
    expect(() => reconcileTradeStock(tstock({ quantity: 201 }))).toThrow(/cannot exceed capacity/);
  });

  it('reconciles the canonical stock through the monthly trade settle (closing === quantity)', () => {
    let state = tradeFixture();
    const countryId = tradeCountries[0];
    state = {
      ...state,
      trade: { ...state.trade, countries: { ...state.trade.countries, [countryId]: {
        ...state.trade.countries[countryId],
        markets: { ...state.trade.countries[countryId].markets, food: {
          ...state.trade.countries[countryId].markets.food!,
          stock: tstock({ opening: 100, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 100, target: 150, capacity: 200 }),
        } },
      } } },
    };
    const next = tradeMonth(state);
    const stock = next.trade.countries[countryId].markets.food!.stock!;
    // The 0.27 conservation law governs the canonical store after a real transition.
    expect(() => reconcileTradeStock(stock)).not.toThrow();
    expect(stockLedgerFromTrade(stock).closing).toBe(stock.quantity);
    expect(stock.opening + stock.produced + stock.received - stock.consumed - stock.exported).toBe(stock.quantity);
  });
});
