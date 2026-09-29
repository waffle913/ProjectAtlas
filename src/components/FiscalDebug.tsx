import { useState } from 'react';
import type { SimulationState } from '../types';
import type { FiscalReform } from '../simulation/fiscal/model';
import { inspectFiscal } from '../simulation/fiscal/runtime';
export function FiscalDebug({ state, countryId, onReform }: { state: SimulationState; countryId: string; onReform: (r: Omit<FiscalReform, 'sequence'>) => void }) {
  const [draft, setDraft] = useState(''), [message, setMessage] = useState('');
  const country = state.fiscal.countries[countryId];
  if (!country) return null;
  return <details><summary>Fiscal debug · USD · modelled initialization</summary>
    <p>Revenue covers known tax components only. Missing laws are unavailable. Initialization projections are not executed monthly accounts.</p>
    <p>Cash: {country.cash.toLocaleString()} · Debt: {country.debt.toLocaleString()}</p>
    <p>Last monthly revenue: {country.account?.revenue.toLocaleString() ?? 'Not executed'} · Balance: {country.account?.overallBalance.toLocaleString() ?? 'Not executed'}</p>
    <details><summary>Policy, accounts, services and provenance</summary><pre style={{ overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(inspectFiscal(state, countryId), null, 2)}</pre></details>
    <button onClick={() => { setDraft(JSON.stringify({ countryId, effectiveDate: state.date, policy: country.policy, annualBudget: country.annualBudget }, null, 2)); setMessage('Edit explicit annual USD budgets or policy rates/bands. For an edited law, use status modelled and document the debug reform.'); }}>Prepare explicit reform</button>
    <label>Reform JSON (engine/debug only)<textarea aria-label="Fiscal reform JSON" style={{ width: '100%', minHeight: 140 }} value={draft} onChange={e => setDraft(e.target.value)} /></label>
    <button disabled={!draft} onClick={() => { try { onReform({ ...JSON.parse(draft), countryId }); setMessage('Reform accepted. Prior monthly accounts are unchanged.'); } catch (e) { setMessage(String(e)); } }}>Apply or schedule reform</button>
    <p role="status">{message}</p>
  </details>;
}
