import { useState } from 'react';
import type { SimulationState } from '../types';
import { inspectMilitaryReports } from '../simulation/military/reports';
import { hasMilitaryManagementAuthority, placeMilitaryOrder, setMilitaryAuthorization } from '../simulation/military/runtime';
import type { MilitaryItem } from '../simulation/military/model';

export function MilitaryCapabilities({ state, countryId, personId, onStateChange, onBudget }: {
  state: SimulationState; countryId: string; personId: string;
  onStateChange: (next: SimulationState) => void; onBudget: () => void;
}) {
  const report = inspectMilitaryReports(state, countryId, personId);
  const data = report?.data;
  const authorized = hasMilitaryManagementAuthority(state, countryId, personId);
  const [staff, setStaff] = useState('');
  const [quantity, setQuantity] = useState('');
  const [item, setItem] = useState<MilitaryItem>('personal');
  const [message, setMessage] = useState('');
  const items = [...data?.equipment ?? [], ...data?.stocks ?? []].map(s => s.item);
  const selectedItem = items.includes(item) ? item : items[0];
  const command = (run: () => SimulationState) => {
    try { onStateChange(run()); setMessage('Command recorded. Material effects and reports wait for the shared monthly boundary.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  return <section className="cockpit-section">
    <h2>Military capabilities</h2>
    <p>Peacetime personnel, material and readiness only. No operations, combat, movement or territorial control.</p>
    {!report ? <p>No accessible military administrative report. Office information access is required; the first report is produced at the monthly boundary.</p> : <>
      <p>Government report as of {report.asOfDate} · {report.status} · {report.coverage} coverage · confidence {report.confidenceBps} bps{report.stale ? ' · dated report, not live Reality' : ''}.</p>
      <p>{report.uncertainty} {report.limitation}</p>
      {report.provenance && <p>Source: {report.provenance.publisher} ({report.provenance.status}) · {report.provenance.url} · reference {report.provenance.referenceDate}, retrieved {report.provenance.retrievedAt} · {report.provenance.licence} · {report.provenance.attribution}.</p>}
      {report.historicalReference && <section><h3>Partial historical source reference</h3>
        <p>{report.historicalReference.scope}: {report.historicalReference.regularPersonnelReported} reported personnel; {report.historicalReference.untrainedPersonnelReported} reported untrained, as of {report.historicalReference.source.referenceDate}, rounded to {report.historicalReference.roundingPersons} persons.</p>
        <p>{report.historicalReference.source.limitation}</p>
        <small>{report.historicalReference.source.publisher} · {report.historicalReference.source.licence} · {report.historicalReference.source.attribution}</small>
      </section>}
      {!data ? <p>Personnel, equipment, stocks, costs and readiness are unavailable, not zero. Management cannot create a real army from absent data.</p> : <>
        <h3>Personnel and financing</h3>
        <p>{data.present} present / {data.authorized} authorized; {data.vacancies} vacancies; {data.trainees} in training; {data.available} available.</p>
        <p>Monthly salary ${data.monthlySalaryUsd}; payroll due ${data.payrollDue}; paid ${data.payrollPaid}; unpaid salaries ${data.payrollArrears}; total defense expense ${data.expenditureUsd}.</p>
        <h3>Equipment</h3>
        <table><thead><tr><th>Item</th><th>Owned</th><th>Operational</th><th>Unavailable</th><th>Maintenance</th><th>Reserve</th></tr></thead><tbody>
          {data.equipment.map(e => <tr key={e.item}><td>{e.item}</td><td>{e.total}</td><td>{e.operational}</td><td>{e.unavailable}</td><td>{e.maintenance}</td><td>{e.reserve}</td></tr>)}
        </tbody></table>
        <p>Maintenance backlog: {data.maintenanceBacklog} unit-months.</p>
        <h3>Consumables</h3>
        {data.stocks.map(s => <p key={s.item}>{s.item}: {s.quantity} / {s.capacity} storage; {s.consumed} consumed by training/exercises. Requirement: {s.required ?? 'not configured'}.</p>)}
        <h3>Derived preparedness</h3>
        {Object.entries(data.readiness.components).map(([key, value]) => <p key={key}>{key}: {value === null ? 'not configured' : `${(value / 100).toFixed(2)}%`}</p>)}
        <p>Limiting ratio: {(data.readiness.limitingBps / 100).toFixed(2)}%; general logistics capacity {data.logisticsCapacity} persons. {data.readiness.limitation}</p>
        <h3>Funded production and deliveries</h3>
        <p>Configured manufacturing ceiling {data.factoryUnitsPerMonth} units/month; {data.industrialMaterials} material units remain. Qualified support: {data.supportStaff.instructors} instructors, {data.supportStaff.technicians} technicians, {data.supportStaff.logistics} logistics staff; these share the same available personnel.</p>
        {data.orders.length ? data.orders.map(o => <p key={o.id}>{o.id} · {o.item}: {o.quantity} ordered, {o.funded} funded, {o.delivered} delivered; paid ${o.paidUsd}; earliest delivery {o.earliestDeliveryOn}. Funding, industrial materials and actual economic fulfillment can delay delivery.</p>) : <p>No outstanding orders in this report.</p>}
        {authorized ? <>
          <h3>Management commands</h3>
          <label>Authorized personnel<input type="number" min="0" step="1" value={staff} onChange={e => setStaff(e.target.value)} /></label>
          <button disabled={!staff} onClick={() => command(() => setMilitaryAuthorization(state, countryId, personId, Number(staff)))}>Set gradual recruitment/reduction target</button>
          <label>Equipment / replenishment<select value={selectedItem ?? ''} onChange={e => setItem(e.target.value as MilitaryItem)}>
            {[...data.equipment, ...data.stocks].map(s => <option key={s.item} value={s.item}>{s.item}</option>)}
          </select></label>
          <label>Order quantity<input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <button disabled={!quantity || !selectedItem} onClick={() => selectedItem && command(() => placeMilitaryOrder(state, countryId, personId, selectedItem, Number(quantity)))}>Place commitment for later funded production</button>
          <button onClick={onBudget}>Review defense appropriation through fiscal proposals</button>
        </> : <p>This person lacks military management authority. Country selection and party leadership grant none.</p>}
      </>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
