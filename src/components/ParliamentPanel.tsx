import { useMemo, useState } from 'react';
import type { SimulationState } from '../types';
import { politicalRegistry } from '../simulation/politics/registry';
import { appointMinister, appointViceLeader, issuePartyWhip, removeMinister } from '../simulation/governance/runtime';
import { dissolveParliament } from '../simulation/elections/runtime';

const PROPOSAL_KIND_LABELS: Record<string, string> = {
  fiscal_reform: 'Fiscal reform',
  constitutional_amendment: 'Constitutional amendment',
};
const WHIP_INSTRUCTION_LABELS: Record<string, string> = {
  yes: 'YES — vote in favour',
  no: 'NO — vote against',
  abstain: 'ABSTAIN',
  free: 'FREE VOTE — no party line',
};

/** Government/parliament actions already implemented in the canonical engine but
 *  previously unreachable from the interface. Every action is authority-gated by
 *  the engine (head-of-government / executive office) and its refusal reason is
 *  surfaced here. No parliamentary mechanic is invented. */
export function ParliamentPanel({ state, countryId, personId, onStateChange }: {
  state: SimulationState;
  countryId: string;
  personId: string;
  onStateChange: (next: SimulationState) => void;
}) {
  const person = state.governance.persons[personId];
  const isExecutive = Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
  const isHeadOfGovernment = Boolean(person?.status === 'active' && person.office?.countryId === countryId && person.office.role === 'head_of_government');
  const isPartyLeader = Boolean(person?.status === 'active' && person.isPartyLeader && person.partyId && person.countryId === countryId);
  const partyName = person?.partyId ? politicalRegistry.parties[person.partyId]?.displayName ?? 'your party' : 'your party';

  const cabinet = state.governance.cabinets?.[countryId];
  const ministers = Object.values(state.governance.persons).filter(p => p.status === 'active' && p.countryId === countryId && p.office?.role === 'minister').sort((a, b) => a.id.localeCompare(b.id));
  const appointable = Object.values(state.governance.persons).filter(p => p.status === 'active' && p.countryId === countryId && !p.office).sort((a, b) => a.id.localeCompare(b.id));
  const submittedProposals = Object.values(state.governance.proposals)
    .filter(proposal => proposal.countryId === countryId && proposal.status === 'submitted')
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));

  const [ministerId, setMinisterId] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [removeId, setRemoveId] = useState('');
  const [viceId, setViceId] = useState('');
  const [whipProposalId, setWhipProposalId] = useState('');
  const [whipInstruction, setWhipInstruction] = useState<'yes' | 'no' | 'abstain' | 'free'>('yes');
  const [message, setMessage] = useState('');

  const command = (run: () => SimulationState, ok: string) => {
    try { onStateChange(run()); setMessage(ok); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const proposalLabel = (proposal: { id: string; kind: string; effectiveDate: string }) =>
    `${PROPOSAL_KIND_LABELS[proposal.kind] ?? proposal.kind} proposal · effective ${proposal.effectiveDate}`;
  const selectedWhipProposal = submittedProposals.find(proposal => proposal.id === whipProposalId) ?? submittedProposals[0];
  const currentWhip = selectedWhipProposal?.whipInstructions?.find(whip => whip.partyId === person?.partyId);

  const parties = useMemo(() => {
    const ids = politicalRegistry.countries[countryId]?.partyIds ?? [];
    return ids.map(id => politicalRegistry.parties[id]).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [countryId]);

  const seatsTotal = parties.reduce((sum, party) => sum + (party.currentSeats ?? 0), 0);

  return <section className="cockpit-section">
    <h2>Parliament and government</h2>
    <p>National institutions and cabinet formation. Party leadership and public office are distinct; powers come only from the office actually held.</p>

    <h3>Chambers and seats</h3>
    {parties.length ? <>
      <p>{parties.length} registered party/parties · {seatsTotal} represented seat(s) in total.</p>
      {parties.map(party => <p key={party.id}>{party.displayName}: {party.currentSeats === null ? 'seat count unavailable' : `${party.currentSeats} seats`} · {party.governmentStatus === 'government' ? 'government bloc' : party.governmentStatus === 'opposition' ? 'opposition' : 'position unavailable'}</p>)}
    </> : <p>No registered gameplay party data for this Country.</p>}

    {isExecutive ? <>
      <h3>Government actions</h3>
      {isHeadOfGovernment && <>
        <label>Appoint a minister<select value={ministerId} onChange={e => setMinisterId(e.target.value)}><option value="">—</option>{appointable.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
        <label>Portfolio name<input value={portfolioName} onChange={e => setPortfolioName(e.target.value)} placeholder="e.g. Foreign Affairs" /></label>
        <button disabled={!ministerId || !portfolioName.trim()} onClick={() => {
          const name = portfolioName.trim();
          const portfolioId = `portfolio.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'office'}`;
          command(() => appointMinister(state, countryId, personId, ministerId, portfolioId, name), 'Minister appointed; their portfolio grants government-information access, never legislative powers.');
        }}>Appoint minister</button>
        <label>Remove a minister<select value={removeId} onChange={e => setRemoveId(e.target.value)}><option value="">—</option>{ministers.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>
        <button disabled={!removeId} onClick={() => command(() => removeMinister(state, countryId, personId, removeId), 'Minister removed from office.')}>Remove minister</button>
        <label>Appoint deputy head of government<select value={viceId} onChange={e => setViceId(e.target.value)}><option value="">—</option>{appointable.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
        <button disabled={!viceId} onClick={() => command(() => appointViceLeader(state, countryId, personId, viceId), 'Deputy appointed.')}>Appoint deputy</button>
      </>}
      <button onClick={() => command(() => dissolveParliament(state, countryId, personId), 'Parliament dissolved; the election cycle will run through the shared scheduler.' )}>Dissolve parliament (snap election)</button>
      {cabinet && Object.keys(cabinet.portfolios).length > 0 && <p>Current portfolios: {Object.values(cabinet.portfolios).filter(p => p.ministerPersonId).map(p => p.name).join(', ')}</p>}
    </> : <p>Government actions require the executive head of this Country; party leadership and Country selection grant none.</p>}
    {isPartyLeader ? <section>
      <h3>Party whip — {partyName}</h3>
      <p>A whip instruction sets your party's parliamentary line. Representatives still vote according to the internal distribution and may defect — a whip never guarantees every seat. A FREE VOTE preserves the underlying distribution.</p>
      {submittedProposals.length ? <>
        <label>Submitted proposal<select value={selectedWhipProposal?.id ?? ''} onChange={event => setWhipProposalId(event.target.value)}>
          <option value="">—</option>
          {submittedProposals.map(proposal => <option key={proposal.id} value={proposal.id}>{proposalLabel(proposal)}</option>)}
        </select></label>
        <label>Instruction<select value={whipInstruction} onChange={event => setWhipInstruction(event.target.value as typeof whipInstruction)}>
          {Object.entries(WHIP_INSTRUCTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button disabled={!selectedWhipProposal} onClick={() => command(() => issuePartyWhip(state, selectedWhipProposal!.id, personId, person!.partyId!, whipInstruction), 'Whip instruction recorded for your party.')}>Issue / change whip instruction</button>
        {currentWhip && <p>Your party's current instruction: {WHIP_INSTRUCTION_LABELS[currentWhip.instruction] ?? currentWhip.instruction} · issued {currentWhip.on}.</p>}
      </> : <p>No submitted proposals are pending for your Country.</p>}
    </section> : <p>Party whip instructions require active leadership of a registered party in this Country.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
