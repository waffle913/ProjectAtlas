import { useMemo, useState } from 'react';
import { politicalRegistry } from '../simulation/politics/registry';
import type { PoliticalPersonState } from '../simulation/governance/model';
import { selectableStartingCountryIds, startingPersonCandidates, type PoliticalStartPath } from '../simulation/governance/selection';

export function StartGame({ countries, persons, onPlay, initialPath = 'party_leader' }: {
  countries: readonly { id: string; commonName: string }[];
  persons: readonly PoliticalPersonState[];
  onPlay: (personId: string, syntheticMilitary?: boolean, syntheticTrade?: boolean) => void;
  initialPath?: PoliticalStartPath;
}) {
  const availableCountryIds = useMemo(() => selectableStartingCountryIds(persons), [persons]);
  const firstPlayableCountry = countries.find(country => availableCountryIds.has(country.id));
  const [countryId, setCountryId] = useState(firstPlayableCountry?.id ?? countries[0]?.id ?? '');
  const [path, setPath] = useState<PoliticalStartPath>(initialPath);
  const parties = useMemo(() => politicalRegistry.countries[countryId]?.partyIds
    .map(id => politicalRegistry.parties[id]).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName)) ?? [], [countryId]);
  const [partyId, setPartyId] = useState('');
  const leaders = startingPersonCandidates(persons, countryId, 'party_leader');
  const firstLeaderParty = parties.find(party => leaders.some(person => person.partyId === party.id));
  const selectedPartyId = parties.some(party => party.id === partyId) ? partyId : firstLeaderParty?.id ?? parties[0]?.id ?? '';
  const party = politicalRegistry.parties[selectedPartyId];
  const candidates = startingPersonCandidates(persons, countryId, path, path === 'party_leader' ? selectedPartyId : undefined);
  const [personId, setPersonId] = useState('');
  const selectedPerson = candidates.find(person => person.id === personId) ?? candidates[0];
  const partyStatus = party?.governmentStatus === 'government' ? 'Listed in the current government bloc' : party?.governmentStatus === 'opposition' ? 'Listed in opposition' : 'Government position unavailable';
  const office = selectedPerson?.office;
  const [syntheticMilitary, setSyntheticMilitary] = useState(false);
  const [syntheticTrade, setSyntheticTrade] = useState(false);
  const [startError, setStartError] = useState('');
  return <div className="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-heading">
    <div className="start-card">
      <span className="eyebrow">PROJECTATLAS · 0.17 candidate</span>
      <h1 id="start-heading">Choose your political starting point</h1>
      <p>Select a Country, then start as a fictional party leader or a current fictional executive officeholder. Party leadership alone does not grant public office or government-information access.</p>
      <label>1. Country
        <select value={countryId} onChange={event => { setCountryId(event.target.value); setPartyId(''); setPersonId(''); }}>
          {countries.slice().sort((a, b) => a.commonName.localeCompare(b.commonName)).map(country => {
            const available = availableCountryIds.has(country.id);
            return <option value={country.id} key={country.id} disabled={!available}>{country.commonName}{available ? '' : ' — playable person evidence unavailable'}</option>;
          })}
        </select>
      </label>
      <label>Starting role
        <select value={path} onChange={event => {
          const value = event.target.value;
          if (value !== 'party_leader' && value !== 'officeholder') throw new Error('Unknown political starting route.');
          setPath(value); setPartyId(''); setPersonId('');
        }}>
          <option value="party_leader">Party leader</option>
          <option value="officeholder">Current public officeholder</option>
        </select>
      </label>
      {path === 'party_leader' && <>
        {parties.length === 0 && <p>No gameplay party data is available for this Country. Missing source coverage is not replaced with an invented party; use the officeholder route if evidence is available.</p>}
        <label>2. Party
          <select value={selectedPartyId} onChange={event => { setPartyId(event.target.value); setPersonId(''); }}>
            {parties.map(item => <option value={item.id} key={item.id}>{item.displayName}</option>)}
          </select>
        </label>
        <div className="start-status">{partyStatus}</div>
        <label>3. Fictional party leader
          <select value={selectedPerson?.id ?? ''} onChange={event => setPersonId(event.target.value)}>
            {candidates.map(person => <option value={person.id} key={person.id}>{person.displayName}</option>)}
          </select>
        </label>
        {candidates.length === 0 && <p>No active fictional leader is available for this party.</p>}
      </>}
      {path === 'officeholder' && <>
        <label>2. Current executive officeholder
          <select value={selectedPerson?.id ?? ''} onChange={event => setPersonId(event.target.value)}>
            {candidates.map(person => <option value={person.id} key={person.id}>{person.displayName} — {person.office!.title}</option>)}
          </select>
        </label>
        {candidates.length === 0 && <p>No current source-reconciled executive officeholder is available for this Country. No office or executive authority is invented.</p>}
      </>}
      {selectedPerson && <div className="leader-note">
        <strong>{selectedPerson.displayName}</strong>
        <span>{selectedPerson.leaderProvenance?.basis === 'modelled_fallback'
          ? 'Modelled fictional leader; party-leadership source evidence is unavailable.'
          : selectedPerson.leaderProvenance?.sourceLeader
            ? 'Fictional gameplay analogue based on reviewed party-leadership evidence; source identity is provenance only.'
            : path === 'officeholder' ? 'Fictional gameplay officeholder based on reconciled executive-office evidence; source identity is provenance only.'
              : 'Fictional gameplay party leader.'}</span>
        <span>{selectedPerson.partyId
          ? `Recorded party membership: ${politicalRegistry.parties[selectedPerson.partyId]?.displayName ?? 'party presentation unavailable'}${selectedPerson.isPartyLeader ? ' · party leader' : ''}.`
          : 'Party membership unavailable; no party affiliation or leadership is inferred.'}</span>
        <span>{office
          ? `Gameplay public office: ${office.title}${office.authorityProfile.capabilities.length
            ? ` · modelled capabilities: ${office.authorityProfile.capabilities.join(', ')}`
            : ' · no gameplay executive capabilities are assigned under current institutional coverage'}.`
          : 'No public office is reconciled to this leader; no executive powers are inferred.'}</span>
        {office && <small>{office.authorityProfile.limitation}</small>}
      </div>}
      <label><input type="checkbox" checked={syntheticMilitary} onChange={event => setSyntheticMilitary(event.target.checked)} /> Opt into an explicitly synthetic military demonstration for this Country only</label>
      <p>The default preserves unavailable armies. The optional scenario admits50 synthetic personnel from existing labour, modelled stocks/industry and a12millionUSD annual defense ceiling; no money or executive authority is granted. Management still requires a resolved executive office. Reports arrive at the monthly boundary.</p>
      <label><input type="checkbox" checked={syntheticTrade} onChange={event => setSyntheticTrade(event.target.checked)} /> Opt into an explicitly synthetic three-Country trade demonstration</label>
      <p>The trade scenario declares three aggregate categories, two existing partners, bounded supply, gradual alternative capacity, stocks and modelled ordinary tariffs. Existing production and expenditure fund every flow; no GDP, cash, historical 2026 observation or public office is granted. Without it, factual physical trade remains unavailable.</p>
      {startError && <p role="alert">{startError}</p>}
      <button className="primary-action" disabled={!selectedPerson} onClick={() => {
        if (!selectedPerson) return;
        try { onPlay(selectedPerson.id, syntheticMilitary, syntheticTrade); }
        catch (error) { setStartError(error instanceof Error ? error.message : String(error)); }
      }}>Play this person</button>
    </div>
  </div>;
}
