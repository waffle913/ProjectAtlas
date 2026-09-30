import type { SimulationState } from '../types';
import { inspectPolitics } from '../simulation/politics/runtime';

export function PoliticsDebug({ state, countryId }: { state: SimulationState; countryId: string }) {
  const politics = state.politics.countries[countryId];
  if (!politics) return null;
  const institution = state.politics.institutions[politics.institutionId];
  return <details>
    <summary>Politics debug · fictional parties · modelled opinion</summary>
    <p>Institution coverage: {politics.coverage.institutions}. Legislature: {politics.coverage.legislature}. Seats and coalition: {politics.coverage.seats}/{politics.coverage.coalition}.</p>
    <p>{institution.provenance.limitation}</p>
    <p>Parties: {politics.partyIds.length} · organizations: {politics.organizationIds.length} · Regions: {politics.regionIds.length} · last weekly update: {state.politics.lastOpinionUpdate ?? 'not evaluated'}</p>
    <details><summary>Institutions, parties, organizations and cohort opinion</summary><pre style={{ overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(inspectPolitics(state, countryId), null, 2)}</pre></details>
  </details>;
}
