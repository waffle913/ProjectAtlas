import { MILITARY_ITEMS, type MilitaryItem } from '../military/model';

export const OPERATIONS_VERSION = 'operations-0.19-v1' as const;
export type ComponentCoverage = 'sourced' | 'derived' | 'modelled' | 'unavailable';
export type ComponentKind = 'decisive' | 'secondary';
export type RegionControl = 'sovereign_controlled' | 'contested' | 'foreign_controlled';
export type DeploymentStatus = 'deploying' | 'deployed' | 'moving' | 'withdrawing' | 'withdrawn';

export interface StrategicComponent {
  id: string;
  regionId: string;
  kind: ComponentKind;
  coverage: ComponentCoverage;
  controllingCountryId?: string;
  contested: boolean;
  captureProgress?: number;
  provenance: string;
}

export interface Engagement {
  id: string;
  warId: string;
  regionId: string;
  componentId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  startDate: string;
  status: 'active' | 'resolved';
  attackerLosses: { personnel: number; equipment: Partial<Record<MilitaryItem, number>> };
  defenderLosses: { personnel: number; equipment: Partial<Record<MilitaryItem, number>> };
  consumed: { ammunition: number; fuel: number };
}

export interface DeploymentLosses {
  personnel: number;
  equipment: Partial<Record<MilitaryItem, number>>;
}

export interface Deployment {
  id: string;
  countryId: string;
  warId?: string;
  sourceRegionId: string;
  currentRegionId: string;
  personnel: number;
  equipment: Partial<Record<MilitaryItem, number>>;
  supply: { ammunition: number; fuel: number };
  status: DeploymentStatus;
  losses: DeploymentLosses;
  allocated: { personnel: number; equipment: Partial<Record<MilitaryItem, number>> };
  order?: { targetRegionId: string; effectiveOn: string; kind: 'move' };
  withdrawalEffectiveOn?: string;
  provenance: 'modelled' | 'synthetic';
  limitation: string;
}

export interface OperationsState {
  version: typeof OPERATIONS_VERSION;
  initializedOn?: string;
  deployments: Record<string, Deployment>;
  deploymentOrder: string[];
  nextDeploymentSequence: number;
  components: Record<string, StrategicComponent>;
  componentOrder: string[];
  nextComponentSequence: number;
  regionControl: Record<string, RegionControl>;
  adjacency: Record<string, string[]>;
  engagements: Record<string, Engagement>;
  engagementOrder: string[];
  nextEngagementSequence: number;
}

export const OPERATIONS_MODEL = Object.freeze({
  version: OPERATIONS_VERSION,
  schedulerPriority: 270,
  componentFallbackDecisive: 1,
  captureThresholdBps: 5000,  // challenger progress (bps) required to flip a decisive component's controller
  captureStepBps: 2500,       // progress gained per decisive combat win
  defendStepBps: 2500,        // challenger progress repelled per decisive win by the current controller
});

/** Finite logistics throughput: distant resupply is convoy-limited by trucks, crews, hops and fuel; local (same-Region) resupply is stock-bounded only. */
export const SUPPLY_MODEL = Object.freeze({
  loadPerTruck: 20,       // cargo units (ammunition or fuel) carried per truck per supply action
  crewPerTruck: 2,        // personnel required to operate one truck
  fuelPerTruckPerHop: 1,  // fuel consumed per truck per traversed hop per supply action
});

export const emptyOperations = (initializedOn?: string): OperationsState => ({
  version: OPERATIONS_VERSION,
  initializedOn,
  deployments: {},
  deploymentOrder: [],
  nextDeploymentSequence: 0,
  components: {},
  componentOrder: [],
  nextComponentSequence: 0,
  regionControl: {},
  adjacency: {},
  engagements: {},
  engagementOrder: [],
  nextEngagementSequence: 0,
});

export const operationsDeploymentId = (sequence: number) => `deployment.${sequence.toString().padStart(8, '0')}`;
export const operationsComponentId = (sequence: number) => `component.${sequence.toString().padStart(8, '0')}`;
export const operationsEngagementId = (sequence: number) => `engagement.${sequence.toString().padStart(8, '0')}`;
export const validMilitaryItem = (item: unknown): item is MilitaryItem => typeof item === 'string' && (MILITARY_ITEMS as readonly string[]).includes(item);
