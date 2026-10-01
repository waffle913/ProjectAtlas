import { describe, expect, it } from 'vitest';
// @ts-expect-error The deterministic data generator is a plain ESM module.
import { buildPartyProfile, ideologyDimensions, politicalIssues } from '../../../scripts/politics-party-profile.mjs';

const ordinals = { v2pariglef: 3, v2pawelf: 2, v2paimmig: 2, v2palgbt: 2, v2paminor: 2, v2paplur: 2, v2pawomlab: 2, v2paculsup: 2 };
const evidence = (changes: Partial<typeof ordinals> = {}, coderCount = 4) => ({
  status: coderCount >= 4 ? 'sourced' : 'partial', politicalFamily: 'economic_centre', transformationMethod: 'vparty_ordinal_linear_v1', measurementConfidenceBps: coderCount >= 4 ? 7_000 : 4_500,
  temporalStatus: 'historical_prior', temporalApplicabilityConfidenceBps: 2_500, effectiveDate: '2019-05-01', partyFactsId: 1, vPartyId: 1, vPartyName: 'Audit only', linkMethod: 'reviewed', limitations: 'Historical prior only.',
  sourceIdeologicalLabels: Object.fromEntries(Object.entries({ ...ordinals, ...changes }).map(([key, ordinal]) => [key, { ordinal, coderCount }])),
});
const profile = (changes: Partial<typeof ordinals> = {}, coderCount = 4) => buildPartyProfile({}, evidence(changes, coderCount));

describe('V-Party semantic transformation contract', () => {
  it('maps economic left-right only to the two limited economic priors and fiscal issue', () => {
    const left = profile({ v2pariglef: 0 }), right = profile({ v2pariglef: 6 });
    expect(left.ideology.fiscal_redistribution).toBe(10_000); expect(right.ideology.fiscal_redistribution).toBe(0);
    expect(left.ideology.market_intervention).toBe(10_000); expect(right.ideology.market_intervention).toBe(0);
    expect(left.issuePositions.fiscal_distribution.preferenceBps).toBe(10_000); expect(right.issuePositions.fiscal_distribution.preferenceBps).toBe(0);
    for (const issue of politicalIssues.filter((item: string) => item !== 'fiscal_distribution')) expect(left.issuePositions[issue]).toEqual(right.issuePositions[issue]);
  });

  it('maps immigration directly and does not let it alter unrelated dimensions', () => {
    const closed = profile({ v2paimmig: 0 }), open = profile({ v2paimmig: 4 });
    expect(closed.ideology.migration_openness).toBe(0); expect(open.ideology.migration_openness).toBe(10_000);
    for (const dimension of ideologyDimensions.filter((item: string) => item !== 'migration_openness')) expect(closed.ideology[dimension]).toBe(open.ideology[dimension]);
  });

  it('uses LGBT, minority and women-participation variables only as documented social-prior components', () => {
    for (const variable of ['v2palgbt', 'v2paminor', 'v2pawomlab'] as const) {
      const low = profile({ [variable]: 0 }), high = profile({ [variable]: 4 });
      expect(high.ideology.social_progressivism).toBeGreaterThan(low.ideology.social_progressivism);
      expect(high.ideology.labour_protection).toBe(5_000); expect(high.ideology.national_integration).toBe(5_000);
    }
  });

  it('uses pluralism only as a limited civil-liberties prior', () => {
    const low = profile({ v2paplur: 0 }), high = profile({ v2paplur: 4 });
    expect(low.ideology.civil_liberties).toBe(0); expect(high.ideology.civil_liberties).toBe(10_000);
    for (const dimension of ideologyDimensions.filter((item: string) => item !== 'civil_liberties')) expect(low.ideology[dimension]).toBe(high.ideology[dimension]);
  });

  it('does not map welfare universalism or cultural superiority to incompatible ProjectAtlas concepts', () => {
    const low = profile({ v2pawelf: 0, v2paculsup: 0 }), high = profile({ v2pawelf: 5, v2paculsup: 4 });
    expect(high.ideology).toEqual(low.ideology); expect(high.issuePositions).toEqual(low.issuePositions);
    expect(high.ideology.public_services).toBe(5_000); expect(high.ideology.labour_protection).toBe(5_000); expect(high.ideology.national_integration).toBe(5_000);
    expect(high.issuePositions.income_security).toMatchObject({ preferenceBps: 5_000, confidenceBps: 500 });
  });

  it('marks every unmapped dimension neutral and separates measurement quality from 2026 applicability', () => {
    const threeCoders = profile({}, 3), eightCoders = profile({}, 8);
    expect(threeCoders.ideologicalBasis).toMatchObject({ status: 'partial', temporalStatus: 'historical_prior', measurementConfidenceBps: 4_500, temporalApplicabilityConfidenceBps: 2_500, confidenceBps: 2_500 });
    expect(eightCoders.ideologicalBasis).toMatchObject({ status: 'sourced', temporalStatus: 'historical_prior', measurementConfidenceBps: 7_000, temporalApplicabilityConfidenceBps: 2_500, confidenceBps: 2_500 });
    for (const dimension of ['public_services', 'labour_protection', 'national_integration', 'decentralization']) expect(eightCoders.ideologicalBasis.dimensionMappings[dimension]).toMatchObject({ status: 'modelled_neutral', sourceVariables: [], confidenceBps: 500 });
  });
});
