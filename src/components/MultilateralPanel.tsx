import { useState } from 'react';
import type { SimulationState } from '../types';
import { activateTreaty, establishOrganization, joinOrganization, proposeTreaty, ratifyTreaty, resolveObligation, signTreaty, terminateTreaty, voteOnDecision, withdrawFromOrganization, withdrawTreaty } from '../simulation/multilateral/runtime';
import { inspectMultilateralReports } from '../simulation/multilateral/reports';
import type { VoteChoice } from '../simulation/multilateral/model';

export function MultilateralPanel({ state, countryId, personId, onStateChange }: {
  state: SimulationState; countryId: string; personId: string; onStateChange: (next: SimulationState) => void;
}) {
  const report = inspectMultilateralReports(state, countryId, personId);
  const treaties = Object.values(state.multilateral.treaties).filter(t => t.parties.includes(countryId)).sort((a, b) => a.id.localeCompare(b.id));
  const organizations = Object.entries(state.multilateral.organizations).filter(([, o]) => o.members[countryId]).sort(([a], [b]) => a.localeCompare(b));
  const obligations = Object.values(state.multilateral.obligations).filter(o => o.obligatedCountryId === countryId).sort((a, b) => a.id.localeCompare(b.id));
  const decisions = Object.values(state.multilateral.decisions).filter(d => state.multilateral.organizations[d.organizationId]?.members[countryId]).sort((a, b) => a.id.localeCompare(b.id));
  const violations = Object.values(state.multilateral.violations).filter(v => v.violatingCountryId === countryId || v.violatedAgainstCountryId === countryId).sort((a, b) => a.id.localeCompare(b.id));
  const [treatyId, setTreatyId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [obligationId, setObligationId] = useState('');
  const [decisionId, setDecisionId] = useState('');
  const [vote, setVote] = useState<VoteChoice>('abstain');
  const [message, setMessage] = useState('');
  const command = (run: () => SimulationState) => { try { onStateChange(run()); setMessage('Action recorded.'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } };
  const treatyActions = (t: (typeof treaties)[number]) => {
    const actions: { label: string; run: () => SimulationState }[] = [];
    if (t.status === 'proposed' || t.status === 'signed') actions.push({ label: 'Sign', run: () => signTreaty(state, t.id, personId) });
    if (t.status === 'signed' && t.entryIntoForce.kind === 'ratification' && t.signatories[countryId]) actions.push({ label: 'Ratify', run: () => ratifyTreaty(state, t.id, personId) });
    if (t.status === 'signed') actions.push({ label: 'Activate', run: () => activateTreaty(state, t.id, personId) });
    if (!['terminated', 'expired'].includes(t.status)) actions.push({ label: 'Withdraw', run: () => withdrawTreaty(state, t.id, personId) });
    if (t.status === 'active' || t.status === 'suspended') actions.push({ label: 'Terminate', run: () => terminateTreaty(state, t.id, personId) });
    return actions;
  };
  return <section className="cockpit-section">
    <h2>Treaties and multilateral organizations</h2>
    <p>Treaty texts and adopted resolutions are public and exact; foreign votes and intentions are never exposed.</p>
    <h3>My treaties</h3>
    {treaties.length ? treaties.map(t => <section key={t.id}><strong>{t.title}</strong> <small>({t.status})</small><p>{t.id} · parties {t.parties.join(', ')} · {t.clauses.length} clause(s) · history {t.history.length} event(s)</p>{treatyActions(t).map(a => <button key={a.label} onClick={() => command(a.run)}>{a.label}</button>)}</section>) : <p>No treaties involving this Country.</p>}
    <h3>Organization memberships</h3>
    {organizations.length ? organizations.map(([id, o]) => <p key={id}>{o.title} · {o.members[countryId].role}</p>) : <p>No memberships.</p>}
    <label>Join organization<select value={orgId} onChange={e => setOrgId(e.target.value)}><option value="">—</option>{Object.keys(state.multilateral.organizations).sort().filter(id => !state.multilateral.organizations[id].members[countryId]).map(id => <option key={id} value={id}>{state.multilateral.organizations[id].title}</option>)}</select></label>
    <button disabled={!orgId} onClick={() => command(() => joinOrganization(state, orgId, personId))}>Join as member</button>
    <label>Withdraw from<select value={orgId} onChange={e => setOrgId(e.target.value)}><option value="">—</option>{organizations.map(([id, o]) => <option key={id} value={id}>{o.title}</option>)}</select></label>
    <button disabled={!orgId} onClick={() => command(() => withdrawFromOrganization(state, orgId, personId))}>Withdraw</button>
    <h3>Pending obligations</h3>
    {obligations.length ? obligations.map(o => <section key={o.id}><strong>{o.kind}</strong> <small>({o.status})</small><p>protect {o.protectedCountryId} · war {o.warId}</p><button onClick={() => command(() => resolveObligation(state, o.id, personId, true))}>Honor</button><button onClick={() => command(() => resolveObligation(state, o.id, personId, false))}>Refuse</button></section>) : <p>No pending obligations.</p>}
    <h3>Organization proposals</h3>
    {decisions.length ? decisions.map(d => <section key={d.id}><strong>{d.payload.kind}</strong> <small>({d.status})</small><p>{d.id} · closes {d.votingClosesOn}</p>{d.status === 'open' && state.multilateral.organizations[d.organizationId]?.members[countryId]?.role === 'member' ? <><select value={vote} onChange={e => setVote(e.target.value as VoteChoice)}>{['yes', 'no', 'abstain'].map(c => <option key={c} value={c}>{c}</option>)}</select><button onClick={() => command(() => voteOnDecision(state, d.id, personId, vote))}>Vote</button></> : null}</section>) : <p>No visible proposals.</p>}
    <h3>Violations</h3>
    {violations.length ? violations.map(v => <p key={v.id}>{v.kind}: {v.violatingCountryId} against {v.violatedAgainstCountryId} · {v.violatedOn}</p>) : <p>No recorded violations involving this Country.</p>}
    {report && <p>Public report as of {report.asOfDate}{report.stale ? ' · dated report, not live Reality' : ''}.</p>}
    <label>Treaty ID<input value={treatyId} onChange={e => setTreatyId(e.target.value)} /></label>
    <button disabled={!treatyId} onClick={() => command(() => signTreaty(state, treatyId, personId))}>Sign by ID</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
