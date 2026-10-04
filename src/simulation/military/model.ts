import { allocate, integer, ratio } from '../socioeconomy/model';
import { sum } from '../fiscal/math';

export const MILITARY_VERSION = 'military-0.16-v1' as const;
export const MILITARY_LIMITS = Object.freeze({ orders: 128, trainingMonths: 120 });
const equipmentDefinitions = {
  personal: { family: 'individual', unitCostUsd: 1000, maintenanceCostUsd: 10, maintenanceIntervalMonths: 24, productionMonths: 1, consumable: false, logisticsPersons: 0 },
  truck: { family: 'vehicle', unitCostUsd: 50000, maintenanceCostUsd: 500, maintenanceIntervalMonths: 6, productionMonths: 2, consumable: false, logisticsPersons: 20 },
  armour: { family: 'armour', unitCostUsd: 1000000, maintenanceCostUsd: 10000, maintenanceIntervalMonths: 6, productionMonths: 6, consumable: false, logisticsPersons: 0 },
  artillery: { family: 'artillery', unitCostUsd: 500000, maintenanceCostUsd: 5000, maintenanceIntervalMonths: 6, productionMonths: 4, consumable: false, logisticsPersons: 0 },
  aircraft: { family: 'aircraft', unitCostUsd: 10000000, maintenanceCostUsd: 100000, maintenanceIntervalMonths: 3, productionMonths: 12, consumable: false, logisticsPersons: 0 },
  ship: { family: 'naval', unitCostUsd: 50000000, maintenanceCostUsd: 500000, maintenanceIntervalMonths: 12, productionMonths: 24, consumable: false, logisticsPersons: 0 },
  communications: { family: 'specialized', unitCostUsd: 10000, maintenanceCostUsd: 100, maintenanceIntervalMonths: 12, productionMonths: 2, consumable: false, logisticsPersons: 0 },
  ammunition: { family: 'consumable', unitCostUsd: 10, maintenanceCostUsd: 0, maintenanceIntervalMonths: 0, productionMonths: 1, consumable: true, logisticsPersons: 0 },
  fuel: { family: 'consumable', unitCostUsd: 1, maintenanceCostUsd: 0, maintenanceIntervalMonths: 0, productionMonths: 1, consumable: true, logisticsPersons: 0 },
} as const;
export const EQUIPMENT_REGISTRY = Object.freeze(Object.fromEntries(
  Object.entries(equipmentDefinitions).map(([id, definition]) => [id, Object.freeze(definition)]),
)) as Readonly<typeof equipmentDefinitions>;
export type MilitaryItem = keyof typeof EQUIPMENT_REGISTRY;
export const MILITARY_ITEMS: readonly MilitaryItem[] = Object.freeze(Object.keys(EQUIPMENT_REGISTRY).sort() as MilitaryItem[]);
export const DEFENSE_COSTS = Object.freeze(['payroll', 'maintenance', 'training', 'production'] as const);
export type DefenseCosts = Record<typeof DEFENSE_COSTS[number], number>;
export const zeroDefenseCosts = (): DefenseCosts => ({ payroll: 0, maintenance: 0, training: 0, production: 0 });
export interface MilitarySource {
  status: 'sourced' | 'derived' | 'modelled';
  publisher: string; url: string; referenceDate: string; retrievedAt: string;
  licence: string; attribution: string; limitation: string;
  scenarioFixture: boolean;
}
export interface EquipmentStock {
  opening: number; delivered: number; operational: number; unavailable: number; maintenance: number; reserve: number;
  maintenanceClock: number; backlogUnitMonths: number;
}
export interface ConsumableStock { opening: number; delivered: number; consumed: number; quantity: number; capacity: number }
export interface MilitaryParameters {
  monthlySalaryUsd: number; recruitmentPerMonth: number; reductionPerMonth: number;
  trainingMonths: number; instructors: number; trainingCostPerPersonUsd: number;
  technicians: number; factoryUnitsPerMonth: number; factoryMaterialPerUnit: number;
  logisticsStaff: number; logisticsPersonsPerStaff: number;
  exerciseAmmunitionPerPerson: number; exerciseFuelPerPerson: number;
  desiredEquipment: Partial<Record<MilitaryItem, number>>;
  desiredConsumables: Partial<Record<MilitaryItem, number>>;
}
export interface TrainingCohort { persons: number; monthsCompleted: number }
export interface MilitaryOrder {
  id: string; item: MilitaryItem; quantity: number; funded: number; delivered: number;
  orderedOn: string; earliestDeliveryOn: string; unitCostUsd: number; paidUsd: number;
  pipeline: { quantity: number; startedOn: string; availableOn: string }[];
  matured: number;
  lastDeliveryOn?: string;
}
export interface MilitaryLedger {
  date: string; requested: DefenseCosts; executed: DefenseCosts;
  openingPayrollArrears: number; payrollDue: number; closingPayrollArrears: number;
  grossPayrollPaid: number; employerPayrollCost: number;
  recruited: number; released: number; trained: number; exercised: number;
  consumedAmmunition: number; consumedFuel: number;
  productionUnits: number; maintenanceUnits: number; deliveredUnits: number;
}
export interface MilitaryCapability {
  source: MilitarySource; admittedOn: string; parameters: MilitaryParameters;
  authorized: number; assignments: Record<string, number>; trainees: TrainingCohort[];
  exercisePersonMonths: number; payrollArrears: number;
  unpaidMonths: number;
  equipment: Partial<Record<MilitaryItem, EquipmentStock>>;
  consumables: Partial<Record<MilitaryItem, ConsumableStock>>;
  industrialMaterials: { opening: number; consumed: number; quantity: number };
  orders: MilitaryOrder[]; nextOrderSequence: number; completed: { quantity: number; paidUsd: number };
  completedByItem: Partial<Record<MilitaryItem, { quantity: number; paidUsd: number }>>;
  productionSupplyPendingUsd: number; productionSupplyReceivedUsd: number;
  productionSupplyRemainderBps: number;
  lastLedger?: MilitaryLedger; lastPreparedOn?: string;
  pendingPersonnel?: { recruited: number; released: number; delivered: number };
  ai: { enabled: boolean; lastDecisionOn?: string; reason: string };
}
export interface MilitaryCountry {
  observationId?: string;
  status: 'unavailable' | 'available'; limitation: string; capability?: MilitaryCapability;
}
export interface MilitaryState {
  version: typeof MILITARY_VERSION; initializedOn?: string; lastMonthlyDate?: string;
  countries: Record<string, MilitaryCountry>;
}
export const emptyMilitary = (initializedOn?: string): MilitaryState => ({ version: MILITARY_VERSION, initializedOn, countries: {} });
export const presentPersonnel = (c: MilitaryCapability) => sum(Object.values(c.assignments));
export const trainingPersonnel = (c: MilitaryCapability) => sum(c.trainees.map(t => t.persons));
export const equipmentTotal = (e: EquipmentStock) => sum([e.operational, e.unavailable, e.maintenance, e.reserve]);
export function militarySupportStaff(c: MilitaryCapability, availablePersonnel = presentPersonnel(c) - trainingPersonnel(c)) {
  const requested = [c.parameters.instructors, c.parameters.technicians, c.parameters.logisticsStaff];
  const [instructors, technicians, logistics] = allocate(Math.min(integer(sum(requested)), integer(Math.max(0, availablePersonnel))), requested);
  return { instructors, technicians, logistics };
}
export function militaryReadiness(c: MilitaryCapability) {
  const present = presentPersonnel(c), available = present - trainingPersonnel(c);
  const proportion = (value: number, target: number) => !target || value >= target ? 10000 : ratio(value, 10000, target);
  const personnel = proportion(available, c.authorized);
  const equipment = Object.entries(c.parameters.desiredEquipment).filter(([, target]) => target !== undefined && target > 0).map(([key, target]) => proportion(c.equipment[key as MilitaryItem]?.operational ?? 0, target!));
  const stocks = Object.entries(c.parameters.desiredConsumables).filter(([, target]) => target !== undefined && target > 0).map(([key, target]) => proportion(c.consumables[key as MilitaryItem]?.quantity ?? 0, target!));
  const training = proportion(Math.min(available, c.exercisePersonMonths), available);
  const vehicles = sum(Object.entries(c.equipment).map(([key, e]) => integer(e!.operational * EQUIPMENT_REGISTRY[key as MilitaryItem].logisticsPersons)));
  const staff = militarySupportStaff(c).logistics;
  const logisticsCapacity = Math.min(vehicles, integer(staff * c.parameters.logisticsPersonsPerStaff));
  const logistics = proportion(logisticsCapacity, available);
  const components = { personnel, equipment: equipment.length ? Math.min(...equipment) : null, training,
    stocks: stocks.length ? Math.min(...stocks) : null, logistics };
  const known = Object.values(components).filter((v): v is number => v !== null);
  return { components, limitingBps: Math.min(...known), logisticsCapacity,
    limitation: 'Modelled limiting capacity ratios, not combat power. Unspecified equipment/stock requirements are not applicable to this configured scenario; no inference about an unknown real army.' };
}
