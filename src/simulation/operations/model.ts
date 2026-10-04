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
  provenance: string;
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
}

export const OPERATIONS_MODEL = Object.freeze({
  version: OPERATIONS_VERSION,
  schedulerPriority: 270,
  componentFallbackDecisive: 1,
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
});

export const operationsDeploymentId = (sequence: number) => `deployment.${sequence.toString().padStart(8, '0')}`;
export const operationsComponentId = (sequence: number) => `component.${sequence.toString().padStart(8, '0')}`;
export const validMilitaryItem = (item: unknown): item is MilitaryItem => typeof item === 'string' && (MILITARY_ITEMS as readonly string[]).includes(item);
