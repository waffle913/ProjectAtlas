import { ratio } from '../socioeconomy/model';
import type { SimulationInvariant } from '../invariants';
import { CATEGORIES, TAXES } from './model';
import { dateValid, sum, validatePolicy } from './math';
import { validateBudget } from './runtime';
const quantity = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const fiscalInvariant: SimulationInvariant = {
  id: 'fiscal-conservation',
  check: (state, context) => {
    const f = state.fiscal, errors: string[] = [];
    if (!f || f.version !== 'fiscal-0.11-v2' || !f.countries || !f.regions || !Array.isArray(f.reforms) || !Array.isArray(f.reformReceipts)) return ['Malformed fiscal state.'];
    const fail = (id: string, message: string) => errors.push(`${id}: ${message}`);
    if (!f.initializedOn) return Object.keys(f.countries).length || Object.keys(f.regions).length || f.reforms.length ? ['Fiscal state lacks initialization date.'] : [];
    if (!dateValid(f.initializedOn) || f.initializedOn > state.date || f.lastMonthlyDate && (!dateValid(f.lastMonthlyDate) || f.lastMonthlyDate > state.date)) errors.push('Invalid fiscal dates.');
    if (!quantity(f.nextSequence)) errors.push('Invalid fiscal sequence.');
    for (const [id, region] of Object.entries(state.socioeconomy.regions)) {
      if (region.economy && state.regionOwnership[id] !== undefined && !Object.hasOwn(f.regions, id)) fail(id, 'Missing active economic Region fiscal ledger.');
    }
    for (const id of context.countryIds) if (!f.countries[id]) fail(id, 'Missing national fiscal state.');
    const regionalTotals = new Map<string, { transfers: number; militaryPay: number; taxes: Record<string, number[]> }>();
    for (const [id, r] of Object.entries(f.regions)) {
      if (!context.regionIds.has(id) || !state.socioeconomy.regions[id]?.economy || !context.countryIds.has(r.owner)) fail(id, 'Unknown/non-economic Region or ledger owner.');
      for (const key of ['grossIncome', 'personal', 'employee', 'transfers', 'disposable', 'netConsumption', 'consumptionTax', 'grossExpenditure'] as const) if (!Array.isArray(r[key]) || r[key].length !== 3 || !r[key].every(quantity)) fail(id, `Invalid household ${key}.`);
      for (let i = 0; i < 3; i++) {
        if (r.grossIncome[i] - r.personal[i] - r.employee[i] + r.transfers[i] + (r.militaryPay?.[i] ?? 0) !== r.disposable[i]) fail(id, 'Disposable income does not reconcile.');
        if (r.netConsumption[i] + r.consumptionTax[i] !== r.grossExpenditure[i]) fail(id, 'Consumption wedge does not reconcile.');
      }
      if (![r.privateResidual, r.publicOrders, r.businessSurplus, r.retainedBusinessSurplus, r.labourCost].every(quantity)) fail(id, 'Invalid region fiscal quantity.');
      if (r.businessSurplus - r.taxes.corporate.collected !== r.retainedBusinessSurplus) fail(id, 'Retained business surplus does not reconcile.');
      if (sum(r.personal) !== r.taxes.personal.collected || sum(r.employee) !== r.taxes.employee.collected
        || sum(r.consumptionTax) + sum(r.tradePurchases?.importConsumptionTax ?? []) !== r.taxes.consumption.collected) fail(id, 'Household taxes do not reconcile.');
      if (r.tradePurchases) {
        const p = r.tradePurchases;
        if (p.date !== f.lastMonthlyDate || [p.importedGoods, p.landedPayment, p.importConsumptionTax, p.nominalBudget]
          .some(list => !Array.isArray(list) || list.length !== 3 || !list.every(quantity))
          || p.importedGoods.some((v, i) => v > p.landedPayment[i]
            || r.grossExpenditure[i] + p.landedPayment[i] + p.importConsumptionTax[i] > p.nominalBudget[i])) fail(id, 'Import purchases exceeded the existing household expenditure budget.');
      }
      if (r.militaryPay && (r.militaryPay.length !== 3 || !r.militaryPay.every(quantity))) fail(id, 'Invalid military payroll receipts.');
      const t = regionalTotals.get(r.owner) ?? { transfers: 0, militaryPay: 0, taxes: Object.fromEntries(TAXES.map(k => [k, [0, 0, 0]])) };
      t.transfers += sum(r.transfers);
      t.militaryPay += sum(r.militaryPay ?? []);
      for (const k of TAXES) {
        const tax = r.taxes[k];
        if (![tax.base, tax.liability, tax.collected].every(quantity) || tax.collected > tax.liability || tax.status === 'unavailable' && (tax.liability || tax.collected)) fail(id, 'Invalid tax liability/collection.');
        [tax.base, tax.liability, tax.collected].forEach((v, i) => t.taxes[k][i] += v);
      }
      regionalTotals.set(r.owner, t);
    }
    for (const [id, c] of Object.entries(f.countries)) {
      if (!context.countryIds.has(id)) fail(id, 'Unknown fiscal Country.');
      try { validatePolicy(c.policy, id, state.date); validateBudget(c.annualBudget); validateBudget(c.arrears); } catch (e) { fail(id, String(e)); }
      if (![c.cash, c.debt, c.interestRateBps, c.debtLimit, c.monthlyBorrowingLimit, c.interestArrears].every(quantity) || c.interestRateBps > 10000) fail(id, 'Invalid fiscal stock/rate.');
      if (c.initialization?.status !== 'modelled' || !dateValid(c.initialization.date) || c.initialization.date > state.date) fail(id, 'Invalid fiscal initialization provenance.');
      for (const provenance of [c.revenueCalibration, c.debtInitialization]) {
        if (!provenance || !['sourced', 'modelled'].includes(provenance.status) || !dateValid(provenance.referenceDate) || provenance.referenceDate > state.date || !provenance.dataset || !provenance.method || !provenance.limitation || provenance.status === 'sourced' && !provenance.source) fail(id, 'Invalid fiscal calibration provenance.');
      }
      if (!quantity(c.revenueCalibration?.monthlyAmount) || !quantity(c.debtInitialization?.amount)) fail(id, 'Invalid fiscal calibration amount.');
      for (const s of Object.values(c.services)) if (!Object.entries(s).filter(([k]) => k !== 'status' && k !== 'coverageBps').every(([, v]) => quantity(v)) || s.coverageBps !== null && (!quantity(s.coverageBps) || s.coverageBps > 10000) || !['modelled', 'unavailable'].includes(s.status)) fail(id, 'Invalid service capacity/backlog.');
      for (const h of c.policyHistory) { try { validatePolicy(h.policy, id, h.date); if (!dateValid(h.date) || h.date > state.date) fail(id, 'Invalid policy history date.'); } catch (e) { fail(id, String(e)); } }
      const a = c.account; if (!a) continue;
      try { validatePolicy(a.policyApplied, id, a.date); } catch (e) { fail(id, String(e)); }
      if (!quantity(a.collectionEfficiencyBps) || a.collectionEfficiencyBps > 10000) fail(id, 'Invalid collection efficiency.');
      if (a.interestDue !== ratio(a.openingDebt, c.interestRateBps, 120000)) fail(id, 'Interest does not match debt stock and rate.');
      if (a.financingRevenue !== undefined && a.financingRevenue !== a.totalRevenue - (a.militaryPayroll?.withheldRevenue ?? 0)) fail(id, 'Military withholding used as circular self-financing.');
      if (a.financingNeed !== Math.max(0, sum(CATEGORIES.map(k => a.appropriated[k] + a.openingArrears[k])) + (a.defense?.obligation ?? 0) + a.interestDue + a.openingInterestArrears - (a.financingRevenue ?? a.totalRevenue) - a.openingCash)) fail(id, 'Financing need does not reconcile.');
      if (a.unit !== 'USD_NOMINAL' || a.period !== 'MONTH') fail(id, 'Invalid accounting units.');
      if (!dateValid(a.date) || a.date !== f.lastMonthlyDate) fail(id, 'Account date does not match fiscal boundary.');
      if (![a.knownTaxRevenue, a.otherRevenue, a.totalRevenue, a.interestDue, a.interestPaid, a.totalSpending, a.openingCash, a.closingCash, a.openingDebt, a.closingDebt, a.financingNeed, a.borrowed, a.repaid, a.interestArrears, a.openingInterestArrears, a.transferPaid].every(quantity)) fail(id, 'Invalid fiscal flow.');
      try { validateBudget(a.appropriated); validateBudget(a.executed); validateBudget(a.arrears); validateBudget(a.openingArrears); } catch (e) { fail(id, String(e)); }
      if (a.knownTaxRevenue !== sum(TAXES.map(k => a.taxes[k].collected)) + (a.customsRevenue?.collected ?? 0) || a.otherRevenue !== c.revenueCalibration.monthlyAmount || a.totalRevenue !== a.knownTaxRevenue + a.otherRevenue) fail(id, 'Revenue does not reconcile.');
      if (a.customsRevenue && (!quantity(a.customsRevenue.collected) || !quantity(a.customsRevenue.unavailableRates)
        || a.customsRevenue.date !== a.date || a.customsRevenue.scope !== 'admitted_flows_only'
        || a.customsRevenue.collected !== sum(state.trade.flows.filter(flow => flow.importerId === id).map(flow => flow.customsUsd))
        || a.customsRevenue.unavailableRates !== state.trade.routes.filter(route => route.importerId === id && route.tariffBps === null).length)) fail(id, 'Customs receipts have no exactly-once admitted trade flows.');
      if (a.stress.financingBaselineStatus !== c.revenueCalibration.status) fail(id, 'Fiscal stress lost financing-baseline provenance.');
      if (a.totalSpending !== sum(Object.values(a.executed)) + (a.defense?.executed ?? 0) + a.interestPaid || a.primaryBalance !== a.totalRevenue - sum(Object.values(a.executed)) - (a.defense?.executed ?? 0) || a.overallBalance !== a.totalRevenue - a.totalSpending) fail(id, 'Spending/balances do not reconcile.');
      if (a.closingCash !== a.openingCash + a.totalRevenue + a.borrowed - a.totalSpending - a.repaid || a.closingCash !== c.cash) fail(id, 'Treasury identity violated.');
      if (a.closingDebt !== a.openingDebt + a.borrowed - a.repaid || a.closingDebt !== c.debt) fail(id, 'Debt stock/flow identity violated.');
      if (a.openingInterestArrears + a.interestDue - a.interestPaid !== a.interestArrears || a.interestArrears !== c.interestArrears) fail(id, 'Interest arrears do not reconcile.');
      for (const k of CATEGORIES) if (a.openingArrears[k] + a.appropriated[k] - a.executed[k] !== a.arrears[k] || a.arrears[k] !== c.arrears[k]) fail(id, 'Unpaid commitments do not reconcile.');
      const t = regionalTotals.get(id);
      if (a.defense) {
        if (!Object.values(a.defense).every(quantity) || a.defense.obligation !== Math.min(a.defense.requested, a.defense.authorized) || a.defense.executed > a.defense.obligation || a.defense.payroll + a.defense.procurement !== a.defense.executed
          || a.defense.payroll !== (a.militaryPayroll?.gross ?? 0) + (a.militaryPayroll?.employerCost ?? 0)) fail(id, 'Military fiscal spending/payroll does not reconcile.');
      }
      if (a.militaryPayroll) {
        const p = a.militaryPayroll;
        if (![p.gross, p.employerCost, p.withheldRevenue].every(quantity) || p.gross !== sum(p.slips.flatMap(s => s.gross))
          || p.employerCost !== p.taxes.employer.collected || p.withheldRevenue !== sum(TAXES.map(k => p.taxes[k].collected))) fail(id, 'Military tax payroll does not reconcile.');
        for (const s of p.slips) if (!context.regionIds.has(s.regionId) || [s.gross, s.personal, s.employee, s.employer].some(list => list.length !== 3 || !list.every(quantity))
          || s.gross.some((v, i) => s.personal[i] + s.employee[i] > v)) fail(id, 'Invalid military wage recipient/deductions.');
        if (new Set(p.slips.map(s => s.regionId)).size !== p.slips.length || p.slips.some(s => !Object.hasOwn(state.military.countries[id]?.capability?.assignments ?? {}, s.regionId))) fail(id, 'Military payslips have duplicated/unbacked recipient Regions.');
        for (const k of TAXES) {
          const tax = p.taxes[k], policyKind = k === 'employee' || k === 'employer' ? 'payroll' : k;
          if (![tax.base, tax.liability, tax.collected].every(quantity) || tax.collected > tax.liability
            || tax.status !== (a.policyApplied[policyKind]?.status ?? 'unavailable')
            || tax.status === 'unavailable' && (tax.liability || tax.collected)
            || (k === 'consumption' || k === 'corporate') && (tax.base || tax.liability || tax.collected)) fail(id, 'Military tax evidence does not match the applied legal policy/base.');
        }
        if (sum(p.slips.flatMap(s => s.personal)) !== p.taxes.personal.collected || sum(p.slips.flatMap(s => s.employee)) !== p.taxes.employee.collected || sum(p.slips.flatMap(s => s.employer)) !== p.taxes.employer.collected) fail(id, 'Military withholding does not match payslips.');
      }
      if (a.defensePublicOrders && (new Set(a.defensePublicOrders.map(o => o.regionId)).size !== a.defensePublicOrders.length || a.defensePublicOrders.some(o => !context.regionIds.has(o.regionId) || !f.regions[o.regionId] || !quantity(o.amount)))) fail(id, 'Invalid defense public-demand recipient/proof.');
      if (a.defense && a.stress.unpaidCommitments !== sum(CATEGORIES.map(k => a.arrears[k])) + a.interestArrears + (state.military.countries[id]?.capability?.payrollArrears ?? 0)) fail(id, 'Fiscal stress omits unpaid military salary obligations.');
      if (a.transferPaid !== a.executed.pensions + a.executed.incomeSupport || a.transferPaid !== (t?.transfers ?? 0)) fail(id, 'Transfers lost or created.');
      for (const k of TAXES) {
        const tax = a.taxes[k];
        if (![tax.base, tax.liability, tax.collected].every(quantity) || tax.collected > tax.liability) fail(id, 'Invalid national tax.');
        [tax.base, tax.liability, tax.collected].forEach((v, i) => { const militaryTax = a.militaryPayroll?.taxes[k]; const extra = militaryTax ? [militaryTax.base, militaryTax.liability, militaryTax.collected][i] : 0; if (v !== (t?.taxes[k][i] ?? 0) + extra) fail(id, 'National/regional tax ledger mismatch.'); });
      }
    }
    const expectedMilitaryReceipts = new Map<string, number[]>();
    const defenseDemand = new Map<string, number>();
    for (const c of Object.values(f.countries)) for (const order of c.account?.defensePublicOrders ?? []) defenseDemand.set(order.regionId, (defenseDemand.get(order.regionId) ?? 0) + order.amount);
    for (const [id, demand] of defenseDemand) if (demand > f.regions[id]?.publicOrders) fail(id, 'Funded defense public demand is absent from the sole economic order ledger.');
    for (const c of Object.values(f.countries)) for (const slip of c.account?.militaryPayroll?.slips ?? []) {
      const previous = expectedMilitaryReceipts.get(slip.regionId) ?? [0, 0, 0];
      expectedMilitaryReceipts.set(slip.regionId, previous.map((v, i) => v + slip.gross[i] - slip.personal[i] - slip.employee[i]));
    }
    for (const [id, ledger] of Object.entries(f.regions)) if ((ledger.militaryPay ?? [0, 0, 0]).some((v, i) => v !== (expectedMilitaryReceipts.get(id)?.[i] ?? 0))) fail(id, 'Net military household receipts lack matching funded payslips.');
    const seen = new Set<number>();
    for (const r of f.reforms) {
      if (!context.countryIds.has(r.countryId) || !dateValid(r.effectiveDate) || r.effectiveDate <= state.date || !quantity(r.sequence) || r.sequence >= f.nextSequence || seen.has(r.sequence)) errors.push('Invalid reform queue.');
      seen.add(r.sequence);
      try { if (r.policy) validatePolicy(r.policy, r.countryId, r.effectiveDate); if (r.annualBudget) validateBudget(r.annualBudget); } catch (e) { errors.push(String(e)); }
    }
    for (const receipt of f.reformReceipts) {
      if (!context.countryIds.has(receipt.countryId) || !dateValid(receipt.effectiveDate) || receipt.effectiveDate > state.date || !quantity(receipt.sequence) || receipt.sequence >= f.nextSequence || seen.has(receipt.sequence) || typeof receipt.reformFingerprint !== 'string' || receipt.reformFingerprint.length !== 16 || !['runtime', 'schema12_upgrade'].includes(receipt.recordedBy)) errors.push('Invalid fiscal reform receipt.');
      if (receipt.origin && (receipt.origin.type !== 'governance_proposal' || !receipt.origin.proposalId || typeof receipt.origin.proposalFingerprint !== 'string' || receipt.origin.proposalFingerprint.length !== 16)) errors.push('Invalid fiscal reform origin.');
      seen.add(receipt.sequence);
    }
    return errors;
  },
};
