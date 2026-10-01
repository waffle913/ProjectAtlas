import { useMemo, useState } from 'react';
import type { SimulationState } from '../types';
import { createFiscalProposal, hasPoliticalAuthority, inspectProposalSupport, resolveProposalVote, submitProposal } from '../simulation/governance/runtime';
import { hasGovernmentInformationAccess } from '../simulation/information/runtime';
import type { FiscalCountry, TaxRule } from '../simulation/fiscal/model';

const nextDate = (date: string) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

export function FiscalPolicy({ state, countryId, personId, onStateChange }: {
  state: SimulationState;
  countryId: string;
  personId: string;
  onStateChange: (state: SimulationState) => void;
}) {
  const fiscal: FiscalCountry | undefined = state.fiscal.countries[countryId];
  const rule = fiscal?.policy.corporate;
  const [rate, setRate] = useState(rule?.rateBps === undefined ? '' : String(rule.rateBps / 100));
  const [message, setMessage] = useState('');
  const [draftId, setDraftId] = useState<string>();
  const hasAccess = hasGovernmentInformationAccess(state, personId, countryId);
  const canPropose = hasPoliticalAuthority(state, personId, countryId, 'sponsor_legislation')
    && hasPoliticalAuthority(state, personId, countryId, 'sponsor_fiscal_reform');
  const canVote = hasPoliticalAuthority(state, personId, countryId, 'vote_legislation');
  const supportedRule = rule && typeof rule.rateBps === 'number' ? { ...rule, rateBps: rule.rateBps } : undefined;
  const estimate = useMemo(() => state.governance.proposalOrder.slice().reverse().map(id => state.governance.proposals[id]).find(item => item.countryId === countryId), [countryId, state.governance]);
  const draft = draftId ? state.governance.proposals[draftId] : undefined;
  const proposalPreview = draft ? inspectProposalSupport(state, draft.id) : undefined;
  if (!hasAccess) return <section className="cockpit-section">
    <h2>Fiscal policy</h2>
    <p>Government fiscal instruments and confidential estimates are not available to this person: no qualifying executive office is assigned.</p>
    <p>Party leadership or control of a Country does not grant fiscal authority. No statutory tax rate has been invented.</p>
  </section>;
  return <section className="cockpit-section">
    <h2>Fiscal policy · corporate tax</h2>
    {supportedRule ? <>
      <p>Current model rule: {(supportedRule.rateBps / 100).toFixed(2)}% · {supportedRule.status} · effective {supportedRule.effectiveDate}</p>
      {canPropose ? <><label>Proposed rate (%)
        <input type="number" min="0" max="100" step="0.01" value={rate} onChange={event => setRate(event.target.value)} />
      </label>
      <button disabled={Boolean(draftId) || !rate || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100 || Math.round(Number(rate) * 100) === supportedRule.rateBps} onClick={() => {
        try {
          const policy = structuredClone(fiscal!.policy);
          const changedRule: TaxRule = { ...supportedRule, rateBps: Math.round(Number(rate) * 100), status: 'modelled', source: 'player-authored governance proposal', document: 'ProjectAtlas 0.15 fiscal proposal', effectiveDate: nextDate(state.date), referenceDate: state.date, retrievedAt: state.date, limitations: 'Player proposal based on the existing legal rule; impacts are evaluated only using mechanisms currently represented by the model.' };
          policy.corporate = changedRule;
          const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: nextDate(state.date), payload: { policy } });
          const id = next.governance.proposalOrder.at(-1)!;
          setDraftId(id);
          setMessage(`Draft ${id} created. Review its available estimates before submitting.`);
          onStateChange(next);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }}>Create fiscal proposal draft</button>
      </> : <p>This office can inspect government fiscal information but does not hold both legislative and fiscal-reform sponsorship authority.</p>}
      {draft && <>
        <p>Draft {draft.id} · effective {draft.effectiveDate}</p>
        {proposalPreview && <>
          <p>Public estimate: {proposalPreview.publicEstimate.coverage} coverage · support {(proposalPreview.publicEstimate.supportBps / 100).toFixed(1)}% · opposition {(proposalPreview.publicEstimate.opposeBps / 100).toFixed(1)}% · unknown {(proposalPreview.publicEstimate.unknownBps / 100).toFixed(1)}%.</p>
          <p>Parliamentary estimate: {proposalPreview.parliamentaryEstimate.coverage} coverage · {proposalPreview.parliamentaryEstimate.yesSeats} yes seats · {proposalPreview.parliamentaryEstimate.noSeats} no seats · {proposalPreview.parliamentaryEstimate.unavailableSeats} unavailable seats.</p>
          <p>{proposalPreview.analysis.limitations.join(' ')}</p>
        </>}
        {draft.status === 'draft' && canPropose && <button onClick={() => {
          try { onStateChange(submitProposal(state, draft.id)); setMessage('Submitted. The proposal payload is now immutable. Resolve it through the existing parliamentary decision command.'); }
          catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
        }}>Submit immutable proposal</button>}
        {draft.status === 'submitted' && canVote && <button onClick={() => {
          try {
            const next = resolveProposalVote(state, draft.id), result = next.governance.proposals[draft.id];
            setMessage(result.status === 'enacted'
              ? `Proposal adopted. Fiscal reform is queued for ${result.effectiveDate}; current accounts are not rewritten.`
              : result.status === 'rejected'
                ? `Parliament rejected the proposal (${result.voteResult?.yesSeats ?? 0} yes seats, ${result.voteResult?.noSeats ?? 0} no seats).`
                : `Parliamentary result unavailable: ${result.voteResult?.unavailableSeats ?? 'seat coverage'} cannot be fully reconciled. No fiscal reform was scheduled.`);
            onStateChange(next);
          } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
        }}>Resolve parliamentary vote</button>}
      </>}
    </> : <p>Corporate tax rule unavailable for this Country. Missing legal data is not a 0% rate.</p>}
    {estimate?.analysis && <details><summary>Last proposal evaluation and evidence</summary>
      <p>Coverage: {estimate.analysis.coverage}. Temporal comparisons are not isolated causal attribution.</p>
      {estimate.analysis.expectedConsequences.map((item, index) => <p key={`${item.source}-${index}`}>{item.explanation} · {item.coverage} · confidence {item.confidenceBps} bps.</p>)}
      {estimate.analysis.unsupportedChanges.map(item => <p key={item.path}>{item.path}: unavailable/partial · {item.reason}</p>)}
      {estimate.analysis.limitations.map((item, index) => <p key={index}>{item}</p>)}
    </details>}
    <p role="status">{message}</p>
  </section>;
}
