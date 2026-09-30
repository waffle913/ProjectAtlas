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

/** Admits a complete dated evidence record; incomplete records remain neutral and explicitly modelled. */
export const buildPartyProfile = (sourceBasis, evidence) => {
  const complete = evidence && ideologyDimensions.every(key => Number.isInteger(evidence.ideology?.[key]) && evidence.ideology[key] >= 0 && evidence.ideology[key] <= 10_000)
    && politicalIssues.every(key => Number.isInteger(evidence.issuePositions?.[key]?.preferenceBps) && evidence.issuePositions[key].preferenceBps >= 0 && evidence.issuePositions[key].preferenceBps <= 10_000);
  if (!complete) return neutralPartyProfile(sourceBasis);
  return {
    ideology: Object.fromEntries(ideologyDimensions.map(key => [key, evidence.ideology[key]])),
    issuePositions: Object.fromEntries(politicalIssues.map(key => [key, { preferenceBps: evidence.issuePositions[key].preferenceBps, intensityBps: evidence.issuePositions[key].intensityBps ?? 5_000, confidenceBps: evidence.issuePositions[key].confidenceBps ?? evidence.confidenceBps, materialInterests: evidence.issuePositions[key].materialInterests ?? [], ideologicalPrior: evidence.method }])),
    constituencies: evidence.constituencies ?? [],
    politicalFamily: evidence.politicalFamily ? { status: evidence.status, value: evidence.politicalFamily } : { status: 'unavailable' },
    ideologicalBasis: { status: evidence.status, method: evidence.method, confidenceBps: evidence.confidenceBps, limitation: evidence.limitation },
  };
};
