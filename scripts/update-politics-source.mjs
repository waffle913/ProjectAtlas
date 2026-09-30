import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const REFERENCE_DATE = '2026-01-01';
const RETRIEVED_AT = '2026-09-30';
const API = 'https://api.data.ipu.org/v1';
const registry = JSON.parse(readFileSync('src/data/entity-registry.json', 'utf8'));
const byIso2 = new Map(registry.countries.filter(country => country.externalIds.isoAlpha2).map(country => [country.externalIds.isoAlpha2, country]));
const appliesOnReferenceDate = item => {
  const from = item?.date_from?.slice(0, 10), to = (item?.date_to || item?.date_valid_until)?.slice(0, 10);
  return (!from || from <= REFERENCE_DATE) && (!to || to >= REFERENCE_DATE);
};
const value = field => {
  if (!Array.isArray(field)) return field?.value;
  const applicable = field.filter(appliesOnReferenceDate).sort((a, b) => (b.date_from || '').localeCompare(a.date_from || ''));
  return applicable[0]?.value;
};
const isoDate = field => value(field)?.from?.slice(0, 10) ?? (typeof value(field) === 'string' ? value(field).slice(0, 10) : undefined);
const fetchJson = async url => {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ProjectAtlas political source updater' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};
const endpoint = (path, params = {}) => {
  const url = new URL(`${API}/${path}`);
  for (const [key, item] of Object.entries(params)) url.searchParams.set(key, String(item));
  return url.toString();
};
const unwrapData = response => response.data ?? response;
const relevant = item => {
  const date = isoDate(item.attributes.election_date);
  return date && date <= REFERENCE_DATE;
};
const electoralKind = attributes => {
  if (value(attributes.not_directly_elected) === true) return 'indirect';
  const terms = [value(attributes.electoral_system)?.term, ...(value(attributes.electoral_systems) ?? []).map(item => item.term)].filter(Boolean);
  if (terms.some(term => term.includes('mixed'))) return 'mixed';
  if (terms.some(term => term.includes('proportional'))) return 'proportional';
  if (terms.some(term => term.includes('plurality') || term.includes('majority') || term.includes('first_past'))) return 'majoritarian';
  if (terms.some(term => term.includes('indirect') || term.includes('appointed'))) return 'indirect';
  return 'other';
};

const chamberResponse = await fetchJson(endpoint('chambers', { 'page[size]': 400, 'date_range[from]': REFERENCE_DATE, 'date_range[to]': REFERENCE_DATE }));
const partyResponse = await fetchJson(endpoint('political_parties', { 'page[size]': 4000 }));
const partyNames = new Map(unwrapData(partyResponse).map(item => [item.political_party_code, item.party_name?.en ?? item.party_name?.fr ?? item.political_party_code]));
const chambers = unwrapData(chamberResponse).filter(item => byIso2.has(item.id.slice(0, 2)));

const electionByChamber = new Map();
let cursor = 0;
const workers = Array.from({ length: 12 }, async () => {
  while (cursor < chambers.length) {
    const chamber = chambers[cursor++];
    const response = await fetchJson(endpoint('elections', { filter: `chamber:eq:${chamber.id}`, 'page[size]': 100 }));
    const elections = unwrapData(response).filter(relevant).sort((a, b) => isoDate(b.attributes.election_date).localeCompare(isoDate(a.attributes.election_date)) || b.id.localeCompare(a.id));
    if (elections[0]) electionByChamber.set(chamber.id, elections[0]);
  }
});
await Promise.all(workers);

const countries = [];
for (const [iso2, country] of [...byIso2].sort((a, b) => a[1].id.localeCompare(b[1].id))) {
  const countryChambers = chambers.filter(chamber => chamber.id.startsWith(`${iso2}-`)).sort((a, b) => a.id.localeCompare(b.id));
  if (!countryChambers.length) continue;
  countries.push({
    countryId: country.id, ipuCountryCode: iso2,
    legislatureKind: countryChambers.length === 1 ? 'unicameral' : 'bicameral',
    chambers: countryChambers.map(chamber => {
      const attributes = chamber.attributes, election = electionByChamber.get(chamber.id), electionAttributes = election?.attributes;
      const statutorySeats = value(attributes.statutory_members_number);
      const seats = (value(electionAttributes?.seats_per_parties) ?? []).map(item => ({ sourcePartyId: item.party, sourcePartyName: partyNames.get(item.party) ?? item.party, seats: item.total_number_of_seats })).filter(item => Number.isSafeInteger(item.seats) && item.seats >= 0);
      const seatsAtStake = value(electionAttributes?.number_of_seats_at_stake);
      const seatSum = seats.reduce((sum, item) => sum + item.seats, 0);
      const fullAllocation = Number.isSafeInteger(statutorySeats) && statutorySeats >= 0 && Number.isSafeInteger(seatsAtStake) && seatsAtStake === statutorySeats && seatSum <= statutorySeats;
      return {
        sourceChamberId: chamber.id,
        displayName: value(attributes.chamber_name)?.en ?? value(attributes.chamber_name)?.fr ?? chamber.id,
        totalSeats: Number.isSafeInteger(statutorySeats) ? statutorySeats : undefined,
        currentMembers: Number.isSafeInteger(value(attributes.current_members_number)) ? value(attributes.current_members_number) : undefined,
        electoralRule: electoralKind(attributes),
        electoralTerms: [value(attributes.electoral_system)?.term, ...(value(attributes.electoral_systems) ?? []).map(item => item.term)].filter(Boolean),
        termYears: Number.isFinite(value(attributes.parliamentary_term)) ? value(attributes.parliamentary_term) : undefined,
        election: election ? {
          sourceElectionId: election.id, electionDate: isoDate(electionAttributes.election_date), nextElectionDate: isoDate(electionAttributes.expect_date_next_election), firstSessionDate: isoDate(electionAttributes.first_session_date),
          fullAllocation, seats: fullAllocation ? seats : [], independentOtherSeats: fullAllocation ? statutorySeats - seatSum : undefined,
          governmentPartyText: value(electionAttributes.name_of_parties_government)?.en || value(electionAttributes.name_of_parties_government)?.fr || undefined,
          numberPartiesInGovernment: value(electionAttributes.num_parties_in_government), numberPartiesWinningSeats: value(electionAttributes.num_parties_winning_seats),
          upstreamSources: value(electionAttributes.sources)?.en || value(electionAttributes.sources)?.fr || undefined,
        } : undefined,
      };
    }),
  });
}

const snapshot = {
  schemaVersion: 1, referenceDate: REFERENCE_DATE, retrievedAt: RETRIEVED_AT,
  source: { name: 'IPU Parline', publisher: 'Inter-Parliamentary Union', url: 'https://data.ipu.org/', api: API, licence: 'CC BY-NC-SA 4.0', terms: 'https://www.ipu.org/terms-use' },
  methodology: 'Chamber values valid at 2026-01-01. Latest election on or before that date. Seat allocations retained only for full renewals whose seats-at-stake equal the statutory chamber size and reconcile without excess.',
  countries,
};
assert(countries.length > 100, 'Unexpectedly low IPU country coverage.');
writeFileSync('src/data/source-snapshots/ipu-parline-politics-2026-01-01.json', `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify({ countries: countries.length, chambers: countries.reduce((sum, item) => sum + item.chambers.length, 0), fullSeatAllocations: countries.flatMap(item => item.chambers).filter(item => item.election?.fullAllocation).length }, null, 2));
