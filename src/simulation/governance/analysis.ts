import type { SimulationState } from '../../types';
import { CATEGORIES, TAXES, type Budget, type TaxCategory, type TaxKind } from '../fiscal/model';
import { evaluateImmediateFiscalPolicyCounterfactual } from '../fiscal/runtime';
import { sum } from '../fiscal/math';
import { POLITICAL_ISSUES, type PoliticalParty, type PoliticalRegistry } from '../politics/model';
import type { CoveredMetric, DirectPolicyChange, EvaluationCoverage, ExpectedConsequence, GovernanceGoal, PartyGoalProfile, PartyIssueEvaluation, PartyIssuePreference, PartyProposalEvaluation, PoliticalProposal, ProposalAnalysis, ProposalMaterialContext, UnsupportedProposalChange } from './model';

export const GOVERNANCE_GOALS = [...POLITICAL_ISSUES, 'fiscal_sustainability'] as const satisfies readonly GovernanceGoal[];
export const GOVERNANCE_VOTE_THRESHOLDS = Object.freeze({ yesAgreementBps: 6_000, noAgreementBps: 4_000, minimumConfidenceBps: 3_000 });
const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const signed = (value: number) => Math.max(-10_000, Math.min(10_000, Math.round(value)));
const ratio = (numerator: number, denominator: number, scale = 10_000) => denominator > 0 ? Math.round(numerator * scale / denominator) : undefined;
const metric = (valueBps: number | undefined, source: string, limitation?: string): CoveredMetric => valueBps === undefined ? { coverage: 'unavailable', source, limitation: limitation ?? 'Required material denominator or observation is unavailable.' } : { valueBps: clamp(valueBps), coverage: 'complete', source, limitation };
const monthlyBudget = (budget: Budget) => Math.round(sum(CATEGORIES.map(key => budget[key])) / 12);

export function materialContextForProposal(state: SimulationState, proposal: PoliticalProposal): ProposalMaterialContext {
  const country = state.fiscal.countries[proposal.countryId], regions = Object.keys(state.socioeconomy.regions).filter(id => state.regionOwnership[id] === proposal.countryId).sort();
  let labourForce = 0, unemployed = 0, people = 0, needsWeighted = 0, needsPeople = 0; const personsByIncome = [0, 0, 0], disposableByIncome = [0, 0, 0];
  for (const id of regions) { const region = state.socioeconomy.regions[id]; if (!region?.economy) continue; labourForce += region.economy.labourForce; unemployed += region.economy.unemployed; people += region.population ?? 0; if (region.economy.basicNeedsCoverageBps !== null) { needsWeighted += region.economy.basicNeedsCoverageBps * (region.population ?? 0); needsPeople += region.population ?? 0; } const fiscal = state.fiscal.regions[id]; for (const cohort of region.cohorts) { const index = cohort.income === 'low' ? 0 : cohort.income === 'middle' ? 1 : 2; personsByIncome[index] += cohort.persons; } for (let index = 0; index < 3; index++) disposableByIncome[index] += fiscal?.disposable[index] ?? region.economy.incomeByGroup[index]; }
  const account = country?.account, knownRevenue = account?.knownTaxRevenue ?? sum(Object.values(state.fiscal.regions).filter(region => region.owner === proposal.countryId).flatMap(region => TAXES.map(category => region.taxes[category].collected))), totalRevenue = account?.totalRevenue ?? (country ? knownRevenue + country.revenueCalibration.monthlyAmount : 0), spending = account?.totalSpending ?? (country ? monthlyBudget(country.annualBudget) : 0);
  const fiscalSustainability = ratio(Math.min(totalRevenue, spending), spending), deficit = Math.max(0, spending - totalRevenue), deficitStress = totalRevenue > 0 ? ratio(deficit, totalRevenue) : deficit > 0 ? 10_000 : 0, unpaid = account?.stress.unpaidCommitments ?? (country ? sum(Object.values(country.arrears)) + country.interestArrears : 0), unpaidStress = totalRevenue > 0 ? ratio(unpaid, totalRevenue) : unpaid > 0 ? 10_000 : 0;
  const services = country ? [country.services.health.coverageBps, country.services.education.coverageBps].filter((value): value is number => value !== null) : [], publicCoverage = services.length ? Math.round(sum(services) / services.length) : undefined, infrastructureCoverage = country?.services.infrastructure.coverageBps ?? undefined;
  return {
    unemployment: metric(ratio(unemployed, labourForce), 'socioeconomy.current_employment', labourForce ? undefined : 'No observed labour-force denominator.'),
    fiscalSustainability: metric(fiscalSustainability, 'fiscal.current_revenue_and_spending'),
    incomeSecurity: metric(needsPeople ? Math.round(needsWeighted / needsPeople) : undefined, 'socioeconomy.current_basic_needs_coverage', people ? undefined : 'No represented population.'),
    fiscalDistribution: metric(personsByIncome[0] && personsByIncome[2] && disposableByIncome[2] ? ratio(Math.round(disposableByIncome[0] / personsByIncome[0]), Math.round(disposableByIncome[2] / personsByIncome[2])) : undefined, 'fiscal.current_low_to_high_disposable_income_ratio'),
    publicServices: metric(publicCoverage, 'fiscal.current_health_education_coverage'),
    infrastructure: metric(infrastructureCoverage, 'fiscal.current_infrastructure_coverage'),
    fiscalDistress: metric(Math.max(deficitStress ?? 0, unpaidStress ?? 0, country?.debtLimit ? ratio(country.debt, country.debtLimit) ?? 0 : 0), 'fiscal.deficit_arrears_debt_pressure', totalRevenue || country?.debtLimit ? undefined : 'Revenue and debt-limit denominators unavailable.'),
  };
}

const causalPolicyFields = new Set(['rateBps', 'allowance', 'lower', 'cap', 'threshold']);
function structuralDiff(before: unknown, after: unknown, path: string, coverage: EvaluationCoverage, out: DirectPolicyChange[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (typeof before === 'number' && typeof after === 'number') { out.push({ path, before, after, delta: after - before, coverage, explanation: 'Explicit numeric fiscal rule change.' }); return; }
  if (Array.isArray(before) && Array.isArray(after)) { const length = Math.max(before.length, after.length); for (let index = 0; index < length; index++) structuralDiff(before[index], after[index], `${path}[${index}]`, coverage, out); return; }
  if (before && after && typeof before === 'object' && typeof after === 'object') { for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) if (causalPolicyFields.has(key) || Array.isArray((before as Record<string, unknown>)[key]) || Array.isArray((after as Record<string, unknown>)[key])) structuralDiff((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], `${path}.${key}`, coverage, out); return; }
  out.push({ path, before: before as DirectPolicyChange['before'], after: after as DirectPolicyChange['after'], coverage, explanation: 'Structural fiscal rule change.' });
}
const categoryKinds: Record<TaxKind, TaxCategory[]> = { personal: ['personal'], consumption: ['consumption'], payroll: ['employee', 'employer'], corporate: ['corporate'] };
const contextOutcome = (context: ProposalMaterialContext, goal: GovernanceGoal): CoveredMetric | undefined => {
  if (goal === 'fiscal_distribution') return context.fiscalDistribution;
  if (goal === 'public_services') return context.publicServices;
  if (goal === 'income_security') return context.incomeSecurity;
  if (goal === 'infrastructure') return context.infrastructure;
  if (goal !== 'fiscal_sustainability') return undefined;
  if (context.fiscalSustainability.valueBps === undefined || context.fiscalDistress.valueBps === undefined) return { coverage: 'unavailable', source: 'fiscal.combined_sustainability', limitation: 'Both current financing coverage and fiscal distress are required.' };
  return { valueBps: Math.min(context.fiscalSustainability.valueBps, 10_000 - context.fiscalDistress.valueBps), coverage: context.fiscalSustainability.coverage === 'complete' && context.fiscalDistress.coverage === 'complete' ? 'complete' : 'partial', source: 'fiscal.current_financing_and_distress', limitation: 'Composite goal outcome combines present financing coverage with deficit, arrears and debt pressure; it is not a forecast.' };
};
const consequence = (goal: GovernanceGoal, directionBps: number, confidenceBps: number, coverage: EvaluationCoverage, source: string, explanation: string): ExpectedConsequence => ({ goal, directionBps: signed(directionBps), magnitudeBps: Math.abs(signed(directionBps)), confidenceBps: clamp(confidenceBps), coverage, source, explanation });
const budgetDirection = (delta: number, baseline: number, severityBps: number) => signed((ratio(delta, Math.max(1, baseline), 5_000) ?? 0) * (5_000 + severityBps) / 10_000);

export function analyzeProposal(state: SimulationState, proposal: PoliticalProposal): ProposalAnalysis {
  const country = state.fiscal.countries[proposal.countryId]; if (!country) throw new Error('Proposal Country has no fiscal state.');
  const materialContext = materialContextForProposal(state, proposal), directPolicyChanges: DirectPolicyChange[] = [], unsupportedChanges: UnsupportedProposalChange[] = [], expectedConsequences: ExpectedConsequence[] = [], limitations: string[] = [];
  if (proposal.payload.annualBudget) for (const category of CATEGORIES) { const before = country.annualBudget[category], after = proposal.payload.annualBudget[category]; if (before !== after) directPolicyChanges.push({ path: `annualBudget.${category}`, before, after, delta: after - before, coverage: 'complete', explanation: 'Explicit annual appropriation change.' }); }
  if (proposal.payload.policy) for (const kind of Object.keys(categoryKinds) as TaxKind[]) {
    const before = country.policy[kind], after = proposal.payload.policy[kind]; if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const coverage: EvaluationCoverage = before === null || after === null ? 'unavailable' : 'complete'; structuralDiff(before, after, `policy.${kind}`, coverage, directPolicyChanges);
    if (before === null || after === null) unsupportedChanges.push({ path: `policy.${kind}`, coverage: 'unavailable', reason: `${before === null ? 'Current' : 'Proposed'} legal rule is unavailable; absence is not a zero rate and no rate delta is inferred.` });
  }
  if (proposal.payload.annualBudget) {
    const after = proposal.payload.annualBudget, before = country.annualBudget, serviceDelta = after.health + after.education - before.health - before.education, securityDelta = after.pensions + after.incomeSupport - before.pensions - before.incomeSupport, infrastructureDelta = after.infrastructure - before.infrastructure, totalDelta = sum(CATEGORIES.map(key => after[key] - before[key]));
    const serviceSeverity = 10_000 - (materialContext.publicServices.valueBps ?? 10_000), securitySeverity = Math.max(10_000 - (materialContext.incomeSecurity.valueBps ?? 10_000), materialContext.unemployment.valueBps ?? 0), infrastructureSeverity = Math.max(10_000 - (materialContext.infrastructure.valueBps ?? 10_000), clamp(ratio(country.services.infrastructure.backlog, Math.max(1, country.services.infrastructure.required)) ?? 0));
    if (serviceDelta) expectedConsequences.push(consequence('public_services', budgetDirection(serviceDelta, before.health + before.education, serviceSeverity), 8_000, materialContext.publicServices.coverage, 'annualBudget.health+education', 'Appropriation direction weighted by current service coverage; execution and future capacity remain uncertain.'));
    if (securityDelta) expectedConsequences.push(consequence('income_security', budgetDirection(securityDelta, before.pensions + before.incomeSupport, securitySeverity), 8_000, materialContext.incomeSecurity.coverage, 'annualBudget.pensions+incomeSupport', 'Transfer appropriation direction weighted by current needs and unemployment; future household dynamics are not forecast.'));
    if (infrastructureDelta) expectedConsequences.push(consequence('infrastructure', budgetDirection(infrastructureDelta, before.infrastructure, infrastructureSeverity), 8_000, materialContext.infrastructure.coverage, 'annualBudget.infrastructure', 'Infrastructure appropriation direction weighted by current capacity and backlog.'));
    if (totalDelta) expectedConsequences.push(consequence('fiscal_sustainability', -budgetDirection(totalDelta, Math.max(1, totalRevenueFor(state, proposal.countryId)), materialContext.fiscalDistress.valueBps ?? 0), 8_500, materialContext.fiscalSustainability.coverage, 'annualBudget.total', 'Immediate appropriation pressure relative to current revenue; no macroeconomic forecast.'));
  }
  if (proposal.payload.policy) {
    const changedKinds = (Object.keys(categoryKinds) as TaxKind[]).filter(kind => JSON.stringify(country.policy[kind]) !== JSON.stringify(proposal.payload.policy![kind])), supportedKinds = changedKinds.filter(kind => country.policy[kind] !== null && proposal.payload.policy![kind] !== null);
    if (supportedKinds.length) {
      const counterfactual = evaluateImmediateFiscalPolicyCounterfactual(state, proposal.countryId, proposal.payload.policy, proposal.effectiveDate), categories = supportedKinds.flatMap(kind => categoryKinds[kind]), revenueDelta = sum(categories.map(category => counterfactual.proposedRevenueByCategory[category] - counterfactual.currentRevenueByCategory[category]));
      if (revenueDelta) expectedConsequences.push(consequence('fiscal_sustainability', signed((ratio(revenueDelta, Math.max(1, totalRevenueFor(state, proposal.countryId)), 5_000) ?? 0) * (5_000 + (materialContext.fiscalDistress.valueBps ?? 0)) / 10_000), 9_000, 'complete', `fiscal.counterfactual.${categories.join('+')}`, 'Immediate known-tax revenue delta on current simulated bases.'));
      const householdKinds = supportedKinds.some(kind => ['personal', 'consumption', 'payroll'].includes(kind));
      if (householdKinds) {
        const deltas = counterfactual.proposedDisposableByIncome.map((value, index) => value - counterfactual.currentDisposableByIncome[index]), relative = deltas.map((delta, index) => ratio(delta, Math.max(1, counterfactual.currentDisposableByIncome[index])) ?? 0), average = Math.round(sum(relative) / relative.length);
        if (average) expectedConsequences.push(consequence('income_security', signed(average * 2), 8_500, 'complete', 'fiscal.counterfactual.household_disposable', 'Immediate disposable-income incidence on current household groups.'));
        const distribution = signed((relative[0] - relative[2]) * 2); if (distribution) expectedConsequences.push(consequence('fiscal_distribution', distribution, 8_000, 'partial', 'fiscal.counterfactual.income_group_incidence', 'Relative low-versus-high income disposable effect; ownership incidence and long-run responses unavailable.'));
      }
      if (supportedKinds.includes('payroll')) unsupportedChanges.push({ path: 'policy.payroll.employment_response', coverage: 'partial', reason: 'Employer payroll-cost delta is measurable, but future employment response is not forecast.' });
      if (supportedKinds.includes('corporate')) unsupportedChanges.push({ path: 'policy.corporate.distributional_incidence', coverage: 'partial', reason: 'Corporate liability is measurable, but ownership and household incidence are unavailable.' });
    }
  }
  if (unsupportedChanges.length) limitations.push(...unsupportedChanges.map(item => `${item.path}: ${item.reason}`));
  limitations.push('Only immediate fiscal consequences available from 0.11 are evaluated; no GDP, growth, inflation or future unemployment forecast is invented.');
  const issueEffects = Object.fromEntries(GOVERNANCE_GOALS.map(goal => [goal, signed(sum(expectedConsequences.filter(item => item.goal === goal && item.coverage !== 'unavailable').map(item => item.directionBps)))])) as Record<GovernanceGoal, number>;
  const genuinelyNeutral = directPolicyChanges.length === 0 && unsupportedChanges.length === 0;
  const coverage: EvaluationCoverage = genuinelyNeutral ? 'complete' : !expectedConsequences.some(item => item.coverage !== 'unavailable') ? 'unavailable' : unsupportedChanges.length || expectedConsequences.some(item => item.coverage !== 'complete') ? 'partial' : 'complete';
  return { version: 'proposal-analysis-0.14-v2', directPolicyChanges, materialContext, expectedConsequences, issueEffects, coverage, unsupportedChanges, limitations, genuinelyNeutral };
}

function totalRevenueFor(state: SimulationState, countryId: string) { const country = state.fiscal.countries[countryId], account = country?.account; return account?.totalRevenue ?? (country ? country.revenueCalibration.monthlyAmount + sum(Object.values(state.fiscal.regions).filter(region => region.owner === countryId).flatMap(region => TAXES.map(category => region.taxes[category].collected))) : 0); }

const toleranceFor = (ideal: number, importance: number, confidence: number) => clamp(Math.max(1_200, Math.min(9_000, 8_000 - importance * 0.45 - Math.abs(ideal - 5_000) * 0.25 + (10_000 - confidence) * 0.15)));
export function derivePartyGoalProfile(party: PoliticalParty, overrides: Partial<Record<GovernanceGoal, Partial<PartyIssuePreference>>> = {}): PartyGoalProfile {
  const goals = {} as Record<GovernanceGoal, PartyIssuePreference>;
  for (const issue of POLITICAL_ISSUES) { const position = party.issuePositions[issue], status = position.confidenceBps < 1_000 || party.ideologicalBasis.status === 'modelled_fallback' ? 'modelled_fallback' : 'sourced_or_partial_prior'; const base: PartyIssuePreference = { idealPointBps: position.preferenceBps, importanceBps: position.intensityBps, compromiseToleranceBps: toleranceFor(position.preferenceBps, position.intensityBps, position.confidenceBps), confidenceBps: position.confidenceBps, status }; goals[issue] = { ...base, ...overrides[issue] }; }
  goals.fiscal_sustainability = { idealPointBps: 8_500, importanceBps: 2_500, compromiseToleranceBps: 7_000, confidenceBps: 1_000, status: 'modelled_common_constraint', ...overrides.fiscal_sustainability };
  return { partyId: party.id, goals };
}

const severityFor = (analysis: ProposalAnalysis, goal: GovernanceGoal) => { const metricValue = contextOutcome(analysis.materialContext, goal); return metricValue?.valueBps === undefined ? 0 : 10_000 - metricValue.valueBps; };
function evaluateProfile(analysis: ProposalAnalysis, profile: PartyGoalProfile): Omit<PartyProposalEvaluation, 'partyId' | 'vote'> {
  const issueEvaluations: PartyIssueEvaluation[] = [], positiveDrivers: string[] = [], negativeDrivers: string[] = [], tradeoffs: string[] = []; let weighted = 0, weights = 0, confidenceWeight = 0, compromiseWeighted = 0;
  for (const consequence of analysis.expectedConsequences) {
    const preference = profile.goals[consequence.goal], current = contextOutcome(analysis.materialContext, consequence.goal), currentOutcome = current?.valueBps;
    if (!preference || currentOutcome === undefined || consequence.coverage === 'unavailable') { issueEvaluations.push({ goal: consequence.goal, agreementBps: 5_000, benefitBps: 0, compromiseCostBps: 0, severityBps: 0, coverage: 'unavailable' }); continue; }
    const expectedOutcome = clamp(currentOutcome + consequence.directionBps), beforeDistance = Math.abs(currentOutcome - preference.idealPointBps), afterDistance = Math.abs(expectedOutcome - preference.idealPointBps), benefitBps = signed(beforeDistance - afterDistance), beforeExcess = Math.max(0, beforeDistance - preference.compromiseToleranceBps), afterExcess = Math.max(0, afterDistance - preference.compromiseToleranceBps);
    const helpfulSeverities = analysis.expectedConsequences.filter(other => other.goal !== consequence.goal && other.coverage !== 'unavailable').map(other => { const otherPreference = profile.goals[other.goal], otherCurrent = contextOutcome(analysis.materialContext, other.goal)?.valueBps; if (!otherPreference || otherCurrent === undefined) return 0; const otherExpected = clamp(otherCurrent + other.directionBps); return Math.abs(otherCurrent - otherPreference.idealPointBps) > Math.abs(otherExpected - otherPreference.idealPointBps) ? severityFor(analysis, other.goal) : 0; });
    const severityRelief = Math.min(7_000, Math.round(Math.max(0, ...helpfulSeverities) * 0.6)), compromiseCostBps = clamp(Math.max(0, afterExcess - beforeExcess) * (10_000 - severityRelief) / 10_000), issueAgreement = clamp(5_000 + benefitBps - compromiseCostBps);
    const consequenceConfidence = Math.min(preference.confidenceBps, consequence.confidenceBps), weight = Math.max(1, preference.importanceBps) * Math.max(1, consequence.magnitudeBps);
    weighted += (issueAgreement - 5_000) * weight; weights += weight; confidenceWeight += consequenceConfidence * weight; compromiseWeighted += compromiseCostBps * weight;
    const driver = `${consequence.goal}: ${consequence.explanation}`; if (benefitBps > 0) positiveDrivers.push(driver); else if (benefitBps < 0 || compromiseCostBps) negativeDrivers.push(driver);
    issueEvaluations.push({ goal: consequence.goal, currentOutcomeBps: currentOutcome, expectedOutcomeBps: expectedOutcome, agreementBps: issueAgreement, benefitBps, compromiseCostBps, severityBps: severityFor(analysis, consequence.goal), coverage: consequence.coverage });
  }
  if (positiveDrivers.length && negativeDrivers.length) tradeoffs.push(`Positive objectives (${positiveDrivers.length}) are weighed against adverse or compromise costs (${negativeDrivers.length}).`);
  const confidenceBps = weights ? clamp(confidenceWeight / weights) : 0, agreementBps = weights ? clamp(5_000 + weighted / weights) : 5_000, compromiseCostBps = weights ? clamp(compromiseWeighted / weights) : 0;
  const evaluable = issueEvaluations.filter(item => item.coverage !== 'unavailable').length, coverage: EvaluationCoverage = !evaluable ? 'unavailable' : analysis.coverage === 'complete' && evaluable === issueEvaluations.length ? 'complete' : 'partial';
  return { agreementBps, confidenceBps, coverage, compromiseCostBps, positiveDrivers, negativeDrivers, tradeoffs, issueEvaluations };
}

export function evaluatePartyProposal(state: SimulationState, proposal: PoliticalProposal, partyId: string, registry: PoliticalRegistry, profileOverride?: PartyGoalProfile, analysisOverride?: ProposalAnalysis): PartyProposalEvaluation {
  const party = registry.parties[partyId]; if (!party) return { partyId, agreementBps: 5_000, confidenceBps: 0, coverage: 'unavailable', compromiseCostBps: 0, vote: 'abstain', positiveDrivers: [], negativeDrivers: ['Unknown party.'], tradeoffs: [], issueEvaluations: [] };
  const result = evaluateProfile(analysisOverride ?? analyzeProposal(state, proposal), profileOverride ?? derivePartyGoalProfile(party));
  const vote = result.confidenceBps < GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps || result.coverage === 'unavailable' ? 'abstain' : result.agreementBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps ? 'yes' : result.agreementBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps ? 'no' : 'abstain';
  return { partyId, ...result, vote };
}

export function evaluateProfileForPublic(analysis: ProposalAnalysis, profile: PartyGoalProfile) { return evaluateProfile(analysis, profile); }
