export const politicalIssues = ['fiscal_distribution', 'public_services', 'labour_protection', 'income_security', 'infrastructure', 'public_order'];
export const ideologyDimensions = ['fiscal_redistribution', 'market_intervention', 'public_services', 'labour_protection', 'social_progressivism', 'migration_openness', 'national_integration', 'decentralization', 'civil_liberties'];

/** Missing ideology evidence is deliberately independent of source identity. */
export const neutralPartyProfile = (_sourceBasis = undefined) => ({
  ideology: Object.fromEntries(ideologyDimensions.map(key => [key, 5_000])),
  issuePositions: Object.fromEntries(politicalIssues.map(key => [key, { preferenceBps: 5_000, intensityBps: 1_000, confidenceBps: 500, materialInterests: [], ideologicalPrior: 'neutral modelled fallback; no admissible dated ideology evidence' }])),
  constituencies: [],
  politicalFamily: { status: 'unavailable' },
  ideologicalBasis: { status: 'modelled_fallback', method: 'neutral_no_admissible_source', confidenceBps: 500, limitation: 'No compatible redistributable party-family or ideology observation was joined at the scenario date. Source identifiers do not influence this profile.' },
});

const scale = (value, maximum) => Math.round(value * 10_000 / maximum);
const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/** Admits reviewed V-Party evidence; incomplete records remain neutral and explicitly modelled. */
export const buildPartyProfile = (sourceBasis, evidence) => {
  const labels = evidence?.sourceIdeologicalLabels;
  const required = ['v2pariglef', 'v2pawelf', 'v2paimmig', 'v2palgbt', 'v2paminor', 'v2paplur', 'v2pawomlab', 'v2paculsup'];
  if (!labels || required.some(key => !Number.isInteger(labels[key]?.ordinal) || labels[key].coderCount < 3)) return neutralPartyProfile(sourceBasis);
  const right = scale(labels.v2pariglef.ordinal, 6), welfare = scale(labels.v2pawelf.ordinal, 5), migration = scale(labels.v2paimmig.ordinal, 4), lgbt = scale(labels.v2palgbt.ordinal, 4), minority = scale(labels.v2paminor.ordinal, 4), liberties = scale(labels.v2paplur.ordinal, 4), women = scale(labels.v2pawomlab.ordinal, 4), pluralNationalism = scale(labels.v2paculsup.ordinal, 4);
  const ideology = { fiscal_redistribution: 10_000 - right, market_intervention: 10_000 - right, public_services: welfare, labour_protection: average([welfare, women]), social_progressivism: average([migration, lgbt, minority, women]), migration_openness: migration, national_integration: average([minority, pluralNationalism]), decentralization: 5_000, civil_liberties: liberties };
  const preferences = { fiscal_distribution: ideology.fiscal_redistribution, public_services: ideology.public_services, labour_protection: ideology.labour_protection, income_security: welfare, infrastructure: 5_000, public_order: 5_000 };
  return {
    ideology,
    issuePositions: Object.fromEntries(politicalIssues.map(key => [key, { preferenceBps: preferences[key], intensityBps: evidence.confidenceBps, confidenceBps: evidence.confidenceBps, materialInterests: [], ideologicalPrior: evidence.transformationMethod }])),
    constituencies: [],
    politicalFamily: { status: evidence.status, value: evidence.politicalFamily },
    ideologicalBasis: { status: evidence.status, method: evidence.transformationMethod, confidenceBps: evidence.confidenceBps, source: 'V-Party Country-Party-Date v2', sourceUrl: 'https://v-dem.net/data/v-party-dataset/', referenceDate: '2022-02-01', effectiveDate: `${evidence.effectiveYear}-01-01`, sourcePartyIdentity: { partyFactsId: evidence.partyFactsId, vPartyId: evidence.vPartyId, vPartyName: evidence.vPartyName, linkMethod: evidence.linkMethod }, sourceIdeologicalLabels: labels, limitation: evidence.limitations },
  };
};
