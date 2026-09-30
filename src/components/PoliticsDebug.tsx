import type { SimulationState } from '../types';
import { inspectPolitics } from '../simulation/politics/runtime';
import { politicalRegistry } from '../simulation/politics/registry';

export function PoliticsDebug({ state, countryId }: { state: SimulationState; countryId: string }) {
  const politics = state.politics.countries[countryId];
  if (!politics) return null;
  const definition = politicalRegistry.countries[countryId];
  const institution = definition && politicalRegistry.institutions[definition.institutionId];
  return <details>
    <summary>Politics debug · fictional parties · modelled opinion</summary>
    <p>Institution coverage: {definition?.coverage.institutions ?? 'unavailable'}. Legislature: {definition?.coverage.legislature ?? 'unavailable'}. Seats and coalition: {definition?.coverage.seats ?? 'unavailable'}/{definition?.coverage.coalition ?? 'unavailable'}.</p>
    <p>{institution?.provenance.limitation}</p>
    <p>Parties: {definition?.partyIds.length ?? 0} · organizations: {definition?.organizationIds.length ?? 0} · Regions: {politics.regionIds.length} · last weekly update: {state.politics.lastOpinionUpdate ?? 'not evaluated'}</p>
    <details><summary>Institutions, parties, organizations and cohort opinion</summary><pre style={{ overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(inspectPolitics(state, countryId), null, 2)}</pre></details>
  </details>;
}
