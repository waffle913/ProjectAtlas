export const politicalIssues = ['fiscal_distribution', 'public_services', 'labour_protection', 'income_security', 'infrastructure', 'public_order'];
export const ideologyDimensions = ['fiscal_redistribution', 'market_intervention', 'public_services', 'labour_protection', 'social_progressivism', 'migration_openness', 'national_integration', 'decentralization', 'civil_liberties'];
const scale = (value, maximum) => Math.round(value * 10_000 / maximum);
const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
const neutralMapping = limitation => ({ status: 'modelled_neutral', sourceVariables: [], confidenceBps: 500, limitation });
const historicalMapping = (sourceVariables, confidenceBps, limitation) => ({ status: 'historical_prior', sourceVariables, confidenceBps, limitation });

/** Missing ideology evidence is deliberately independent of source identity. */
export const neutralPartyProfile = (_sourceBasis = undefined) => ({
  ideology: Object.fromEntries(ideologyDimensions.map(key => [key, 5_000])),
  issuePositions: Object.fromEntries(politicalIssues.map(key => [key, { preferenceBps: 5_000, intensityBps: 1_000, confidenceBps: 500, materialInterests: [], ideologicalPrior: 'neutral modelled fallback; no admissible dated ideology evidence' }])),
  constituencies: [],
  politicalFamily: { status: 'unavailable' },
  ideologicalBasis: { status: 'modelled_fallback', method: 'neutral_no_admissible_source', confidenceBps: 500, temporalStatus: 'unavailable', limitation: 'No admissible dated source measures any ProjectAtlas ideology dimension for the party; every dimension is neutral at low confidence. Source identifiers do not influence this profile.' },
});

/** Admits reviewed V-Party evidence; incomplete records remain neutral and explicitly modelled. */
export const buildPartyProfile = (sourceBasis, evidence) => {
  const labels = evidence?.sourceIdeologicalLabels;
  const required = ['v2pariglef', 'v2paimmig', 'v2palgbt', 'v2paminor', 'v2paplur', 'v2pawomlab'];
  if (!labels || required.some(key => !Number.isInteger(labels[key]?.ordinal) || labels[key].coderCount < 3)) return neutralPartyProfile(sourceBasis);
  const right = scale(labels.v2pariglef.ordinal, 6), migration = scale(labels.v2paimmig.ordinal, 4), lgbt = scale(labels.v2palgbt.ordinal, 4), minority = scale(labels.v2paminor.ordinal, 4), liberties = scale(labels.v2paplur.ordinal, 4), women = scale(labels.v2pawomlab.ordinal, 4);
  const historicalConfidence = evidence.temporalApplicabilityConfidenceBps;
  const ideology = { fiscal_redistribution: 10_000 - right, market_intervention: 10_000 - right, public_services: 5_000, labour_protection: 5_000, social_progressivism: average([lgbt, minority, women]), migration_openness: migration, national_integration: 5_000, decentralization: 5_000, civil_liberties: liberties };
  const dimensionMappings = {
    fiscal_redistribution: historicalMapping(['v2pariglef'], historicalConfidence, 'Inverse economic left-right prior; it does not directly measure a statutory tax or spending platform.'),
    market_intervention: historicalMapping(['v2pariglef'], historicalConfidence, 'Inverse economic left-right prior; it is a broad economic orientation rather than a direct intervention measure.'),
    public_services: neutralMapping('v2pawelf distinguishes means-tested from universalistic welfare, not the level or generosity of public services.'),
    labour_protection: neutralMapping('v2pawomlab measures equal labour-market participation for women, not general labour protection.'),
    social_progressivism: historicalMapping(['v2palgbt', 'v2paminor', 'v2pawomlab'], historicalConfidence, 'Equal-weight composite prior covering LGBT equality, minority rights and women labour-market participation only.'),
    migration_openness: historicalMapping(['v2paimmig'], historicalConfidence, 'Direct rescaling of the source immigration-support ordinal.'),
    national_integration: neutralMapping('Neither cultural superiority nor minority rights measures national sovereignty versus international integration.'),
    decentralization: neutralMapping('No admitted V-Party variable measures ProjectAtlas decentralization.'),
    civil_liberties: historicalMapping(['v2paplur'], historicalConfidence, 'Pluralism commitment is used as a limited prior and does not cover the full civil-liberties concept.'),
  };
  const preferences = { fiscal_distribution: ideology.fiscal_redistribution, public_services: 5_000, labour_protection: 5_000, income_security: 5_000, infrastructure: 5_000, public_order: 5_000 };
  return {
    ideology,
    issuePositions: Object.fromEntries(politicalIssues.map(key => { const mapped = key === 'fiscal_distribution'; return [key, { preferenceBps: preferences[key], intensityBps: mapped ? historicalConfidence : 1_000, confidenceBps: mapped ? historicalConfidence : 500, materialInterests: [], ideologicalPrior: mapped ? `${evidence.transformationMethod}:v2pariglef_historical_prior` : 'neutral_unmeasured_by_admitted_vparty_variables' }]; })),
    constituencies: [],
    politicalFamily: { status: evidence.status, value: evidence.politicalFamily },
    ideologicalBasis: { status: evidence.status, method: evidence.transformationMethod, confidenceBps: historicalConfidence, measurementConfidenceBps: evidence.measurementConfidenceBps, temporalApplicabilityConfidenceBps: historicalConfidence, temporalStatus: evidence.temporalStatus, source: 'V-Party Country-Party-Date v2', sourceUrl: 'https://v-dem.net/data/v-party-dataset/', referenceDate: '2022-02-01', effectiveDate: evidence.effectiveDate, sourcePartyIdentity: { partyFactsId: evidence.partyFactsId, vPartyId: evidence.vPartyId, vPartyName: evidence.vPartyName, linkMethod: evidence.linkMethod }, sourceIdeologicalLabels: labels, dimensionMappings, limitation: evidence.limitations },
  };
};
