import { dateValid, sum } from '../fiscal/math';
import { integer } from '../socioeconomy/model';
import { DEFENSE_COSTS, EQUIPMENT_REGISTRY, MILITARY_ITEMS, MILITARY_LIMITS, equipmentTotal, presentPersonnel, trainingPersonnel, type MilitaryCapability, type MilitarySource } from './model';
import { militaryDeliveryDate } from './dates';

export function validateMilitarySource(value: unknown): asserts value is MilitarySource {
  if (!value || typeof value !== 'object') throw new Error('Military source admission requires provenance.');
  const s = value as Record<string, unknown>;
  if (typeof s.status !== 'string' || !['sourced', 'derived', 'modelled'].includes(s.status)
    || !['publisher', 'url', 'licence', 'attribution', 'limitation'].every(k => typeof s[k] === 'string' && s[k].trim())
    || s.referenceDate !== '2026-01-01' || !dateValid(s.retrievedAt)
    || typeof s.scenarioFixture !== 'boolean' || s.scenarioFixture && s.status !== 'modelled') throw new Error('Military source admission requires explicit scenario-date applicability, provenance and licensing.');
}

export function validateCapability(c: MilitaryCapability, date: string, initializedOn: string) {
  const validDate = (d: string) => dateValid(d) && d >= initializedOn && d <= date;
  if (!c || !validDate(c.admittedOn) || c.lastPreparedOn && !validDate(c.lastPreparedOn)) throw new Error('Invalid military capability dates.');
  validateMilitarySource(c.source);
  const p = c.parameters;
  for (const k of ['monthlySalaryUsd', 'recruitmentPerMonth', 'reductionPerMonth', 'trainingMonths', 'instructors', 'trainingCostPerPersonUsd', 'technicians', 'factoryUnitsPerMonth', 'factoryMaterialPerUnit', 'logisticsStaff', 'logisticsPersonsPerStaff', 'exerciseAmmunitionPerPerson', 'exerciseFuelPerPerson'] as const) integer(p[k]);
  if (!p.monthlySalaryUsd || !p.trainingCostPerPersonUsd || !p.trainingMonths || p.trainingMonths > MILITARY_LIMITS.trainingMonths) throw new Error('Invalid military training/pay parameters.');
  if (p.instructors > 0 && !c.equipment.personal || p.exerciseAmmunitionPerPerson > 0 && !c.consumables.ammunition
    || p.exerciseFuelPerPerson > 0 && !c.consumables.fuel || p.logisticsStaff > 0 && p.logisticsPersonsPerStaff > 0 && !c.equipment.truck) throw new Error('Positive configured military mechanisms require admitted personal, consumable and transport stocks; missing is not zero.');
  for (const [name, requirements] of [['equipment', p.desiredEquipment], ['consumables', p.desiredConsumables]] as const) {
    for (const [key, value] of Object.entries(requirements)) {
      integer(value!);
      if (!MILITARY_ITEMS.includes(key as typeof MILITARY_ITEMS[number]) || EQUIPMENT_REGISTRY[key as typeof MILITARY_ITEMS[number]].consumable !== (name === 'consumables')
        || (name === 'equipment' ? !c.equipment[key as typeof MILITARY_ITEMS[number]] : !c.consumables[key as typeof MILITARY_ITEMS[number]])) throw new Error('Military requirement references unavailable/incompatible stock.');
    }
  }
  integer(c.authorized); integer(c.payrollArrears); integer(c.exercisePersonMonths); integer(c.nextOrderSequence); integer(c.unpaidMonths);
  if (c.unpaidMonths > 120) throw new Error('Invalid unpaid personnel duration.');
  Object.values(c.assignments).forEach(integer);
  if (!Array.isArray(c.trainees) || c.trainees.length > p.trainingMonths || new Set(c.trainees.map(t => t.monthsCompleted)).size !== c.trainees.length) throw new Error('Invalid training cohort shape.');
  for (const t of c.trainees) { integer(t.persons); integer(t.monthsCompleted); if (!t.persons || t.monthsCompleted >= p.trainingMonths) throw new Error('Invalid training cohort.'); }
  if (trainingPersonnel(c) > presentPersonnel(c) || c.exercisePersonMonths > presentPersonnel(c) - trainingPersonnel(c)) throw new Error('Military personnel/training conservation failed.');
  for (const [key, e] of Object.entries(c.equipment)) {
    if (!MILITARY_ITEMS.includes(key as typeof MILITARY_ITEMS[number]) || EQUIPMENT_REGISTRY[key as typeof MILITARY_ITEMS[number]].consumable) throw new Error('Unknown/non-equipment stock.');
    for (const field of ['opening', 'delivered', 'operational', 'unavailable', 'maintenance', 'reserve', 'maintenanceClock', 'backlogUnitMonths'] as const) integer(e![field]);
    if (equipmentTotal(e!) + (e!.destroyed ?? 0) !== integer(e!.opening + e!.delivered)) throw new Error('Equipment substate conservation failed.');
    if (e!.maintenanceClock >= EQUIPMENT_REGISTRY[key as typeof MILITARY_ITEMS[number]].maintenanceIntervalMonths) throw new Error('Invalid equipment maintenance clock.');
  }
  for (const [key, stock] of Object.entries(c.consumables)) {
    if (!MILITARY_ITEMS.includes(key as typeof MILITARY_ITEMS[number]) || !EQUIPMENT_REGISTRY[key as typeof MILITARY_ITEMS[number]].consumable) throw new Error('Unknown/non-consumable stock.');
    for (const field of ['opening', 'delivered', 'consumed', 'quantity', 'capacity'] as const) integer(stock![field]);
    if (stock!.opening + stock!.delivered - stock!.consumed !== stock!.quantity || stock!.quantity > stock!.capacity) throw new Error('Consumable stock conservation failed.');
  }
  Object.values(c.industrialMaterials).forEach(integer);
  if (c.industrialMaterials.opening - c.industrialMaterials.consumed !== c.industrialMaterials.quantity) throw new Error('Industrial material conservation failed.');
  if (!Array.isArray(c.orders) || c.orders.length > MILITARY_LIMITS.orders || new Set(c.orders.map(o => o.id)).size !== c.orders.length) throw new Error('Invalid outstanding orders.');
  for (const o of c.orders) {
    if (!/^order\.\d+$/.test(o.id) || Number(o.id.slice(6)) >= c.nextOrderSequence || !MILITARY_ITEMS.includes(o.item) || !validDate(o.orderedOn) || o.earliestDeliveryOn !== militaryDeliveryDate(o.orderedOn, EQUIPMENT_REGISTRY[o.item].productionMonths + 1)) throw new Error('Invalid military order identity/date.');
    [o.quantity, o.funded, o.delivered, o.unitCostUsd, o.paidUsd].forEach(integer);
    if (!o.quantity || o.funded > o.quantity || o.delivered > o.funded || o.unitCostUsd !== EQUIPMENT_REGISTRY[o.item].unitCostUsd || o.paidUsd !== integer(o.funded * o.unitCostUsd)) throw new Error('Military order funding/delivery conservation failed.');
    if (EQUIPMENT_REGISTRY[o.item].consumable ? !c.consumables[o.item] : !c.equipment[o.item]) throw new Error('Military order has unavailable destination.');
    integer(o.matured);
    if (!Array.isArray(o.pipeline) || o.pipeline.length > EQUIPMENT_REGISTRY[o.item].productionMonths + 1) throw new Error('Invalid production pipeline bound.');
    for (const batch of o.pipeline) {
      integer(batch.quantity);
      if (!batch.quantity || !validDate(batch.startedOn) || !batch.startedOn.endsWith('-01') || batch.startedOn < militaryDeliveryDate(o.orderedOn, 1)
        || batch.availableOn !== militaryDeliveryDate(batch.startedOn, EQUIPMENT_REGISTRY[o.item].productionMonths)) throw new Error('Invalid production batch date/quantity.');
    }
    if (new Set(o.pipeline.map(batch => batch.startedOn)).size !== o.pipeline.length) throw new Error('Duplicate military manufacturing boundary.');
    if (o.matured + sum(o.pipeline.map(batch => batch.quantity)) + o.delivered !== o.funded) throw new Error('Production pipeline conservation failed.');
    if (o.delivered ? !o.lastDeliveryOn || !validDate(o.lastDeliveryOn) || o.lastDeliveryOn < o.earliestDeliveryOn : o.lastDeliveryOn !== undefined) throw new Error('Invalid military delivery date.');
  }
  integer(c.completed.quantity); integer(c.completed.paidUsd);
  if (Object.keys(c.completedByItem).some(key => !MILITARY_ITEMS.some(item => item === key))) throw new Error('Unknown completed military item.');
  const manufactured = integer(c.completed.quantity + sum(c.orders.map(o => o.funded)));
  if (c.industrialMaterials.consumed !== integer(manufactured * p.factoryMaterialPerUnit)) throw new Error('Manufacturing has no conserved industrial resource consumption.');
  if (sum(Object.values(c.completedByItem).map(v => v!.quantity)) !== c.completed.quantity || sum(Object.values(c.completedByItem).map(v => v!.paidUsd)) !== c.completed.paidUsd) throw new Error('Completed order summaries do not reconcile.');
  for (const item of MILITARY_ITEMS) {
    const completed = c.completedByItem[item];
    if (completed) {
      integer(completed.quantity); integer(completed.paidUsd);
      if (completed.paidUsd !== integer(completed.quantity * EQUIPMENT_REGISTRY[item].unitCostUsd)) throw new Error('Completed order costs invalid.');
    }
    const delivered = sum(c.orders.filter(o => o.item === item).map(o => o.delivered)) + (completed?.quantity ?? 0);
    const stock = c.equipment[item] ?? c.consumables[item];
    if (stock && stock.delivered !== delivered) throw new Error('Stock deliveries have no conserved funded order.');
  }
  integer(c.productionSupplyPendingUsd); integer(c.productionSupplyReceivedUsd);
  integer(c.productionSupplyRemainderBps);
  if (c.productionSupplyRemainderBps >= 10000) throw new Error('Invalid fractional production resource accrual.');
  const remainingPaid = sum(c.orders.map(o => integer((o.funded - o.delivered) * o.unitCostUsd)));
  if (integer(c.productionSupplyPendingUsd + c.productionSupplyReceivedUsd) !== remainingPaid) throw new Error('Funded production resources do not reconcile with outstanding deliveries.');
  if (typeof c.ai.enabled !== 'boolean' || !c.ai.reason || c.ai.lastDecisionOn && !validDate(c.ai.lastDecisionOn)) throw new Error('Invalid military AI record.');
  if (c.lastLedger) {
    const l = c.lastLedger;
    if (!validDate(l.date)) throw new Error('Invalid military ledger date.');
    for (const k of DEFENSE_COSTS) { integer(l.requested[k]); integer(l.executed[k]); if (l.executed[k] > l.requested[k]) throw new Error('Military expenditure exceeds requested obligation.'); }
    for (const key of ['openingPayrollArrears', 'payrollDue', 'closingPayrollArrears', 'grossPayrollPaid', 'employerPayrollCost',
      'recruited', 'released', 'trained', 'exercised', 'consumedAmmunition', 'consumedFuel', 'productionUnits', 'maintenanceUnits', 'deliveredUnits'] as const) integer(l[key]);
    if (l.openingPayrollArrears + l.payrollDue - l.grossPayrollPaid !== l.closingPayrollArrears || l.closingPayrollArrears !== c.payrollArrears || l.grossPayrollPaid + l.employerPayrollCost !== l.executed.payroll) throw new Error('Military payroll arrears do not reconcile.');
    integer(sum(Object.values(l.executed)));
  }
}
