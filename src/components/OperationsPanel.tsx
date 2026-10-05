import { useState } from 'react';
import type { SimulationState } from '../types';
import { hasOperationsAuthority, deploy, orderMovement, supplyDeployment, withdrawDeployment } from '../simulation/operations/runtime';
import { inspectOperationsReports } from '../simulation/operations/reports';

export function OperationsPanel({ state, countryId, personId, onStateChange }: {
  state: SimulationState; countryId: string; personId: string; onStateChange: (next: SimulationState) => void;
}) {
  const authority = hasOperationsAuthority(state, countryId, personId);
  const report = inspectOperationsReports(state, countryId, personId);
  const deployments = Object.values(state.operations.deployments)
    .filter(deployment => deployment.countryId === countryId && deployment.status !== 'withdrawn')
    .sort((a, b) => a.id.localeCompare(b.id));
  const assignmentRegions = Object.keys(state.military.countries[countryId]?.capability?.assignments ?? {}).sort();
  const controlEntries = Object.entries(state.operations.regionControl).sort(([a], [b]) => a.localeCompare(b));
  const engagements = Object.values(state.operations.engagements)
    .filter(engagement => engagement.attackerCountryId === countryId || engagement.defenderCountryId === countryId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const [source, setSource] = useState('');
  const [personnel, setPersonnel] = useState('');
  const [deploymentId, setDeploymentId] = useState('');
  const [targetRegion, setTargetRegion] = useState('');
  const [ammo, setAmmo] = useState('');
  const [fuel, setFuel] = useState('');
  const [message, setMessage] = useState('');
  const command = (run: () => SimulationState) => {
    try { onStateChange(run()); setMessage('Command recorded. Deployment/movement/supply effects apply at the shared daily boundary.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const warLabel = (warId: string) => {
    const war = state.wars.find(item => item.id === warId);
    return war ? `${warId} (${war.status})` : warId;
  };
  return <section className="cockpit-section">
    <h2>Military operations and territorial control</h2>
    <p>Operational forces, effective Region control and active engagements. Friendly forces are known precisely; enemy strength is reported only through dated fog-of-war estimates.</p>
    <h3>Region effective control</h3>
    {controlEntries.length
      ? controlEntries.map(([regionId, control]) => <p key={regionId}>{regionId}: {control}</p>)
      : <p>No Region control has been derived yet.</p>}
    <h3>Friendly deployments</h3>
    {deployments.length
      ? deployments.map(deployment => <p key={deployment.id}>{deployment.id} · {deployment.personnel} personnel · ammo {deployment.supply.ammunition} · fuel {deployment.supply.fuel} · region {deployment.currentRegionId} · {deployment.status} · losses {deployment.losses.personnel} personnel</p>)
      : <p>No active deployments.</p>}
    <h3>Active engagements</h3>
    {engagements.length
      ? engagements.map(engagement => <p key={engagement.id}>{warLabel(engagement.warId)} · {engagement.regionId} · {engagement.status} · own personnel losses {engagement.attackerCountryId === countryId ? engagement.attackerLosses.personnel : engagement.defenderLosses.personnel}</p>)
      : <p>No active engagements.</p>}
    <h3>Enemy assessment</h3>
    {report ? <>
      <p>Government fog-of-war report as of {report.asOfDate} · confidence {report.confidenceBps} bps{report.stale ? ' · dated report, not live Reality' : ''}.</p>
      {report.wars.length ? report.wars.map(war => <p key={war.warId}>{war.warId}: {war.targetRegionId} control {war.control}; enemy strength {war.enemyStrength} · combat contact {war.contact.length} record(s)</p>) : <p>No active war assessments.</p>}
      <p>{report.uncertainty} {report.limitation}</p>
    </> : <p>No accessible operations report. Office information access is required.</p>}
    {authority ? <>
      <h3>Commands</h3>
      <label>Deploy source Region<select value={source} onChange={e => setSource(e.target.value)}><option value="">—</option>{assignmentRegions.map(region => <option key={region} value={region}>{region}</option>)}</select></label>
      <label>Personnel<input type="number" min="1" step="1" value={personnel} onChange={e => setPersonnel(e.target.value)} /></label>
      <button disabled={!source || !personnel} onClick={() => command(() => deploy(state, { countryId, personId, sourceRegionId: source, currentRegionId: source, personnel: Number(personnel) }))}>Deploy force</button>
      <label>Deployment<select value={deploymentId} onChange={e => setDeploymentId(e.target.value)}><option value="">—</option>{deployments.map(deployment => <option key={deployment.id} value={deployment.id}>{deployment.id}</option>)}</select></label>
      <label>Target Region<input value={targetRegion} onChange={e => setTargetRegion(e.target.value)} /></label>
      <button disabled={!deploymentId || !targetRegion} onClick={() => command(() => orderMovement(state, deploymentId, personId, targetRegion))}>Order movement</button>
      <label>Supply ammunition<input type="number" min="0" step="1" value={ammo} onChange={e => setAmmo(e.target.value)} /></label>
      <label>Supply fuel<input type="number" min="0" step="1" value={fuel} onChange={e => setFuel(e.target.value)} /></label>
      <button disabled={!deploymentId} onClick={() => command(() => supplyDeployment(state, deploymentId, personId, Number(ammo || 0), Number(fuel || 0)))}>Resupply</button>
      <button disabled={!deploymentId} onClick={() => command(() => withdrawDeployment(state, deploymentId, personId))}>Withdraw</button>
    </> : <p>This person lacks resolved executive operational authority. Country selection and party leadership grant none.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
