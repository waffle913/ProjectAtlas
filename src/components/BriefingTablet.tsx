import { useState } from 'react';
import type { SimulationState } from '../types';
import { resolvePlayerHandoff } from '../simulation/governance/runtime';
import { inspectBriefings, inspectGovernmentReports, explainBriefing, presentBriefing } from '../simulation/information/runtime';
import type { AdvisorAssistance } from '../simulation/information/model';

export function BriefingTablet({ state, onStateChange }: { state: SimulationState; onStateChange: (state: SimulationState) => void }) {
  const [open, setOpen] = useState(false);
  const [assistance, setAssistance] = useState<AdvisorAssistance>(() => {
    const saved = localStorage.getItem('projectatlas-advisor-assistance');
    return saved === 'guided' || saved === 'expert' ? saved : 'standard';
  });
  const [expanded, setExpanded] = useState<string>();
  const personId = state.governance.player.controlledPersonId;
  const person = personId ? state.governance.persons[personId] : undefined;
  const countryId = person?.countryId;
  const briefings = countryId && personId ? inspectBriefings(state, countryId, personId).slice().reverse() : [];
  const reports = countryId && personId ? inspectGovernmentReports(state, countryId, personId) : [];
  const pending = Object.values(state.governance.successions).filter(item => item.playerHandoff?.status === 'pending');
  return <>
    <button className="tablet-trigger" onClick={() => setOpen(value => !value)} aria-expanded={open}>▤ Briefings{briefings.length ? ` · ${briefings.length}` : ''}</button>
    {open && <aside className="tablet-panel" aria-label="Ministerial briefing tablet">
      <div className="tablet-header"><div><span className="eyebrow">Government / public information</span><h2>Briefing feed</h2></div><button onClick={() => setOpen(false)} aria-label="Close briefing feed">×</button></div>
      <label>Advisor assistance
        <select value={assistance} onChange={event => { const next = event.target.value as AdvisorAssistance; setAssistance(next); localStorage.setItem('projectatlas-advisor-assistance', next); }}>
          <option value="guided">Guided</option><option value="standard">Standard</option><option value="expert">Expert</option>
        </select>
      </label>
      {pending.map(succession => <section className="handoff-card" key={succession.id}>
        <strong>Party leadership changed</strong>
        <p>Continue as the previous leader or transfer control to {state.governance.persons[succession.newPersonId]?.displayName}.</p>
        <button onClick={() => onStateChange(resolvePlayerHandoff(state, succession.id, 'continue'))}>Continue as {state.governance.persons[succession.previousPersonId]?.displayName}</button>
        <button onClick={() => onStateChange(resolvePlayerHandoff(state, succession.id, 'switch'))}>Switch to new leader</button>
      </section>)}
      {reports.length > 0 && <section><h3>Latest internal reports</h3>{reports.map(report => <article className="briefing-item" key={report.id}>
        <strong>Labour report · {report.asOfDate}</strong>
        <p>{report.valueBps === undefined ? 'Unemployment estimate unavailable.' : `Modelled unemployment: ${(report.valueBps / 100).toFixed(2)}%`}</p>
        <small>{report.coverage} coverage · {report.limitation}</small>
      </article>)}</section>}
      {briefings.length ? briefings.map(briefing => {
        const presentation = presentBriefing(briefing, assistance);
        const isExpanded = expanded === briefing.id;
        return <article className="briefing-item" key={briefing.id}>
          <span className={`severity severity-${briefing.severity}`}>{briefing.severity} · {briefing.access}</span>
          <strong>{presentation.headline}</strong>
          <small>{briefing.createdOn} · {briefing.portfolio.replaceAll('_', ' ')}</small>
          {presentation.context && <p>{presentation.context}</p>}
          {presentation.tellMeMoreAvailable && <button onClick={() => setExpanded(isExpanded ? undefined : briefing.id)}>Tell me more</button>}
          {isExpanded && <div className="explanation">{explainBriefing(state, briefing, personId!).map((line, index) => <p key={`${briefing.id}-${index}`}>{line}</p>)}</div>}
          {presentation.guidedActions?.map(action => <button key={action} onClick={() => setExpanded(briefing.id)}>{action}</button>)}
        </article>;
      }) : <p className="muted">No new briefings. Public parliamentary results and reports explicitly shared with your office appear here.</p>}
      <small className="tablet-limit">Assistance changes presentation only. It does not change canonical state or simulation outcomes.</small>
    </aside>}
  </>;
}
