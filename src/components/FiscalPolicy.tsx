import { useEffect, useMemo, useState } from 'react';
import type { SimulationState } from '../types';
import { createFiscalProposal, hasPoliticalAuthority, resolveProposalVote, submitProposal, withdrawProposal } from '../simulation/governance/runtime';
import { selectUnresolvedFiscalProposal, unresolvedFiscalProposals } from '../simulation/governance/selection';
import { hasGovernmentInformationAccess, inspectGovernmentProposalEstimates, produceGovernmentProposalEstimate } from '../simulation/information/runtime';
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
  const budget = fiscal?.annualBudget;
  const [rate, setRate] = useState(rule?.rateBps === undefined ? '' : String(rule.rateBps / 100));
  const [infrastructureBudget, setInfrastructureBudget] = useState(budget ? String(budget.infrastructure) : '');
  const [defenseBudget, setDefenseBudget] = useState(budget ? String(budget.defense ?? 0) : '');
  const [message, setMessage] = useState('');
  const [draftId, setDraftId] = useState<string>();
  const hasAccess = hasGovernmentInformationAccess(state, personId, countryId);
  const canLegislate = hasPoliticalAuthority(state, personId, countryId, 'sponsor_legislation');
  const canProposeTax = canLegislate
    && hasPoliticalAuthority(state, personId, countryId, 'sponsor_fiscal_reform')
    && typeof rule?.rateBps === 'number';
  const canProposeBudget = canLegislate
    && hasPoliticalAuthority(state, personId, countryId, 'sponsor_budget_reform')
    && Boolean(budget);
  const canVote = hasPoliticalAuthority(state, personId, countryId, 'vote_legislation');
  const supportedRule = rule && typeof rule.rateBps === 'number'
    ? { ...rule, rateBps: rule.rateBps }
    : undefined;
  const estimates = useMemo(
    () => inspectGovernmentProposalEstimates(state, countryId, personId),
    [countryId, personId, state.governance, state.information],
  );
  const estimate = estimates.filter(item => !item.stale).at(-1);
  const unresolved = unresolvedFiscalProposals(state.governance, countryId, personId);
  const draft = selectUnresolvedFiscalProposal(state.governance, countryId, personId, draftId);
  const proposalPreview = draft ? estimates.filter(item => item.proposalId === draft.id && !item.stale).at(-1) : undefined;

  useEffect(() => {
    setRate(rule?.rateBps === undefined ? '' : String(rule.rateBps / 100));
    setInfrastructureBudget(budget ? String(budget.infrastructure) : '');
    setDefenseBudget(budget ? String(budget.defense ?? 0) : '');
  }, [countryId, rule?.rateBps, budget?.infrastructure, budget?.defense]);

  const createBudgetDraft = () => {
    try {
      if (!budget || !Number.isSafeInteger(Number(infrastructureBudget)) || Number(infrastructureBudget) < 0) throw new Error('Infrastructure allocation must be a non-negative whole amount.');
      const annualBudget = { ...budget, infrastructure: Number(infrastructureBudget) };
      const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: nextDate(state.date), payload: { annualBudget } });
      const id = next.governance.proposalOrder.at(-1)!;
      setDraftId(id);
      setMessage(`Draft ${id} created using the existing annual-budget reform mechanism.`);
      onStateChange(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const createTaxDraft = () => {
    try {
      if (!supportedRule || !fiscal || !rate || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) throw new Error('Enter a corporate-tax rate from 0% to 100%.');
      const policy = structuredClone(fiscal.policy);
      const changedRule: TaxRule = {
        ...supportedRule,
        rateBps: Math.round(Number(rate) * 100),
        status: 'modelled',
        source: 'player-authored governance proposal',
        document: 'ProjectAtlas fiscal proposal',
        effectiveDate: nextDate(state.date),
        referenceDate: state.date,
        retrievedAt: state.date,
        limitations: 'Player proposal based on the existing legal rule; impacts are evaluated only using mechanisms currently represented by the model.',
      };
      policy.corporate = changedRule;
      const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: nextDate(state.date), payload: { policy } });
      const id = next.governance.proposalOrder.at(-1)!;
      setDraftId(id);
      setMessage(`Draft ${id} created. Review its available estimates before submitting.`);
      onStateChange(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const canSubmitDraft = Boolean(draft && canLegislate
    && (!draft.payload.policy || canProposeTax)
    && (!draft.payload.annualBudget || canProposeBudget));

  return <section className="cockpit-section">
    <h2>Fiscal policy</h2>
    {!hasAccess && <p>Confidential Government Information estimates are unavailable to this person. Political action requires the corresponding office authority; party leadership or Country selection grants neither capability.</p>}
    <section>
      <h3>Corporate tax</h3>
      {!hasAccess && !canProposeTax ? <p>This office does not hold both legislative and fiscal-reform sponsorship authority. Confidential information is unavailable.</p> : supportedRule ? <>
        <p>Current model rule: {(supportedRule.rateBps / 100).toFixed(2)}% · {supportedRule.status} · effective {supportedRule.effectiveDate}</p>
        {canProposeTax ? <>
          <label>Proposed rate (%)
            <input type="number" min="0" max="100" step="0.01" value={rate} onChange={event => setRate(event.target.value)} />
          </label>
          <button disabled={Boolean(draft) || !rate || !Number.isFinite(Number(rate)) || Math.round(Number(rate) * 100) === supportedRule.rateBps} onClick={createTaxDraft}>Create corporate-tax proposal</button>
        </> : <p>This office does not hold both legislative and fiscal-reform sponsorship authority.</p>}
      </> : <p>Corporate tax rule unavailable for this Country. Missing legal data is not a 0% rate.</p>}
    </section>
    <section>
      <h3>Defense authorization</h3>
      <p>An explicit modelled spending ceiling, not observed military spending or a capability bonus. Only actual payroll and constrained work are paid; missing military data remains unavailable.</p>
      {canProposeBudget && budget ? <>
        <label>Annual defense authorization (USD)<input type="number" min="0" step="1" value={defenseBudget} onChange={event => setDefenseBudget(event.target.value)} /></label>
        <button disabled={Boolean(draft) || !defenseBudget || !Number.isSafeInteger(Number(defenseBudget)) || Number(defenseBudget) < 0 || Number(defenseBudget) === (budget.defense ?? 0)} onClick={() => {
          try {
            const annualBudget = { ...budget, defense: Number(defenseBudget) };
            const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: nextDate(state.date), payload: { annualBudget } });
            setDraftId(next.governance.proposalOrder.at(-1)); onStateChange(next); setMessage('Defense budget draft created; ordinary immutable parliamentary enactment rules apply.');
          } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
        }}>Create defense budget proposal</button>
      </> : <p>Legislative and budget sponsorship authority is required.</p>}
    </section>
    <section>
      <h3>Annual budget</h3>
      {!hasAccess && !canProposeBudget ? <p>This office does not hold legislative and budget-reform sponsorship authority. Confidential information is unavailable.</p> : budget ? <>
        <p>Existing modelled annual allocation: {budget.infrastructure} infrastructure budget units. Only the named allocation is changed by this draft.</p>
        {canProposeBudget ? <>
          <label>Proposed infrastructure allocation
            <input type="number" min="0" step="1" value={infrastructureBudget} onChange={event => setInfrastructureBudget(event.target.value)} />
          </label>
          <button disabled={Boolean(draft) || !Number.isSafeInteger(Number(infrastructureBudget)) || Number(infrastructureBudget) === budget.infrastructure} onClick={createBudgetDraft}>Create annual-budget proposal</button>
        </> : <p>This office does not hold legislative and budget-reform sponsorship authority.</p>}
      </> : <p>Annual budget data unavailable for this Country; no allocation is invented.</p>}
    </section>
    {draft && <>
      <label>Unresolved canonical proposal
        <select value={draft.id} onChange={event => setDraftId(event.target.value)}>
          {unresolved.map(proposal => <option key={proposal.id} value={proposal.id}>{proposal.id} · {proposal.status}</option>)}
        </select>
      </label>
      <p>{draft.status === 'draft' ? 'Draft' : 'Submitted proposal'} {draft.id} · effective {draft.effectiveDate}</p>
      {draft.effectiveDate < state.date && <p>This proposal's effective date has passed. It cannot be submitted retroactively; withdraw it explicitly before creating a replacement.</p>}
      <details><summary>Canonical proposal content</summary>
        <pre>{JSON.stringify({ effectiveDate: draft.effectiveDate, payload: draft.payload }, null, 2)}</pre>
      </details>
      {state.governance.player.controlledPersonId === personId && <button onClick={() => {
        try {
          onStateChange(withdrawProposal(state, draft.id));
          setDraftId(undefined);
          setMessage('Proposal withdrawn. You may create a new draft with an explicit new effective date.');
        } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      }}>Withdraw proposal</button>}
      {hasAccess && ['draft', 'submitted'].includes(draft.status) && <button onClick={() => {
        try {
          onStateChange(produceGovernmentProposalEstimate(state, draft.id, personId));
          setMessage(`Government Information estimate recorded for ${state.date}.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      }}>Estimate proposal reactions</button>}
      {proposalPreview && <>
        <p>Government Information estimate · {proposalPreview.requestedOn} · {proposalPreview.coverage} coverage · confidence {proposalPreview.confidenceBps} bps · {proposalPreview.provenance.limitation}</p>
        <p>Public response estimate: {proposalPreview.publicEstimate.coverage} coverage · unknown {(proposalPreview.publicEstimate.unknownBps / 100).toFixed(1)}%. No support, opposition or neutral response has been observed.</p>
        <p>Parliamentary estimate: {proposalPreview.parliamentaryEstimate.coverage} coverage. {proposalPreview.parliamentaryEstimate.chambers.map(chamber => `${chamber.displayName}: ${chamber.outcome} (${chamber.coverage}; ${chamber.totalSeats === undefined ? 'seat count unavailable' : `${chamber.unavailableSeats} responses UNKNOWN`})`).join('; ')}</p>
        {proposalPreview.directPolicyChanges.map(change => <p key={change.path}>{change.explanation} · {change.coverage}</p>)}
        {proposalPreview.expectedConsequences.map((item, index) => <p key={`${item.goal}-${index}`}>{item.explanation} · {item.coverage} · confidence {item.confidenceBps} bps.</p>)}
        {proposalPreview.unsupportedChanges.map(item => <p key={item.path}>{item.path}: unavailable/partial · {item.reason}</p>)}
        {proposalPreview.limitations.map((item, index) => <p key={index}>{item}</p>)}
      </>}
      {draft.status === 'draft' && canSubmitDraft && <button disabled={draft.effectiveDate < state.date} onClick={() => {
        try { onStateChange(submitProposal(state, draft.id)); setMessage('Submitted. The proposal payload is now immutable. Resolve it through the existing parliamentary decision command.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      }}>Submit immutable proposal</button>}
      {draft.status === 'submitted' && canVote && <button onClick={() => {
        try {
          const next = resolveProposalVote(state, draft.id), result = next.governance.proposals[draft.id];
          const chamberResults = result.voteResult?.chambers.map(chamber => `${chamber.chamberId}: ${chamber.adopted === undefined ? chamber.coverage : chamber.adopted ? 'adopted' : 'rejected'}`).join('; ');
          setMessage(result.status === 'enacted'
            ? `Proposal adopted. Fiscal reform is queued for ${result.effectiveDate}; current accounts are not rewritten.`
            : result.status === 'rejected'
              ? `Parliament rejected the proposal. Chamber outcomes: ${chamberResults ?? 'unavailable'}.`
              : `Parliamentary result unavailable. No fiscal reform was scheduled. Chamber coverage: ${chamberResults ?? 'unavailable'}.`);
          onStateChange(next);
        } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      }}>Resolve parliamentary vote</button>}
    </>}
    {estimate && <details><summary>Last Government Information estimate</summary>
      <p>{estimate.proposalId} · requested {estimate.requestedOn} · {estimate.coverage} coverage · {estimate.provenance.limitation}</p>
      {estimate.expectedConsequences.map((item, index) => <p key={`${item.goal}-${index}`}>{item.explanation} · {item.coverage} · confidence {item.confidenceBps} bps.</p>)}
      {estimate.unsupportedChanges.map(item => <p key={item.path}>{item.path}: unavailable/partial · {item.reason}</p>)}
      {estimate.limitations.map((item, index) => <p key={index}>{item}</p>)}
    </details>}
    <p role="status">{message}</p>
  </section>;
}
