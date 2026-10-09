import { useState } from 'react';
import type { SimulationState } from '../types';
import { inspectTradeReports } from '../simulation/trade/reports';
import { setTradeStockTarget } from '../simulation/trade/runtime';
import { hasMilitaryManagementAuthority } from '../simulation/military/runtime';
import type { TradeCategory } from '../simulation/trade/model';

export function TradeInspection({ state, countryId, personId, onStateChange }: {
  state: SimulationState; countryId: string; personId: string; onStateChange: (next: SimulationState) => void;
}) {
  const report = inspectTradeReports(state, countryId, personId);
  const data = report?.data;
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState<TradeCategory>('food');
  const [message, setMessage] = useState('');
  const stores = data?.admittedMarkets.filter(m => m.stock) ?? [];
  const selected = stores.find(m => m.category === category) ?? stores[0];
  const authorized = hasMilitaryManagementAuthority(state, countryId, personId);
  const command = () => {
    if (!selected) throw new Error('No government-reported configured stock.');
    try {
      onStateChange(setTradeStockTarget(state, countryId, personId, selected.category, Number(target)));
      setMessage('Target recorded; replenishment needs represented production, resources and storage. The dated report is not refreshed by this command.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  return <section className="cockpit-section">
    <h2>World trade and strategic dependencies</h2>
    <p>Trade inspection. Physical trade follows production, needs, prices and represented capacity; dependencies emerge from actual flows.</p>
    {!report ? <p>No accessible dated trade report. An active office with government-information access is required. The first administrative report arrives at the shared monthly boundary.</p> : <>
      <p>Government report as of {report.asOfDate}; produced {report.producedOn}; {report.status}, {report.coverage} coverage;
        confidence {report.confidenceBps} bps{report.stale ? '; stale, not live Reality' : ''}.</p>
      <p>{report.limitation} {report.uncertainty}</p>
      {!data ? <p>Current physical production, quantities, need, prices, stocks and dependencies are unavailable, not zero. Historical values do not initialize sectors or trade flows.</p> : <>
        <h3>Booked monthly flows (USD)</h3>
        <p>Imports ${data.importsUsd}; exports ${data.exportsUsd}; balance ${data.balanceUsd}.
          Balance is an accounting result, not an economic bonus or penalty.</p>
        <p>Collected ordinary customs ${data.customsUsd} on admitted flows; {data.routes.filter(r => r.importerId === countryId && r.tariffBps === null).length} incoming routes have unavailable rates and cannot execute, not known zero tariffs.</p>
        <table><thead><tr><th>Category / unit</th><th>Produced</th><th>Imports</th><th>Exports</th><th>Need / shortage</th><th>Cost</th></tr></thead>
          <tbody>{data.categories.map(l => <tr key={l.category}><td>{l.category} / {l.unit}</td><td>{l.production}</td>
            <td>{l.imports} / ${l.importValueUsd}</td><td>{l.exports} / ${l.exportValueUsd}</td>
            <td>{l.need} / {l.shortage}</td><td>${l.priceMicroUsd / 1000000} / unit; landed ${l.importPaymentUsd}, including logistics ${l.logisticsUsd} and customs ${l.customsUsd}</td></tr>)}</tbody></table>
        <h3>Principal partners</h3>
        {data.partners.length ? data.partners.map(p => <p key={p.countryId}>{p.countryId}: imports ${p.importsUsd}, exports ${p.exportsUsd}.</p>)
          : <p>No positive flows in the represented categories this month; unrepresented categories remain unavailable.</p>}
        <h3>Reconstructible dependencies</h3>
        {!data.dependencies.length && <p>No dependency is derived without positive booked imports and a known positive need. Unrepresented flows remain unavailable.</p>}
        {data.dependencies.map(d => <section key={d.category}><strong>{d.category}: {d.strategic ? 'strategic dependence' : 'represented exposure'}</strong>
          <p>{d.imports} of {d.need} required {d.unit} imported ({d.importShareBps} bps); largest supplier {d.largestSupplierBps} bps,
            top three {d.topThreeBps} bps; concentration {d.concentrationBps} bps.</p>
          <p>Suppliers: {d.suppliers.map(s => `${s.countryId}: ${s.quantity} (${s.shareBps} bps)`).join('; ') || 'none in booked flows'}.</p>
          <p>Unused alternative route/supply capacity {d.alternativeCapacity}; configured domestic replacement capacity {d.domesticReplacementCapacity};
            stock {d.stockQuantity ?? 'unavailable'}. Importance: {d.strategicUse ?? 'not configured'}.</p><small>{d.explanation}</small></section>)}
        <h3>Material alerts and substitution</h3>
        <p>{data.alertCodes.join('; ') || 'No represented shortage or above-baseline cost.'} Routine reports do not pause the simulation.</p>
        {data.admittedMarkets.filter(m => m.replacementQuantity).map(m => <p key={m.category}>{m.category}: {m.replacementQuantity} / {m.domesticReplacementCapacity} replacement units; at most {m.domesticReplacementPerMonth} added each month, still constrained by existing production resources.</p>)}
        <h3>Source and coverage</h3>
        {data.sources.map(s => <p key={s.category}>{s.category}: {s.source.status}{s.source.synthetic ? ' / explicitly synthetic' : ''};
          {s.source.publisher}, {s.source.dataset}; reference {s.source.referenceDate}, published {s.source.publishedOn ?? 'unavailable'},
          retrieved {s.source.retrievedAt}. {s.source.url} · {s.source.licence} · {s.source.attribution} · {s.source.transformation} · {s.source.limitation}</p>)}
        {stores.length > 0 && authorized && <>
          <h3>Configured aggregate stock target</h3>
          <label>Reported category<select value={selected?.category} onChange={e => {
            const found = stores.find(m => m.category === e.target.value);
            if (!found) throw new Error('Unknown reported stock category.');
            setCategory(found.category);
          }}>{stores.map(m => <option key={m.category} value={m.category}>{m.category}</option>)}</select></label>
          <p>Reported store {selected?.stock?.quantity} / {selected?.stock?.capacity} units; target {selected?.stock?.target}.</p>
          <label>New target<input type="number" min="0" step="1" value={target} onChange={e => setTarget(e.target.value)} /></label>
          <button disabled={!target} onClick={command}>Set gradual resource-constrained target</button>
        </>}
        {!authorized && <p>This person lacks executive stock-management authority. Country selection and party leadership grant none.</p>}
      </>}
      <h3>Historical value evidence, not current quantities</h3>
      {report.historicalPriors.length ? report.historicalPriors.map(r => <section key={r.id}>
        <p>{r.source.referenceDate}: {r.exporterId} to {r.importerId}, {r.category}{r.aggregateOnly ? ' (aggregate reference; do not add to category totals)' : ''},
          ${r.annualValueUsd} annual USD, {r.source.status} / partial; quantity unavailable.</p>
        <small>{r.source.publisher} · {r.source.url} · published {r.source.publishedOn ?? 'unavailable'}, retrieved {r.source.retrievedAt}
          · {r.source.licence} · {r.source.attribution} · {r.source.limitation}</small>
        {r.inputs?.map(input => <p key={input.dataset}>{input.publisher}: {input.dataset} · {input.url} · reference {input.referenceDate},
          publication {input.publishedOn ?? 'unavailable'}, retrieved {input.retrievedAt} · {input.licence} · {input.attribution} · {input.limitation}</p>)}
      </section>) : <p>No historical source evidence available to this government by the report date.</p>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
