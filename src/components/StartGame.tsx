import { useMemo, useState } from 'react';
import { politicalRegistry } from '../simulation/politics/registry';
import type { PoliticalPersonState } from '../simulation/governance/model';

export function StartGame({ countries, leaders, onPlay }: {
  countries: readonly { id: string; commonName: string }[];
  leaders: readonly PoliticalPersonState[];
  onPlay: (personId: string) => void;
}) {
  const firstPlayableCountry = countries.find(country => politicalRegistry.countries[country.id]?.partyIds.length);
  const [countryId, setCountryId] = useState(firstPlayableCountry?.id ?? countries[0]?.id ?? '');
  const parties = useMemo(() => politicalRegistry.countries[countryId]?.partyIds
    .map(id => politicalRegistry.parties[id]).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName)) ?? [], [countryId]);
  const [partyId, setPartyId] = useState('');
  const selectedPartyId = parties.some(party => party.id === partyId) ? partyId : parties[0]?.id ?? '';
  const party = politicalRegistry.parties[selectedPartyId];
  const candidates = leaders.filter(person => person.partyId === selectedPartyId && person.isPartyLeader && person.status === 'active').sort((a, b) => a.id.localeCompare(b.id));
  const [personId, setPersonId] = useState('');
  const selectedPerson = candidates.find(person => person.id === personId) ?? candidates[0];
  const partyStatus = party?.governmentStatus === 'government' ? 'Listed in the current government bloc' : party?.governmentStatus === 'opposition' ? 'Listed in opposition' : 'Government position unavailable';
  const office = selectedPerson?.office;
  return <div className="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-heading">
    <div className="start-card">
      <span className="eyebrow">PROJECTATLAS · 0.15</span>
      <h1 id="start-heading">Choose your political starting point</h1>
      <p>Select a Country, a fictional gameplay party, and its fictional leader. Party leadership alone does not grant public office or government-information access.</p>
      <label>1. Country
        <select value={countryId} onChange={event => { setCountryId(event.target.value); setPartyId(''); setPersonId(''); }}>
          {countries.slice().sort((a, b) => a.commonName.localeCompare(b.commonName)).map(country => {
            const hasPartyData = Boolean(politicalRegistry.countries[country.id]?.partyIds.length);
            return <option value={country.id} key={country.id} disabled={!hasPartyData}>{country.commonName}{hasPartyData ? '' : ' — party data unavailable'}</option>;
          })}
        </select>
      </label>
      {parties.length === 0 && <p>No gameplay party data is available for this Country. Missing source coverage is not replaced with an invented party; choose another Country.</p>}
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
      {selectedPerson && <div className="leader-note">
        <strong>{selectedPerson.displayName}</strong>
        <span>{selectedPerson.leaderProvenance?.status === 'modelled_fallback' ? 'Modelled fictional leader; source-leader evidence unavailable.' : 'Fictional gameplay person.'}</span>
        <span>{office ? `${office.role.replaceAll('_', ' ')} · ${office.authorityProfile.capabilities.join(', ')}` : 'No public office is currently assigned; no executive powers are inferred.'}</span>
      </div>}
      <button className="primary-action" disabled={!selectedPerson} onClick={() => selectedPerson && onPlay(selectedPerson.id)}>Play this person</button>
    </div>
  </div>;
}
