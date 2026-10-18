import type { SimulationState } from '../types';
import { inspectEconomy } from '../simulation/economy/inspect';

function usd(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * 0.25 economy restitution in the UI. The 0.25 economy is a read-only derivation
 * over canonical state (socioeconomy/fiscal/trade); this panel is its canonical
 * consumer. It is rendered only for an office holding government-information
 * access, and every value is labelled as `derived`/`modelled` — never presented
 * as an observation, and unavailable inputs stay unavailable.
 */
export function EconomyPanel({ state, countryId, personId, regionsById }: {
  state: SimulationState;
  countryId: string;
  personId: string;
  regionsById?: ReadonlyMap<string, { commonName: string }>;
}) {
  const inspection = inspectEconomy(state, countryId, personId);
  if (!inspection) {
    return <p>Current internal economic reports are not available to an opposition person.</p>;
  }
  return <>
    <section className="economy-inspection">
      <small className="muted">Provenance: {inspection.provenance.status} · {inspection.provenance.limitation}</small>
      {inspection.trade && <section>
        <h3>Trade position</h3>
        <p>Domestic output {usd(inspection.trade.domesticOutputUsd)} · exports {usd(inspection.trade.exportValueUsd)} · imports {usd(inspection.trade.importValueUsd)} · balance {usd(inspection.trade.balanceUsd)}</p>
        {inspection.trade.productionCeilingUsd !== undefined && <p>Capital/input production ceiling {usd(inspection.trade.productionCeilingUsd)}</p>}
      </section>}
      {inspection.fiscal && <section>
        <h3>Fiscal derivation</h3>
        <p>Status: {inspection.fiscal.reconciled} · derived known tax revenue {usd(inspection.fiscal.derivedKnownTaxRevenueUsd)}</p>
        {inspection.fiscal.ledgerKnownTaxRevenueUsd !== undefined && <p>Canonical ledger known tax revenue {usd(inspection.fiscal.ledgerKnownTaxRevenueUsd)}</p>}
      </section>}
      {inspection.regions.map(region => <section key={region.regionId}>
        <strong>{regionsById?.get(region.regionId)?.commonName ?? 'Region'}</strong>
        {region.firms
          ? <p>Firms ({region.firms.firmRepresentation}): revenue {usd(region.firms.revenueUsd)} · business surplus {usd(region.firms.businessSurplusUsd)} · retained {usd(region.firms.retainedSurplusUsd)}</p>
          : <p>Firm account unavailable.</p>}
        {region.households
          ? <p>Households: demand {usd(region.households.demandTotal)} · material shortage {usd(region.households.shortageUsd)} · needs coverage {(region.households.needsCoverageBps / 100).toFixed(2)}%</p>
          : <p>Household spending unavailable.</p>}
        {region.domesticPrice
          ? <p>Modelled domestic price index {(region.domesticPrice.priceBps / 100).toFixed(2)}% of baseline · {region.domesticPrice.pressure} pressure</p>
          : <p>Domestic price unavailable.</p>}
      </section>)}
    </section>
  </>;
}
