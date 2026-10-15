import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import { emptyAssets } from '../assets/model';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyMilitary } from '../military/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyPolitics } from '../politics/model';
import { emptyCrisis } from '../crisis/model';
import {
  FINANCE_VERSION, FINANCE_MONETARY_UNIT,
  MONEY_SURFACES, REQUIRED_SURFACES,
  MONEY_SURFACE_KINDS, MONEY_MEASURES, MONEY_SCOPES, MONEY_SUBSYSTEMS,
  FINANCE_DECISIONS, DECISION_STATUSES, isFxInScope, isBankMoneyInScope,
} from '../finance/contract';

const emptyState = (): SimulationState => ({
  schemaVersion: 20,
  operations: emptyOperations(),
  international: emptyInternational(),
  multilateral: emptyMultilateral(),
  constitution: emptyConstitution(),
  elections: emptyElections(),
  assets: emptyAssets(),
  trade: emptyTrade(),
  military: emptyMilitary(),
  governance: emptyGovernance(),
  information: emptyInformation(),
  politics: emptyPolitics(),
  crisis: emptyCrisis(),
  fiscal: emptyFiscal(),
  socioeconomy: emptySocioeconomy(),
  date: '2026-01-01',
  paused: false,
  speed: 1,
  territoryOwnership: {},
  regionOwnership: {},
  populationByRegion: {},
  economicOutputByRegion: {},
  bilateralRelations: {},
  claims: [],
  explicitCasusBelli: [],
  wars: [],
  occupationByRegion: {},
  engine: createEngineState(),
});

describe('finance monetary contract (0.26.1)', () => {
  it('reuses the single canonical monetary unit (integer nominal USD, no second currency)', () => {
    expect(FINANCE_VERSION).toBe('finance-0.26-v1');
    expect(FINANCE_MONETARY_UNIT.id).toBe('USD_NOMINAL');
    expect(FINANCE_MONETARY_UNIT.microUsdPerUsd).toBe(1_000_000);
    expect(FINANCE_MONETARY_UNIT.bpsPerWhole).toBe(10_000);
  });

  it('covers every required monetary surface exactly once', () => {
    const variables = MONEY_SURFACES.map((e) => e.variable);
    expect(new Set(variables).size).toBe(variables.length);
    expect(variables.slice().sort()).toEqual([...REQUIRED_SURFACES].sort());
  });

  it('assigns a unique canonical owner path to each surface (no second money ledger)', () => {
    const paths = MONEY_SURFACES.map((e) => e.ownerPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('uses only the known kind/measure/scope/subsystem vocabularies and existing owners', () => {
    for (const entry of MONEY_SURFACES) {
      expect(MONEY_SURFACE_KINDS).toContain(entry.kind);
      expect(MONEY_MEASURES).toContain(entry.measure);
      expect(MONEY_SCOPES).toContain(entry.scope);
      expect(MONEY_SUBSYSTEMS).toContain(entry.ownerSubsystem);
      expect(entry.ownerPath.startsWith('state.')).toBe(true);
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it('keeps every monetary surface on the single USD unit (USD / microUSD / bps)', () => {
    const allowedUnits = ['USD_NOMINAL', 'USD_PER_MONTH', 'USD', 'microUSD_PER_UNIT', 'basis_points'];
    for (const entry of MONEY_SURFACES) {
      expect(allowedUnits).toContain(entry.unit);
    }
  });

  it('reads each canonical field without throwing on an empty, uninitialized state', () => {
    const state = emptyState();
    for (const entry of MONEY_SURFACES) {
      expect(() => entry.read(state, 'country-a')).not.toThrow();
    }
  });

  it('keeps the open design gates undecided (never silently activates FX/bank money)', () => {
    expect(FINANCE_DECISIONS.map((d) => d.id).sort()).toEqual(
      ['bank_deposits_balance', 'bank_money_creation', 'national_currency_fx'].sort(),
    );
    for (const gate of FINANCE_DECISIONS) {
      expect(DECISION_STATUSES).toContain(gate.status);
      expect(gate.status).toBe('undecided');
      expect(gate.question.length).toBeGreaterThan(0);
      expect(gate.dependsOnSubMilestones.length).toBeGreaterThan(0);
    }
    expect(isFxInScope()).toBe(false);
    expect(isBankMoneyInScope()).toBe(false);
  });
});
