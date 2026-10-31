import { useMemo, useState } from 'react';
import type { SimulationState } from '../types';
import {
  POLITICAL_START_PATHS, countryStartingOptions, selectableStartingCountryIds,
  type PoliticalStartPath, type StartingPersonOption,
} from '../simulation/governance/selection';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  sovereign_state: 'sovereign state',
  dependency: 'dependent territory',
  disputed: 'disputed entity',
  partially_recognized: 'partially recognized state',
  special_status: 'special-status entity',
};
const unavailableReason = (country: { id: string; commonName: string; entityType?: string }) => {
  const label = ENTITY_TYPE_LABELS[country.entityType ?? ''] ?? country.entityType ?? 'entity';
  return `${label} — no admissible national leader or opposition party leader on this date; playable start not configured`;
};
const provenanceNote = (option: StartingPersonOption) => option.provenanceBasis === 'modelled_fallback'
  ? 'Modelled fictional leader; party-leadership source evidence is unavailable.'
  : option.provenanceBasis
    ? 'Fictional gameplay analogue based on reviewed party-leadership evidence; source identity is provenance only.'
    : option.office
      ? 'Fictional gameplay officeholder based on reconciled executive-office evidence; source identity is provenance only.'
      : 'Fictional gameplay political person.';
const officeNote = (option: StartingPersonOption) => {
  const office = option.office;
  if (!office) return 'No public office is reconciled to this starting person; no executive powers are inferred.';
  const capabilityText = office.capabilities.length
    ? `· modelled capabilities: ${office.capabilities.join(', ')}`
    : '· no gameplay executive capabilities are assigned under current institutional coverage';
  return `Gameplay public office: ${office.title} ${capabilityText}.`;
};

export function StartGame({ countries, state, onPlay, initialPath = 'national_leader' }: {
  countries: readonly { id: string; commonName: string; entityType?: string }[];
  state: SimulationState;
  onPlay: (personId: string, syntheticMilitary?: boolean, syntheticTrade?: boolean) => void;
  initialPath?: PoliticalStartPath;
}) {
  const availableCountryIds = useMemo(() => selectableStartingCountryIds(state), [state]);
  const firstPlayableCountry = countries.find(country => availableCountryIds.has(country.id));
  const initialOptions = useMemo(() => countryStartingOptions(state, firstPlayableCountry?.id ?? countries[0]?.id ?? ''), [state]);
  const [countryId, setCountryId] = useState(firstPlayableCountry?.id ?? countries[0]?.id ?? '');
  const [path, setPath] = useState<PoliticalStartPath>(initialOptions.paths[initialPath].candidates.length
    ? initialPath
    : POLITICAL_START_PATHS.find(candidate => initialOptions.paths[candidate].candidates.length) ?? initialPath);
  const [partyId, setPartyId] = useState('');
  const [personId, setPersonId] = useState('');
  const [startError, setStartError] = useState('');
  const options = useMemo(() => countryStartingOptions(state, countryId), [state, countryId]);
  // Only a party whose opposition status is established and which really has an admissible leader is
  // offered: a governing party, or one whose government/opposition status is unavailable, never is.
  const oppositionParties = options.parties.filter(party => party.status === 'opposition' && party.leaderPersonIds.length > 0);
  const selectedPartyId = oppositionParties.some(party => party.partyId === partyId) ? partyId : oppositionParties[0]?.partyId ?? '';
  const selectedParty = options.parties.find(party => party.partyId === selectedPartyId);
  const candidates = path === 'national_leader'
    ? options.paths.national_leader.candidates
    : options.paths.opposition_party_leader.candidates.filter(option => option.partyId === selectedPartyId);
  const selected = candidates.find(option => option.personId === personId) ?? candidates[0];
  const chooseCountry = (nextCountryId: string) => {
    setCountryId(nextCountryId); setPartyId(''); setPersonId(''); setStartError('');
    const nextOptions = countryStartingOptions(state, nextCountryId);
    if (!nextOptions.paths[path].candidates.length) {
      const fallback = POLITICAL_START_PATHS.find(candidate => nextOptions.paths[candidate].candidates.length);
      if (fallback) setPath(fallback);
    }
  };
  const excludedParties = options.parties.filter(party => party.status !== 'opposition' || party.leaderPersonIds.length === 0);
  return <div className="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-heading">
    <div className="start-card">
      <span className="eyebrow">PROJECTATLAS</span>
      <h1 id="start-heading">Choose your political starting point</h1>
      <p>Select a Country, then start on one of the two authorized routes: the national leader who actually exercises governmental authority, or the leader of a party in opposition. Neither route grants an office: every capability comes from the position the person really holds.</p>
      <label>1. Country
        <select value={countryId} onChange={event => chooseCountry(event.target.value)}>
          {countries.slice().sort((a, b) => a.commonName.localeCompare(b.commonName)).map(country => {
            const available = availableCountryIds.has(country.id);
            return <option value={country.id} key={country.id} disabled={!available}>{country.commonName}{available ? '' : ` — ${unavailableReason(country)}`}</option>;
          })}
        </select>
      </label>
      <label>2. Authorized route
        <select value={path} onChange={event => {
          const value = event.target.value;
          if (value !== 'national_leader' && value !== 'opposition_party_leader') throw new Error('Unknown political starting route.');
          setPath(value); setPartyId(''); setPersonId(''); setStartError('');
        }}>
          {POLITICAL_START_PATHS.map(candidate => <option value={candidate} key={candidate} disabled={options.paths[candidate].candidates.length === 0}>
            {options.paths[candidate].descriptor.title}{options.paths[candidate].candidates.length === 0 ? ' — unavailable' : ''}
          </option>)}
        </select>
      </label>
      <div className="start-status">{options.paths[path].descriptor.summary}</div>
      {path === 'national_leader' && <>
        <label>3. National leader
          <select value={selected?.personId ?? ''} onChange={event => setPersonId(event.target.value)}>
            {candidates.map(option => <option value={option.personId} key={option.personId}>{option.displayName} — {option.office?.title ?? 'no office'}</option>)}
          </select>
        </label>
        {candidates.length === 0 && <>
          <p>No officeholder of this Country exercises a resolved national executive authority on this date. {options.paths.national_leader.descriptor.limitation} No office or executive authority is invented.</p>
          <small>{options.paths.national_leader.unavailable.slice(0, 3).map(entry => `${entry.displayName}: ${entry.reasons[0]}`).join(' ')}</small>
        </>}
      </>}
      {path === 'opposition_party_leader' && <>
        <label>3. Opposition party
          <select value={selectedPartyId} onChange={event => { setPartyId(event.target.value); setPersonId(''); setStartError(''); }}>
            {oppositionParties.map(party => <option value={party.partyId} key={party.partyId}>{party.displayName}</option>)}
          </select>
        </label>
        {selectedParty && <div className="start-status">{selectedParty.limitation}</div>}
        <label>4. Fictional party leader
          <select value={selected?.personId ?? ''} onChange={event => setPersonId(event.target.value)}>
            {candidates.map(option => <option value={option.personId} key={option.personId}>{option.displayName}</option>)}
          </select>
        </label>
        {oppositionParties.length === 0 && <>
          <p>No registered party of this Country has an established opposition status with an admissible leader on this date. {options.paths.opposition_party_leader.descriptor.limitation} Missing political data is never replaced with an invented party or an implied opposition.</p>
          <small>{options.paths.opposition_party_leader.unavailable.slice(0, 3).map(entry => `${entry.displayName}: ${entry.reasons[0]}`).join(' ')}</small>
        </>}
        {oppositionParties.length > 0 && excludedParties.length > 0 && <small>
          {excludedParties.length} registered party record(s) of this Country are not offered here: governing bloc or government/opposition status unavailable, or no admissible active leader.
        </small>}
      </>}
      {selected && <div className="leader-note">
        <strong>{selected.displayName}</strong>
        <span>{provenanceNote(selected)}</span>
        <span>{selected.partyId
          ? `Recorded party membership: ${options.parties.find(party => party.partyId === selected.partyId)?.displayName ?? 'party presentation unavailable'}${selected.isPartyLeader ? ' · party leader' : ''}.`
          : 'Party membership unavailable; no party affiliation or leadership is inferred.'}</span>
        <span>{officeNote(selected)}</span>
        {selected.office && <small>{selected.office.limitations.join(' ')}</small>}
        {!selected.office && <small>This route grants no executive authority: party leadership alone never carries public office or government information.</small>}
      </div>}
      {startError && <p role="alert">{startError}</p>}
      <button className="primary-action" disabled={!selected} onClick={() => {
        if (!selected) return;
        setStartError('');
        try { onPlay(selected.personId); }
        catch (error) { setStartError(error instanceof Error ? error.message : String(error)); }
      }}>Play this person</button>
    </div>
  </div>;
}
