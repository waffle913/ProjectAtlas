import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { allocate, integer, ratio } from '../socioeconomy/model';
import { borrowingCapacity, sum } from '../fiscal/math';
import { CATEGORIES } from '../fiscal/model';
import { deterministicFingerprint } from '../fingerprint';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { affordableMilitaryGross, quoteMilitaryPayroll } from '../fiscal/militaryPayroll';
import { DEFENSE_COSTS, EQUIPMENT_REGISTRY, MILITARY_ITEMS, MILITARY_LIMITS, emptyMilitary, equipmentTotal, presentPersonnel, trainingPersonnel, zeroDefenseCosts,
  militarySupportStaff, type DefenseCosts, type MilitaryCapability, type MilitaryItem, type MilitaryParameters, type MilitarySource } from './model';
import { validateCapability } from './validation';
import militaryObservations from '../../data/military-observations.json';
import { militaryDeliveryDate } from './dates';
import { consumeTradeFactoryInput, tradeFactoryCapacity } from '../trade/runtime';
import { deployedEquipmentByCountry, deployedPersonnelByRegion } from '../operations/runtime';

export function initializeMilitary(state: SimulationState): SimulationState {
  if (state.military.initializedOn) return state;
  return { ...state, military: { ...emptyMilitary(state.date), countries: Object.fromEntries(Object.keys(state.engine.fidelityByCountry).sort().map(id => [id, {
    status: 'unavailable' as const, limitation: 'No complete operational military baseline is installed: authorized/available staff, salaries, equipment, consumables and industry remain unavailable. A partial historical source reference does not initialize a simulated army. Unknown is not zero.',
    observationId: militaryObservations.records.find(r => r.countryId === id)?.id,
  }])) } };
}
const reservationIndexes = new WeakMap<SimulationState['military'], ReadonlyMap<string, number>>();
export function reservationIndex(state: SimulationState): ReadonlyMap<string, number> {
  const cached = reservationIndexes.get(state.military); if (cached) return cached;
  const index = new Map<string, number>();
  for (const country of Object.values(state.military.countries)) for (const [region, persons] of Object.entries(country.capability?.assignments ?? {})) index.set(region, integer((index.get(region) ?? 0) + persons));
  reservationIndexes.set(state.military, index); return index;
}
export const reservedPersonnel = (state: SimulationState, regionId: string) => reservationIndex(state).get(regionId) ?? 0;
export function hasMilitaryManagementAuthority(state: SimulationState, countryId: string, personId: string): boolean {
  const person = state.governance.persons[personId];
  return state.governance.player.controlledPersonId === personId && hasGovernmentInformationAccess(state, personId, countryId)
    && (person?.office?.role === 'head_of_government' || person?.office?.role === 'head_of_state')
    && person.office.evidence?.authorityBasis !== 'institutional_authority_unresolved'
    && Boolean(person?.office?.authorityProfile.capabilities.includes('sponsor_budget_reform'));
}
function requireAuthority(state: SimulationState, countryId: string, personId: string) {
  if (!hasMilitaryManagementAuthority(state, countryId, personId)) throw new Error('Military management requires the controlled active person to hold government information and budget authority in this Country.');
}
function capability(state: SimulationState, countryId: string): MilitaryCapability {
  const c = state.military.countries[countryId]?.capability;
  if (!c) throw new Error('Military baseline unavailable; management cannot fabricate an army.');
  return structuredClone(c);
}
function replace(state: SimulationState, id: string, c: MilitaryCapability): SimulationState {
  validateCapability(c, state.date, state.military.initializedOn!);
  return { ...state, military: { ...state.military, countries: { ...state.military.countries, [id]: { ...state.military.countries[id], capability: c } } } };
}
export interface MilitaryAdmission {
  countryId: string; source: MilitarySource; parameters: MilitaryParameters;
  authorized: number; present: number; trainees: number;
  equipment: Partial<Record<MilitaryItem, { operational: number; unavailable: number; maintenance: number; reserve: number }>>;
  consumables: Partial<Record<MilitaryItem, { quantity: number; capacity: number }>>;
  industrialMaterials: number;
}
/** Scenario/source admission, never a gameplay command or automatic estimate. */
export function admitMilitaryBaseline(state: SimulationState, input: MilitaryAdmission): SimulationState {
  if (!state.military.initializedOn || !state.military.countries[input.countryId] || state.military.countries[input.countryId].capability) throw new Error('Military admission requires an initialized, unavailable registered Country.');
  integer(input.present); integer(input.trainees);
  if (input.trainees > input.present) throw new Error('Trainees exceed present personnel.');
  const ids = Object.keys(state.socioeconomy.regions).filter(id => state.regionOwnership[id] === input.countryId && state.socioeconomy.regions[id].economy).sort();
  const available = ids.map(id => state.socioeconomy.regions[id].economy!.labourForce - reservedPersonnel(state, id));
  if (input.present > sum(available)) throw new Error('Military personnel exceed existing usable regional labour/population.');
  const assignment = allocate(input.present, available);
  const c: MilitaryCapability = {
    source: structuredClone(input.source), admittedOn: state.date, parameters: structuredClone(input.parameters),
    authorized: input.authorized, assignments: Object.fromEntries(ids.map((id, i) => [id, assignment[i]])),
    trainees: input.trainees ? [{ persons: input.trainees, monthsCompleted: 0 }] : [],
    exercisePersonMonths: 0, payrollArrears: 0, unpaidMonths: 0,
    equipment: Object.fromEntries(Object.entries(input.equipment).map(([id, e]) => [id, { ...e, opening: sum(Object.values(e!)), delivered: 0, maintenanceClock: 0, backlogUnitMonths: 0 }])),
    consumables: Object.fromEntries(Object.entries(input.consumables).map(([id, s]) => [id, { ...s, opening: s!.quantity, delivered: 0, consumed: 0 }])),
    industrialMaterials: { opening: input.industrialMaterials, consumed: 0, quantity: input.industrialMaterials },
    orders: [], nextOrderSequence: 0, completed: { quantity: 0, paidUsd: 0 },
    completedByItem: {},
    productionSupplyPendingUsd: 0, productionSupplyReceivedUsd: 0, productionSupplyRemainderBps: 0,
    ai: { enabled: true, reason: 'Explicit configured peacetime capability maintenance only.' },
  };
  validateCapability(c, state.date, state.military.initializedOn);
  const admitted = { ...state, military: { ...state.military, countries: { ...state.military.countries, [input.countryId]: { status: 'available' as const, limitation: input.source.limitation, capability: c } } } };
  return reconcileWorkforce(admitted);
}
export function setMilitaryAuthorization(state: SimulationState, countryId: string, personId: string, authorized: number): SimulationState {
  requireAuthority(state, countryId, personId); integer(authorized);
  const c = capability(state, countryId); c.authorized = authorized;
  return replace(state, countryId, c);
}
export function placeMilitaryOrder(state: SimulationState, countryId: string, personId: string, item: MilitaryItem, quantity: number): SimulationState {
  requireAuthority(state, countryId, personId);
  const c = capability(state, countryId); addOrder(c, item, quantity, state.date);
  return replace(state, countryId, c);
}
function addOrder(c: MilitaryCapability, item: MilitaryItem, quantity: number, date: string) {
  if (!MILITARY_ITEMS.includes(item)) throw new Error('Unknown equipment/consumable registry item.');
  integer(quantity); if (!quantity) throw new Error('Order quantity must be positive.');
  if (c.orders.length >= MILITARY_LIMITS.orders) throw new Error('Outstanding order bound reached; obligations cannot be discarded.');
  const definition = EQUIPMENT_REGISTRY[item];
  if (definition.consumable ? !c.consumables[item] : !c.equipment[item]) throw new Error('Unavailable stock cannot be converted to a known zero through procurement.');
  integer(quantity * definition.unitCostUsd);
  c.orders.push({ id: `order.${c.nextOrderSequence++}`, item, quantity, funded: 0, delivered: 0,
    orderedOn: date, earliestDeliveryOn: militaryDeliveryDate(date, definition.productionMonths + 1), unitCostUsd: definition.unitCostUsd, paidUsd: 0, pipeline: [], matured: 0 });
}
function reconcileWorkforce(state: SimulationState): SimulationState {
  const regions = { ...state.socioeconomy.regions };
  for (const [id, r] of Object.entries(regions)) {
    if (!r.economy) continue;
    const reserved = reservedPersonnel(state, id), e = r.economy;
    if (reserved > e.labourForce) throw new Error('Military reservation exceeds regional labour force.');
    const employed = Math.min(e.employed, e.labourForce - reserved);
    if (employed !== e.employed || e.unemployed !== e.labourForce - employed - reserved) regions[id] = { ...r, economy: { ...e, employed, unemployed: e.labourForce - employed - reserved } };
  }
  return { ...state, socioeconomy: { ...state.socioeconomy, regions } };
}
function publicFulfillment(state: SimulationState, countryId: string): number {
  let requested = 0, realized = 0;
  for (const order of state.fiscal.countries[countryId]?.account?.defensePublicOrders ?? []) {
    const r = state.socioeconomy.regions[order.regionId];
    if (!r?.economy) throw new Error('Defense funded public order lost its economic recipient.');
    requested = integer(requested + order.amount);
    const other = r.economy.otherDemandResidual;
    realized = integer(realized + (other ? ratio(r.economy.otherDemandRealized, order.amount, other) : 0));
  }
  return requested ? Math.min(10000, ratio(realized, 10000, requested)) : 0;
}
function deliver(c: MilitaryCapability, date: string, fulfillmentBps: number): number {
  const work = BigInt(c.productionSupplyPendingUsd) * BigInt(fulfillmentBps) + BigInt(c.productionSupplyRemainderBps);
  const supplied = Math.min(c.productionSupplyPendingUsd, Number(work / 10000n));
  c.productionSupplyRemainderBps = c.productionSupplyPendingUsd === supplied ? 0 : Number(work % 10000n);
  c.productionSupplyPendingUsd -= supplied;
  c.productionSupplyReceivedUsd = integer(c.productionSupplyReceivedUsd + supplied);
  let delivered = 0;
  for (const order of c.orders) {
    const matured = order.pipeline.filter(batch => batch.availableOn <= date);
    order.matured = integer(order.matured + sum(matured.map(batch => batch.quantity)));
    order.pipeline = order.pipeline.filter(batch => batch.availableOn > date);
    let n = Math.min(order.matured, Math.floor(c.productionSupplyReceivedUsd / order.unitCostUsd));
    const definition = EQUIPMENT_REGISTRY[order.item];
    if (definition.consumable) {
      const stock = c.consumables[order.item]!;
      n = Math.min(n, stock.capacity - stock.quantity);
      stock.quantity += n; stock.delivered += n;
    } else {
      const stock = c.equipment[order.item]!;
      stock.operational += n; stock.delivered += n;
    }
    order.delivered += n; order.matured -= n;
    if (n) order.lastDeliveryOn = date;
    c.productionSupplyReceivedUsd -= n * order.unitCostUsd;
    delivered = integer(delivered + n);
  }
  const complete = c.orders.filter(o => o.delivered === o.quantity);
  for (const o of complete) {
    c.completed.quantity = integer(c.completed.quantity + o.quantity); c.completed.paidUsd = integer(c.completed.paidUsd + o.paidUsd);
    const prior = c.completedByItem[o.item] ?? { quantity: 0, paidUsd: 0 };
    c.completedByItem[o.item] = { quantity: integer(prior.quantity + o.quantity), paidUsd: integer(prior.paidUsd + o.paidUsd) };
  }
  c.orders = c.orders.filter(o => o.delivered !== o.quantity);
  return delivered;
}
function peacetimeAI(c: MilitaryCapability, state: SimulationState, countryId: string) {
  if (!c.ai.enabled || hasMilitaryManagementAuthority(state, countryId, state.governance.player.controlledPersonId ?? '')) return;
  const fiscal = state.fiscal.countries[countryId];
  c.ai.lastDecisionOn = state.date;
  if (!c.parameters.factoryUnitsPerMonth) {
    c.ai.reason = 'No configured manufacturing capacity: defer replacement commitments.'; return;
  }
  if (!fiscal || c.payrollArrears > 0 || !(fiscal.annualBudget.defense ?? 0)) {
    c.ai.reason = 'No defense authorization or salary arrears: defer replacement commitments.'; return;
  }
  const account = fiscal.account;
  const sameLaw = account && deterministicFingerprint(account.policyApplied) === deterministicFingerprint(fiscal.policy);
  const revenue = sameLaw ? account.financingRevenue ?? account.totalRevenue : fiscal.revenueCalibration.monthlyAmount;
  const resources = integer(fiscal.cash + revenue + borrowingCapacity(fiscal));
  const civilian = integer(sum(CATEGORIES.map(k => Math.ceil(fiscal.annualBudget[k] / 12) + fiscal.arrears[k])));
  const interest = integer(ratio(fiscal.debt, fiscal.interestRateBps, 120000) + fiscal.interestArrears);
  const requested = militaryRequests(state, countryId);
  const recurring = integer(requested.payroll + requested.maintenance + requested.training);
  const outstanding = integer(sum(c.orders.map(o => integer((o.quantity - o.funded) * o.unitCostUsd))));
  let margin = Math.min(Math.max(0, resources - civilian - interest - recurring - outstanding),
    Math.max(0, Math.floor(fiscal.annualBudget.defense! / 12) - recurring - outstanding));
  if (!margin) { c.ai.reason = 'No prospective financing/authorization margin after existing obligations: defer commitments.'; return; }
  c.ai.reason = 'Modelled prospective financing margin; commitments require later actual fiscal funding. No strategic war decisions.';
  for (const item of MILITARY_ITEMS) {
    const target = c.parameters.desiredEquipment[item] ?? c.parameters.desiredConsumables[item];
    if (target === undefined) continue;
    const held = c.equipment[item] ? equipmentTotal(c.equipment[item]!) : c.consumables[item]?.quantity;
    if (held === undefined) continue;
    const outstanding = sum(c.orders.filter(o => o.item === item).map(o => o.quantity - o.delivered));
    const deficit = Math.max(0, target - held - outstanding);
    const affordable = Math.floor(margin / EQUIPMENT_REGISTRY[item].unitCostUsd);
    if (deficit && affordable && c.orders.length < MILITARY_LIMITS.orders) {
      const quantity = Math.min(deficit, affordable, c.parameters.factoryUnitsPerMonth);
      addOrder(c, item, quantity, state.date);
      margin -= integer(quantity * EQUIPMENT_REGISTRY[item].unitCostUsd);
    }
  }
}
export function prepareMilitaryMonth(state: SimulationState): SimulationState {
  if (!state.military.initializedOn) return state;
  let next = state;
  for (const id of Object.keys(state.military.countries).sort()) {
    if (!state.military.countries[id].capability) continue;
    const c = capability(next, id); if (c.lastPreparedOn === state.date) continue;
    const fiscal = state.fiscal.countries[id], present = presentPersonnel(c), p = c.parameters;
    const ids = Object.keys(state.socioeconomy.regions).filter(r => state.regionOwnership[r] === id && state.socioeconomy.regions[r].economy).sort();
    const free = ids.map(r => state.socioeconomy.regions[r].economy!.labourForce - reservedPersonnel(next, r));
    const affordable = p.monthlySalaryUsd ? Math.floor((fiscal?.annualBudget.defense ?? 0) / 12 / p.monthlySalaryUsd) : c.authorized;
    const recruited = c.payrollArrears ? 0 : Math.min(Math.max(0, Math.min(c.authorized, affordable) - present), p.recruitmentPerMonth, sum(free));
    const retentionTarget = c.unpaidMonths >= 3 ? Math.min(c.authorized, Math.floor((c.lastLedger?.grossPayrollPaid ?? 0) / p.monthlySalaryUsd)) : c.authorized;
    let released = Math.min(Math.max(0, present - retentionTarget), p.reductionPerMonth);
    if (released) {
      const reservations = deployedPersonnelByRegion(state, id);
      const releasable = Object.fromEntries(Object.keys(c.assignments).sort().map(r => [r, Math.max(0, (c.assignments[r] ?? 0) - (reservations.get(r) ?? 0))]));
      const keys = Object.keys(releasable).sort(), counts = allocate(Math.min(released, sum(Object.values(releasable))), keys.map(r => releasable[r]));
      const actualReleased = sum(counts);
      released = actualReleased;
      keys.forEach((r, i) => c.assignments[r] -= counts[i]);
      let left = Math.min(actualReleased, trainingPersonnel(c));
      for (const t of c.trainees.sort((a, b) => a.monthsCompleted - b.monthsCompleted)) { const removed = Math.min(left, t.persons); t.persons -= removed; left -= removed; }
      c.trainees = c.trainees.filter(t => t.persons);
      c.exercisePersonMonths = Math.min(c.exercisePersonMonths, present - actualReleased - trainingPersonnel(c));
    }
    if (recruited) {
      const counts = allocate(recruited, free);
      ids.forEach((r, i) => c.assignments[r] = integer((c.assignments[r] ?? 0) + counts[i]));
      const initial = c.trainees.find(t => t.monthsCompleted === 0);
      if (initial) initial.persons += recruited; else c.trainees.push({ persons: recruited, monthsCompleted: 0 });
    }
    c.pendingPersonnel = { recruited, released, delivered: 0 };
    c.lastPreparedOn = state.date;
    next = replace(next, id, c);
    peacetimeAI(c, next, id);
    next = replace(next, id, c);
  }
  return next === state ? state : reconcileWorkforce(next);
}
export function militaryRequests(state: SimulationState, countryId: string): DefenseCosts {
  const c = state.military.countries[countryId]?.capability;
  if (!c) return zeroDefenseCosts();
  const p = c.parameters, requests = zeroDefenseCosts();
  const grossDue = integer(presentPersonnel(c) * p.monthlySalaryUsd + c.payrollArrears);
  requests.payroll = integer(grossDue + quoteMilitaryPayroll(state, countryId, grossDue).employerCost);
  const support = militarySupportStaff(c);
  let tech = support.technicians;
  for (const item of MILITARY_ITEMS) {
    const e = c.equipment[item]; if (!e) continue;
    const repair = Math.min(e.unavailable + e.maintenance, tech); tech -= repair;
    requests.maintenance = integer(requests.maintenance + repair * EQUIPMENT_REGISTRY[item].maintenanceCostUsd);
  }
  const students = Math.min(support.instructors, presentPersonnel(c));
  const supplies = Math.min(p.exerciseAmmunitionPerPerson ? Math.floor((c.consumables.ammunition?.quantity ?? 0) / p.exerciseAmmunitionPerPerson) : students,
    p.exerciseFuelPerPerson ? Math.floor((c.consumables.fuel?.quantity ?? 0) / p.exerciseFuelPerPerson) : students);
  const equipment = c.equipment.personal?.operational ?? 0;
  requests.training = integer(Math.min(students, supplies, equipment) * p.trainingCostPerPersonUsd);
  let capacity = Math.min(p.factoryUnitsPerMonth, p.factoryMaterialPerUnit ? Math.floor(c.industrialMaterials.quantity / p.factoryMaterialPerUnit) : p.factoryUnitsPerMonth,
    tradeFactoryCapacity(state, countryId) ?? p.factoryUnitsPerMonth);
  for (const o of c.orders) {
    const n = o.orderedOn >= state.date ? 0 : Math.min(o.quantity - o.funded, capacity); capacity -= n;
    requests.production = integer(requests.production + n * o.unitCostUsd);
  }
  return requests;
}
export interface MilitaryPayment { costs: DefenseCosts; state: SimulationState }
/** Called exactly once by the sole fiscal financing engine; never moves treasury itself. */
export function executeMilitaryFunding(state: SimulationState, countryId: string, allocatedUsd: number): MilitaryPayment {
  integer(allocatedUsd);
  if (!state.military.countries[countryId]?.capability) return { costs: zeroDefenseCosts(), state };
  const c = capability(state, countryId);
  if (c.lastLedger?.date === state.date) throw new Error('Military funding already executed on this boundary.');
  const p = c.parameters, requested = militaryRequests(state, countryId);
  const allocation = allocate(Math.min(allocatedUsd, sum(Object.values(requested))), DEFENSE_COSTS.map(k => requested[k]));
  const costs = zeroDefenseCosts();
  const openingPayrollArrears = c.payrollArrears, payrollDue = integer(presentPersonnel(c) * p.monthlySalaryUsd);
  const payroll = affordableMilitaryGross(state, countryId, allocation[0], integer(payrollDue + openingPayrollArrears));
  costs.payroll = integer(payroll.gross + payroll.employerCost);
  c.payrollArrears = payrollDue + openingPayrollArrears - payroll.gross;
  c.unpaidMonths = payroll.gross < payrollDue ? Math.min(120, c.unpaidMonths + 1) : 0;
  const deliveredUnits = deliver(c, state.date, publicFulfillment(state, countryId));
  const support = militarySupportStaff(c);
  let technicians = support.technicians, maintenanceUnits = 0;
  for (const item of MILITARY_ITEMS) {
    const e = c.equipment[item]; if (!e) continue;
    const d = EQUIPMENT_REGISTRY[item];
    const affordable = d.maintenanceCostUsd ? Math.floor((allocation[1] - costs.maintenance) / d.maintenanceCostUsd) : 0;
    const repaired = Math.min(e.unavailable + e.maintenance, technicians, affordable);
    const queued = e.unavailable + e.maintenance;
    if (queued) e.backlogUnitMonths -= Math.min(e.backlogUnitMonths, ratio(e.backlogUnitMonths, repaired, queued));
    const fromMaintenance = Math.min(e.maintenance, repaired);
    e.maintenance -= fromMaintenance; e.unavailable -= repaired - fromMaintenance; e.operational += repaired;
    costs.maintenance += repaired * d.maintenanceCostUsd; technicians -= repaired; maintenanceUnits += repaired;
    const unitMonths = BigInt(e.operational) + BigInt(e.maintenanceClock);
    const reservedEquipment = deployedEquipmentByCountry(state, countryId)[item] ?? 0;
    const due = Math.min(Math.max(0, e.operational - reservedEquipment), Number(unitMonths / BigInt(d.maintenanceIntervalMonths)));
    e.operational -= due; e.maintenance += due;
    e.maintenanceClock = Number(unitMonths % BigInt(d.maintenanceIntervalMonths));
    const expired = Math.min(e.maintenance, Math.max(0, e.maintenance - support.technicians));
    e.maintenance -= expired; e.unavailable += expired;
    e.backlogUnitMonths = integer(e.backlogUnitMonths + e.maintenance + e.unavailable);
  }
  let students = Math.min(support.instructors, presentPersonnel(c), c.equipment.personal?.operational ?? 0,
    Math.floor(allocation[2] / p.trainingCostPerPersonUsd),
    p.exerciseAmmunitionPerPerson ? Math.floor((c.consumables.ammunition?.quantity ?? 0) / p.exerciseAmmunitionPerPerson) : p.instructors,
    p.exerciseFuelPerPerson ? Math.floor((c.consumables.fuel?.quantity ?? 0) / p.exerciseFuelPerPerson) : p.instructors);
  const trainedThisMonth = students;
  let trained = 0;
  const cohorts = [];
  for (const t of [...c.trainees].sort((a, b) => b.monthsCompleted - a.monthsCompleted)) {
    const n = Math.min(students, t.persons); students -= n;
    if (t.persons > n) cohorts.push({ persons: t.persons - n, monthsCompleted: t.monthsCompleted });
    if (n && t.monthsCompleted + 1 < p.trainingMonths) cohorts.push({ persons: n, monthsCompleted: t.monthsCompleted + 1 });
    else trained += n;
  }
  const byMonth = new Map<number, number>();
  for (const t of cohorts) byMonth.set(t.monthsCompleted, (byMonth.get(t.monthsCompleted) ?? 0) + t.persons);
  c.trainees = [...byMonth].sort(([a], [b]) => a - b).map(([monthsCompleted, persons]) => ({ monthsCompleted, persons }));
  c.exercisePersonMonths = Math.min(presentPersonnel(c) - trainingPersonnel(c), integer(c.exercisePersonMonths + students));
  const consumedAmmunition = integer(trainedThisMonth * p.exerciseAmmunitionPerPerson), consumedFuel = integer(trainedThisMonth * p.exerciseFuelPerPerson);
  for (const [item, n] of [['ammunition', consumedAmmunition], ['fuel', consumedFuel]] as const) {
    const s = c.consumables[item];
    if (n && !s) throw new Error('Missing consumable for funded training.');
    if (s) { s.quantity -= n; s.consumed = integer(s.consumed + n); }
  }
  costs.training = integer(trainedThisMonth * p.trainingCostPerPersonUsd);
  let capacity = Math.min(p.factoryUnitsPerMonth, p.factoryMaterialPerUnit ? Math.floor(c.industrialMaterials.quantity / p.factoryMaterialPerUnit) : p.factoryUnitsPerMonth,
    tradeFactoryCapacity(state, countryId) ?? p.factoryUnitsPerMonth);
  let productionUnits = 0;
  for (const o of c.orders) {
    const n = o.orderedOn >= state.date ? 0 : Math.min(o.quantity - o.funded, capacity, Math.floor((allocation[3] - costs.production) / o.unitCostUsd));
    o.funded += n; o.paidUsd = integer(o.paidUsd + n * o.unitCostUsd);
    if (n) o.pipeline.push({ quantity: n, startedOn: state.date, availableOn: militaryDeliveryDate(state.date, EQUIPMENT_REGISTRY[o.item].productionMonths) });
    costs.production = integer(costs.production + n * o.unitCostUsd); capacity -= n; productionUnits += n;
  }
  const materials = integer(productionUnits * p.factoryMaterialPerUnit);
  c.industrialMaterials.quantity -= materials; c.industrialMaterials.consumed = integer(c.industrialMaterials.consumed + materials);
  c.productionSupplyPendingUsd = integer(c.productionSupplyPendingUsd + costs.production);
  c.lastLedger = { date: state.date, requested, executed: costs, openingPayrollArrears, payrollDue, closingPayrollArrears: c.payrollArrears,
    grossPayrollPaid: payroll.gross, employerPayrollCost: payroll.employerCost,
    recruited: c.pendingPersonnel?.recruited ?? 0, released: c.pendingPersonnel?.released ?? 0, trained, exercised: students,
    consumedAmmunition, consumedFuel, productionUnits, maintenanceUnits, deliveredUnits };
  delete c.pendingPersonnel;
  const next = consumeTradeFactoryInput(replace(state, countryId, c), countryId, productionUnits);
  return { costs, state: { ...next, military: { ...next.military, lastMonthlyDate: state.date } } };
}
export const registerMilitaryTasks = (scheduler: SimulationScheduler) => scheduler.register({
  id: 'military.prepare-monthly', cadence: 'monthly', priority: 90, run: prepareMilitaryMonth,
});
