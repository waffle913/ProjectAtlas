import { emptyFiscal } from './fiscal/model';
import { emptyCrisis, initializeCrisisState } from './crisis/model';
import { initializeFiscal, upgradeFiscalStateV1 } from './fiscal/runtime';
import { emptySocioeconomy } from './socioeconomy/model';
import { emptyPolitics } from './politics/model';
import { initializePolitics, rebasePoliticsRegistry } from './politics/initialization';
import { politicalRegistry } from './politics/registry';
import { initializeSocioeconomy } from './socioeconomy/initialization';
import { emptyGovernance } from './governance/model';
import { governanceFingerprint } from './governance/model';
import { upgradeGovernanceSchema12, upgradeGovernanceProposalModel } from './governance/migration';
import { initializePartyLeaders, syncPartyMembershipRecords } from './governance/runtime';
import { emptyInformation, INFORMATION_VERSION } from './information/model';
import { initializeInformationState } from './information/runtime';
import { upgradeInformationState } from './information/migration';
import { emptyMilitary, MILITARY_VERSION } from './military/model';
import { initializeMilitary } from './military/runtime';
import { upgradeMilitaryReportReadiness } from './military/reports';
import { emptyTrade, TRADE_VERSION } from './trade/model';
import { initializeTrade } from './trade/runtime';
import { emptyInternational } from './international/model';
import { initializeInternational } from './international/runtime';
import { emptyOperations } from './operations/model';
import { initializeOperations } from './operations/runtime';
import { emptyMultilateral, MULTILATERAL_VERSION } from './multilateral/model';
import { initializeMultilateral } from './multilateral/runtime';
import { initializeConstitution, emptyConstitution } from './constitution/model';
import { initializeElections, emptyElections } from './elections/model';
import { emptyAssets, ASSETS_VERSION } from './assets/model';
import { institutionalStakesFingerprint } from './governance/institutionalInterest';

/** Idempotent intra-schema-19 backfill for saves written before pendingAmendments, per-chamber
 *  elections, cabinets, organization banEvents, episode-identity emergencies and the renamed
 *  `rightsChanges` amendment field were introduced. Present canonical fields are never rewritten;
 *  the legacy singular `rightChanges` spelling is renamed away, never kept alongside it. */
function backfillSchema19(state: SimulationState): SimulationState {
  let next = state;
  const rightsKeys = ['expression', 'press', 'assembly', 'association', 'religion', 'equalityBeforeLaw', 'antiDiscrimination', 'privateProperty', 'privacy', 'fairTrial', 'protectionFromArbitraryArrest', 'strike', 'union', 'vote', 'health', 'education', 'socialProtection'] as const;
  const constitutionCountries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  let constitutionChanged = false;
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    let updated = { ...entry };
    let changed = false;
    if (entry.bindingEvents === undefined) { updated.bindingEvents = []; changed = true; }
    if (entry.revisionEvents === undefined) { updated.revisionEvents = []; changed = true; }
    if (entry.courtMembers === undefined) { updated.courtMembers = []; changed = true; }
    if (entry.territory?.devolvedPowers === undefined) { updated.territory = { ...entry.territory, devolvedPowers: [] }; changed = true; }
    if (entry.rights === undefined || rightsKeys.some(key => entry.rights[key] === undefined)) {
      updated.rights = { ...entry.rights, ...Object.fromEntries(rightsKeys.filter(key => entry.rights?.[key] === undefined).map(key => [key, 'unavailable' as const])) };
      changed = true;
    }
    const legacyEmergency = entry.emergency as unknown as { justificationCrisisIds?: string[]; justificationEpisodeIds?: string[] };
    if (legacyEmergency.justificationEpisodeIds === undefined && Array.isArray(legacyEmergency.justificationCrisisIds)) {
      // A type-only historical emergency can never be silently attached to the CURRENT episode of
      // the same type (that episode may be a new one). The historical episode identity cannot be
      // determined, so the uncertainty is preserved: no episode is claimed as the justification and
      // the emergency is dated unjustified from the migration date.
      updated.emergency = { ...entry.emergency, justificationEpisodeIds: [], unjustifiedSince: entry.emergency.status === 'none' ? undefined : state.date };
      changed = true;
    }
    if (!Array.isArray((entry.emergency as { ministerialRecommendations?: unknown }).ministerialRecommendations)) {
      updated.emergency = { ...updated.emergency, ministerialRecommendations: [] };
      changed = true;
    }
    if (changed) { constitutionCountries[countryId] = updated; constitutionChanged = true; }
    else constitutionCountries[countryId] = entry;
  }
  const pendingAmendments = (state.constitution.pendingAmendments ?? []).map(amendment => {
    let updated = { ...amendment };
    let changed = false;
    const legacyPayload = updated.payload as unknown as { rightChanges?: unknown; rightsChanges?: unknown } & NonNullable<(typeof updated)['payload']>;
    if (legacyPayload.rightChanges !== undefined) {
      // The legacy singular field is renamed, not copied: the migrated payload is canonical and
      // never carries both spellings, even when a save written by the faulty copy migration holds
      // both. The fingerprint is recomputed over the payload actually migrated.
      const { rightChanges: _legacyRename, ...rest } = legacyPayload;
      const renamedPayload = { ...rest, ...(legacyPayload.rightsChanges === undefined ? { rightsChanges: legacyPayload.rightChanges } : {}) } as typeof updated.payload;
      updated = { ...updated, payload: renamedPayload, payloadFingerprint: governanceFingerprint({ effectiveDate: updated.applyOn, payload: renamedPayload }) };
      changed = true;
    }
    // All downstream payload reads (appliedPrior→appliedInverse, fingerprint) use the migrated payload.
    const payload = updated.payload as unknown as typeof legacyPayload;
    if (updated.status === undefined) {
      const legacyDecision = updated.decision as unknown as { timing?: unknown; outcome?: string; effect?: string; on?: string } | undefined;
      if (legacyDecision && 'timing' in legacyDecision) {
        // Old verdict shape { timing, effect, outcome } → translate to the new verdict shape.
        if (legacyDecision.outcome === 'annulled') {
          updated = { ...updated, status: 'annulled', decision: { outcome: 'annulled', effect: (legacyDecision.effect ?? 'unavailable') as typeof updated.decision extends { effect: infer E } ? E : never, on: legacyDecision.on ?? state.date, grounds: ['Recorded under the pre-traceability decision model; the institutional grounds were not persisted.'] } };
        } else if (legacyDecision.outcome === 'promulgated') {
          const { decision: _decision, ...rest } = updated as unknown as { decision?: unknown };
          updated = { ...rest, status: 'promulgated' } as typeof updated;
        } else {
          const { decision: _decision, ...rest } = updated as unknown as { decision?: unknown };
          updated = { ...rest, status: 'blocked', blockReason: 'not_enacted' } as typeof updated;
        }
      } else {
        updated = { ...updated, status: 'scheduled' };
      }
      changed = true;
    }
    // The pending is strictly bound to its canonical instrument through the payload fingerprint.
    if (typeof updated.payloadFingerprint !== 'string' || !updated.payloadFingerprint.trim()) {
      updated = { ...updated, payloadFingerprint: governanceFingerprint({ effectiveDate: updated.applyOn, payload: updated.payload }) };
      changed = true;
    }
    // Legacy decisions were recorded without traceable grounds; the backfill states that honestly
    // instead of fabricating a retroactive reasoning.
    if (updated.decision && (!Array.isArray((updated.decision as { grounds?: unknown }).grounds) || ((updated.decision as { grounds?: unknown[] }).grounds?.length ?? 0) === 0)) {
      updated = { ...updated, decision: { ...updated.decision, grounds: ['Recorded under the pre-traceability decision model; the institutional grounds were not persisted.'] } };
      changed = true;
    }
    // Legacy full pre-application snapshots are converted to the limited inverse: only the fields
    // this amendment's payload actually changed. A later annulment then restores exactly those,
    // never a whole-constitution snapshot that could erase a later amendment.
    const legacyPrior = (updated as unknown as { appliedPrior?: Record<string, unknown>; appliedInverse?: unknown }).appliedPrior;
    if (legacyPrior !== undefined && (updated as unknown as { appliedInverse?: unknown }).appliedInverse === undefined) {
      const pick = <T extends object>(source: unknown, changed: unknown): Partial<T> => {
        const sourceRecord = (source ?? {}) as Record<string, unknown>;
        const changedRecord = (changed ?? {}) as Record<string, unknown>;
        return Object.fromEntries(Object.keys(changedRecord).filter(key => key in sourceRecord).map(key => [key, sourceRecord[key]])) as Partial<T>;
      };
      const inverse: Record<string, unknown> = {};
      if (payload.rightsChanges && Object.keys(payload.rightsChanges).length) inverse.rights = pick(legacyPrior.rights, payload.rightsChanges);
      if (payload.parliamentChanges && Object.keys(payload.parliamentChanges).length) inverse.parliament = pick(legacyPrior.parliament, payload.parliamentChanges);
      if (payload.executiveChanges?.headOfState && Object.keys(payload.executiveChanges.headOfState).length) inverse.headOfState = pick(legacyPrior.headOfState, payload.executiveChanges.headOfState);
      if (payload.executiveChanges?.government && Object.keys(payload.executiveChanges.government).length) inverse.government = pick(legacyPrior.government, payload.executiveChanges.government);
      if (payload.electionChanges && Object.keys(payload.electionChanges).length) inverse.election = pick(legacyPrior.election, payload.electionChanges);
      if (payload.judicialChanges && Object.keys(payload.judicialChanges).length) inverse.judicialReview = pick(legacyPrior.judicialReview, payload.judicialChanges);
      if (payload.territoryChanges) inverse.territory = pick(legacyPrior.territory, payload.territoryChanges);
      if (payload.amendmentChanges && Object.keys(payload.amendmentChanges).length) inverse.amendment = pick(legacyPrior.amendment, payload.amendmentChanges);
      const { appliedPrior: _legacyPrior, ...withoutLegacyPrior } = updated as unknown as { appliedPrior?: unknown } & typeof updated;
      updated = { ...withoutLegacyPrior, appliedInverse: inverse };
      changed = true;
    }
    return changed ? updated : amendment;
  });
  // Conservative orphan handling: a pending whose canonical instrument does not exist (no proposal
  // with the matching Country, effective date and payload) is removed from the executable flow.
  // A migration never fabricates a historical proposal for it, and a PendingAmendment without its
  // canonical instrument could never act — keeping it would only violate the canonical-binding
  // invariant. Payloads are compared after the rightChanges→rightsChanges rename so a legacy-shaped
  // proposal is not mistaken for a mismatch.
  const canonicalPayload = (payloadValue: unknown): Record<string, unknown> => {
    const record = (payloadValue ?? {}) as Record<string, unknown> & { rightChanges?: unknown; rightsChanges?: unknown };
    if (record.rightChanges !== undefined) {
      const { rightChanges: _legacyRename, ...rest } = record;
      return record.rightsChanges === undefined ? { ...rest, rightsChanges: record.rightChanges } : rest;
    }
    return record;
  };
  const survivingAmendments = pendingAmendments.filter(amendment => {
    const proposal = state.governance.proposals[amendment.instrumentId];
    if (!proposal || proposal.kind !== 'constitutional_amendment' || proposal.countryId !== amendment.countryId || proposal.effectiveDate !== amendment.applyOn) return false;
    return JSON.stringify(canonicalPayload(proposal.payload)) === JSON.stringify(canonicalPayload(amendment.payload));
  });
  if (constitutionChanged || state.constitution.pendingAmendments === undefined || survivingAmendments.some((amendment, index) => amendment !== state.constitution.pendingAmendments![index])) {
    next = { ...next, constitution: { ...next.constitution, pendingAmendments: survivingAmendments, countries: constitutionChanged ? constitutionCountries : next.constitution.countries } };
  }
  const electionsCountries: Record<string, SimulationState['elections']['countries'][string]> = {};
  let electionsChanged = false;
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    let updated = entry;
    if (updated.headOfStateElections === undefined) { updated = { ...updated, headOfStateElections: [] }; electionsChanged = true; }
    const legacy = updated as unknown as { chambers?: unknown; seatsByParty?: Record<string, number>; totalSeats?: number; independentOtherSeats?: number; lastElectionDate?: string; nextElectionDate?: string };
    if (legacy.chambers === undefined && legacy.seatsByParty) {
      const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
      const chamberId = institution?.chambers[0]?.id ?? `chamber.${countryId}`;
      const legacyAllocated = Object.values(legacy.seatsByParty).reduce((a, b) => a + b, 0);
      const legacyTotal = legacy.totalSeats ?? 0;
      updated = { countryId, chambers: { [chamberId]: { chamberId, seatsByParty: legacy.seatsByParty, totalSeats: legacyTotal, independentOtherSeats: legacy.independentOtherSeats ?? 0, unallocatedSeats: Math.max(0, legacyTotal - legacyAllocated - (legacy.independentOtherSeats ?? 0)), lastElectionDate: legacy.lastElectionDate, nextElectionDate: legacy.nextElectionDate } }, government: updated.government, parties: updated.parties, headOfStateElections: updated.headOfStateElections ?? [] };
      electionsChanged = true;
    } else {
      for (const [chamberId, chamber] of Object.entries(updated.chambers ?? {})) {
        // Honest reconciliation: seats the legacy election silently lost — or a chamber whose
        // unavailable initial allocation was once saved as zeros — become explicit unknown
        // (totalSeats - party seats - independents), never an invented zero. Idempotent: a chamber
        // that already reconciles exactly is never rewritten.
        const allocated = Object.values(chamber.seatsByParty ?? {}).reduce((a: number, b: number) => a + b, 0);
        const remainder = Math.max(0, (chamber.totalSeats ?? 0) - allocated - (chamber.independentOtherSeats ?? 0));
        if (chamber.unallocatedSeats === undefined || allocated + (chamber.independentOtherSeats ?? 0) + chamber.unallocatedSeats !== (chamber.totalSeats ?? 0)) {
          updated = { ...updated, chambers: { ...updated.chambers, [chamberId]: { ...chamber, unallocatedSeats: remainder } } };
          electionsChanged = true;
        }
      }
    }
    electionsCountries[countryId] = updated;
  }
  if (electionsChanged) next = { ...next, elections: { ...next.elections, countries: electionsCountries } };
  const organizations: Record<string, SimulationState['politics']['organizations'][string]> = {};
  let orgChanged = false;
  for (const [organizationId, organization] of Object.entries(state.politics.organizations)) {
    const needsBackfill = organization.banEvents === undefined || organization.status === undefined || organization.members === undefined || organization.internalCurrents === undefined
      || organization.fundingEvents === undefined || organization.claims === undefined || organization.dissolutionEvents === undefined || organization.activeStrikes === undefined;
    if (needsBackfill) {
      const backfilled = { ...organization, status: organization.status ?? 'active', members: organization.members ?? {}, fundsUsd: organization.fundsUsd, internalCurrents: organization.internalCurrents ?? {}, banEvents: organization.banEvents ?? [], claims: organization.claims ?? [], dissolutionEvents: organization.dissolutionEvents ?? [], activeStrikes: organization.activeStrikes ?? [] };
      // Progressively introduced canonical fields are completed from the sourced registry — never
      // invented: a registry organization gains its sourced country/type/name; strikeFundUsd and
      // cyberSecurityBps stay unknown (the ledger alone reconciles; unknown is never a zero).
      const registryOrganization = politicalRegistry.organizations[organizationId];
      if (registryOrganization) {
        if (backfilled.countryId === undefined) backfilled.countryId = registryOrganization.countryId;
        if (backfilled.type === undefined) backfilled.type = registryOrganization.type;
        if (backfilled.displayName === undefined) backfilled.displayName = registryOrganization.displayName;
        if (backfilled.source === undefined) backfilled.source = 'registry';
      }
      // A tracked treasury written before the funding ledger gets a migration-date seed event, so
      // the ledger replays exactly the saved funds without inventing prior funding history.
      backfilled.fundingEvents = organization.fundingEvents ?? (organization.fundsUsd !== undefined ? [{ on: state.date, amountUsd: organization.fundsUsd, kind: 'seed' as const, source: 'schema19_backfill' }] : []);
      // Legacy ban/dissolution events gain their recorded rights basis (honest provenance: the
      // basis used at the time was not persisted).
      backfilled.banEvents = backfilled.banEvents.map(event => event.legalBasis ? event : { ...event, legalBasis: { basis: 'unavailable' as const, limitation: 'Recorded before the constitutional rights-basis model; the basis used at the time was not persisted.' } });
      backfilled.dissolutionEvents = backfilled.dissolutionEvents.map(event => event.legalBasis ? event : { ...event, legalBasis: { basis: 'unavailable' as const, limitation: 'Recorded before the constitutional rights-basis model; the basis used at the time was not persisted.' } });
      organizations[organizationId] = backfilled;
      orgChanged = true;
    } else organizations[organizationId] = organization;
  }
  if (orgChanged) next = { ...next, politics: { ...next.politics, organizations } };
  // Religious support is a real system family with unavailable coverage when no sourced religious
  // organization exists — the field is backfilled honestly, never with fabricated organizations.
  if (state.politics.religiousOrganizationsCoverage === undefined) {
    next = { ...next, politics: { ...next.politics, religiousOrganizationsCoverage: { status: 'unavailable', limitation: 'No sourced religious organization exists in the 0.13 political registry; religious support is not fabricated.' } } };
  }
  // The canonical party membership is one reality: PoliticalPersonState.partyId/leadership and the
  // party organization's members are reconciled so they never tell two different memberships.
  {
    let membershipChanged = false;
    let synced = next;
    for (const [organizationId, organization] of Object.entries(next.politics.organizations)) {
      if (organization.type !== 'party') continue;
      const before = JSON.stringify(organization.members ?? {});
      synced = syncPartyMembershipRecords(synced, organizationId);
      const after = JSON.stringify(synced.politics.organizations[organizationId]?.members ?? {});
      if (before !== after) membershipChanged = true;
    }
    if (membershipChanged) next = synced;
  }
  // Cabinets and their trace/coordination fields: a newly-introduced 0.23 system is initialized
  //  empty on the migration date, never replayed. Idempotent: present fields are never rewritten.
  {
    const cabinets: Record<string, SimulationState['governance']['cabinets'][string]> = {};
    let cabinetsChanged = false;
    let persons = next.governance.persons;
    let personsChanged = false;
    for (const [countryId, cabinet] of Object.entries(state.governance.cabinets ?? {})) {
      if (cabinet.portfolios === undefined || cabinet.censureEvents === undefined) {
        cabinets[countryId] = { ...cabinet, portfolios: cabinet.portfolios ?? {}, censureEvents: cabinet.censureEvents ?? [] };
        cabinetsChanged = true;
      } else cabinets[countryId] = cabinet;
      // A recorded temporary succession whose office title predates the acting label is repaired to
      // mark the temporary exercise — the arrangement was recorded, only the label was missing.
      const actingPersonId = cabinet.actingHead?.personId;
      if (actingPersonId && persons[actingPersonId]?.office?.role === 'head_of_government' && !persons[actingPersonId].office!.title.includes('acting')) {
        persons = { ...persons, [actingPersonId]: { ...persons[actingPersonId], office: { ...persons[actingPersonId].office!, title: 'Head of Government (acting)' } } };
        personsChanged = true;
      }
    }
    if (state.governance.cabinets === undefined || cabinetsChanged) {
      next = { ...next, governance: { ...next.governance, cabinets: cabinetsChanged ? cabinets : (state.governance.cabinets ?? {}) } };
    }
    if (personsChanged) next = { ...next, governance: { ...next.governance, persons } };
  }
  // The ministerial suggestion system and its global toggle: initialized empty/default on the
  // migration date; a minister never gains the legislative initiative from the backfill.
  if (state.governance.settings === undefined || state.governance.ministerialSuggestions === undefined || state.governance.nextSuggestionSequence === undefined) {
    next = {
      ...next,
      governance: {
        ...next.governance,
        settings: state.governance.settings ?? { spontaneousMinisterialProposalsEnabled: true },
        ministerialSuggestions: state.governance.ministerialSuggestions ?? [],
        nextSuggestionSequence: state.governance.nextSuggestionSequence ?? 0,
      },
    };
  }
  // Legacy singular `rightChanges` field on governance proposal payloads, and versioned proof
  // stamping for institutional-interest evaluations written before the stakes snapshot existed.
  // Stamping derives from the recorded fields only, so a legacy evaluation becomes intrinsically
  // validatable (and stays valid after a later election) without inventing evidence.
  const proposals: Record<string, SimulationState['governance']['proposals'][string]> = {};
  let proposalsChanged = false;
  for (const [id, original] of Object.entries(state.governance.proposals)) {
    let current = original;
    if (current.kind === 'constitutional_amendment') {
      const legacyPayload = current.payload as unknown as { rightChanges?: unknown; rightsChanges?: unknown };
      if (legacyPayload.rightChanges !== undefined) {
        // The legacy singular field is renamed, not copied: the migrated payload never carries
        // both spellings, even for saves written by the faulty copy migration. An existing
        // submitted fingerprint is recomputed over the canonical cleaned payload.
        const { rightChanges: _legacyRename, ...rest } = legacyPayload;
        const renamed = { ...rest, ...(legacyPayload.rightsChanges === undefined ? { rightsChanges: legacyPayload.rightChanges } : {}) } as typeof current.payload;
        current = { ...current, payload: renamed, ...(current.submittedPayloadFingerprint ? { submittedPayloadFingerprint: governanceFingerprint({ effectiveDate: current.effectiveDate, payload: renamed }) } : {}) } as typeof current;
        proposalsChanged = true;
        // No early exit: a proposal that needed the field rename may ALSO need the institutional
        // stamping below — both migrations apply.
      }
    }
    // Legacy referendum records (support/oppose only) gain abstention, coverage and an honest
    // limitation: participation is unknown and is never invented.
    if (current.referendumResult) {
      const recorded = current.referendumResult as Partial<typeof current.referendumResult> & { heldOn: string; adopted: boolean; supportBps: number; opposeBps: number };
      if (recorded.abstainBps === undefined || recorded.coverage === undefined || typeof recorded.limitation !== 'string' || !recorded.limitation.trim()) {
        current = {
          ...current,
          referendumResult: {
            heldOn: recorded.heldOn,
            adopted: recorded.adopted,
            supportBps: recorded.supportBps,
            opposeBps: recorded.opposeBps,
            abstainBps: recorded.abstainBps ?? Math.max(0, Math.min(10_000, 10_000 - recorded.supportBps - recorded.opposeBps)),
            participationBps: recorded.participationBps,
            coverage: recorded.coverage ?? 'partial',
            limitation: typeof recorded.limitation === 'string' && recorded.limitation.trim() ? recorded.limitation : 'Recorded before the participation/abstention referendum model; participation is unknown.',
          },
        } as typeof current;
        proposalsChanged = true;
      }
    }
    const stampEvaluation = (estimate: typeof current.parliamentaryEstimate | typeof current.voteResult): void => {
      if (!estimate || !Array.isArray(estimate.chambers)) return;
      for (const chamber of estimate.chambers) {
        if (!Array.isArray(chamber.partyEvaluations)) continue;
        for (const evaluation of chamber.partyEvaluations) {
          const interest = evaluation.institutionalInterest as unknown as { stakesFingerprint?: string; method?: string; status?: string; coverage?: string; confidenceBps?: number; adjustmentBps?: number; governmentStatus?: string; effects?: unknown[] } | undefined;
          if (!interest || interest.stakesFingerprint !== undefined) continue;
          if (interest.method === undefined || interest.status === undefined || interest.coverage === undefined || interest.confidenceBps === undefined || interest.adjustmentBps === undefined || interest.governmentStatus === undefined || !Array.isArray(interest.effects)) continue;
          interest.stakesFingerprint = institutionalStakesFingerprint({
            method: interest.method as 'situational_institutional_interest_v1', countryId: current.countryId, partyId: evaluation.partyId,
            status: interest.status as 'not_applicable' | 'modelled' | 'unavailable', coverage: interest.coverage as 'unavailable' | 'partial' | 'complete',
            confidenceBps: interest.confidenceBps, adjustmentBps: interest.adjustmentBps,
            governmentStatus: interest.governmentStatus as 'government' | 'opposition' | 'unavailable',
            effects: interest.effects as Parameters<typeof institutionalStakesFingerprint>[0]['effects'],
          });
          proposalsChanged = true;
        }
      }
    };
    stampEvaluation(current.parliamentaryEstimate);
    stampEvaluation(current.voteResult);
    proposals[id] = current;
  }
  if (proposalsChanged) next = { ...next, governance: { ...next.governance, proposals } };
  return next;
}
import type { RegionEntity, SimulationState } from '../types';
import type { DiplomacyContext } from './diplomacy';
import { assertSimulationInvariants, type InvariantContext } from './invariants';
import { cloneSimulationState, createEngineState } from './state';

export interface LegacySimulationStateV1 { schemaVersion?: 1; date: string; paused: boolean; speed: 1 | 2 | 5; territoryOwnership: Record<string, string | undefined> }
type DiplomacyFields = 'bilateralRelations' | 'claims' | 'explicitCasusBelli';
type WarFields = 'wars' | 'occupationByRegion';
type EngineFields = 'engine' | 'socioeconomy' | 'fiscal' | 'crisis' | 'politics' | 'governance' | 'information' | 'military' | 'trade';
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 2 }
export interface SimulationStateV3 extends Omit<SimulationState, 'schemaVersion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 3 }
export interface SimulationStateV4 extends Omit<SimulationState, 'schemaVersion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 4 }
export interface SimulationStateV5 extends Omit<SimulationState, 'schemaVersion' | WarFields | EngineFields> { schemaVersion: 5 }
export interface SimulationStateV6 extends Omit<SimulationState, 'schemaVersion' | EngineFields> { schemaVersion: 6 }

const countryIdsFor = (state: { territoryOwnership: Record<string, string | undefined>; regionOwnership?: Record<string, string | undefined> }, regions: readonly RegionEntity[], context?: DiplomacyContext) => {
  if (context) return context.countryIds;
  const countryIds = new Set(regions.flatMap(region => [region.parentCountryId, region.initialOwnerCountryId]));
  // A registered legacy macro's saved owner is historical evidence, not a new Country invented by migration.
  for (const region of regions) {
    const owner = region.macroTerritoryId ? state.territoryOwnership[region.macroTerritoryId] : undefined;
    if (owner !== undefined) {
      if (typeof owner !== 'string' || !owner.trim()) throw new Error('Malformed legacy Country ownership reference.');
      countryIds.add(owner);
    }
  }
  for (const owner of [...Object.values(state.territoryOwnership), ...Object.values(state.regionOwnership ?? {})]) {
    if (owner !== undefined && !countryIds.has(owner)) {
      if (typeof owner !== 'string' || !politicalRegistry.countries[owner]) throw new Error(`Unexplained legacy Country reference: ${String(owner)}. Supply the permanent registry context.`);
      countryIds.add(owner);
    }
  }
  return countryIds;
};
const withEngine = (state: Omit<SimulationState, 'schemaVersion' | EngineFields | 'international' | 'operations' | 'multilateral' | 'constitution' | 'elections'>, regions: readonly RegionEntity[], context?: DiplomacyContext): SimulationState => {
  const countryIds = countryIdsFor(state, regions, context);
  const initialized = initializeFiscal(initializeSocioeconomy(initializeInformationState({ ...state, schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), information: emptyInformation(state.date), governance: emptyGovernance(state.date), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), engine: createEngineState(countryIds) }), regions));
  const crisis = { ...initialized, crisis: initializeCrisisState(initialized.crisis, countryIds, initialized.date) };
  const withPolitics = { ...crisis, politics: initializePolitics(crisis, countryIds, regions), governance: emptyGovernance(crisis.date) };
  return initializeElections(initializeConstitution(initializeOperations(initializeInternational(initializeMultilateral(initializeTrade(initializeMilitary(initializePartyLeaders(withPolitics)))))), [...countryIds]), [...countryIds]);
};
const validationContext = (regions: RegionEntity[], context: DiplomacyContext): InvariantContext => ({ ...context, regions });

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  // JSON omits undefined properties. Restore identity keys only, never baseline values or owners.
  const fields = ['regionOwnership', 'populationByRegion', 'economicOutputByRegion'] as const;
  const record = save as Record<string, unknown>;
  save = { ...record, ...Object.fromEntries(fields.flatMap(field => {
    const map = record[field];
    return map && typeof map === 'object' && !Array.isArray(map)
      ? [[field, { ...Object.fromEntries(regions.map(region => [region.id, undefined])), ...map }]] : [];
  })) };
  if (version === 7 || version === 8 || version === 9 || version === 10 || version === 11 || version === 12 || version === 13 || version === 14 || version === 15 || version === 16 || version === 17 || version === 18 || version === 19 || version === 20) {
    const current = save as SimulationState & { crisis?: SimulationState['crisis']; politics?: SimulationState['politics'] };
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v7-v15 simulation save.');
    if (!current.engine || typeof current.engine.seed !== 'string' || !Number.isSafeInteger(current.engine.tick) || !current.engine.fidelityByCountry || !Array.isArray(current.engine.pendingFidelityTransitions) || !Array.isArray(current.engine.recentFidelityTransitions) || !Array.isArray(current.engine.pendingImmediateUpdates) || !Array.isArray(current.engine.dirtyDomains)) throw new Error('Malformed v7 simulation engine state.');
    if (version >= 8 && (!current.socioeconomy || current.socioeconomy.modelVersion !== 'socioeconomy-0.10-v1')) throw new Error('Malformed or unsupported v8 socioeconomic model.');
    if (version >= 9 && !['fiscal-0.11-v1', 'fiscal-0.11-v2'].includes(current.fiscal?.version)) throw new Error('Malformed fiscal model.');
    if (version === 10 && current.crisis?.version !== 'crisis-0.12-v1') throw new Error('Malformed crisis model.');
    if (version >= 11 && (current.crisis?.version !== 'crisis-0.12-v1' || current.politics?.version !== 'politics-0.13-v1')) throw new Error('Malformed politics or crisis model.');
    if (version >= 12 && current.governance?.version !== 'governance-0.14-v1') throw new Error('Malformed governance model.');
    if (version >= 13 && ![INFORMATION_VERSION, 'information-0.15-v1', 'information-0.15-v2'].includes(current.information?.version)) throw new Error('Malformed government information model.');
    if (version >= 14 && current.military?.version !== MILITARY_VERSION) throw new Error('Malformed military model.');
    if (version === 15 && current.trade?.version !== TRADE_VERSION) throw new Error('Malformed trade model.');
    if (version === 16 && current.trade?.version !== TRADE_VERSION) throw new Error('Malformed trade model in schema-16 save.');
    if (version === 16 && current.international?.version !== 'international-0.18-v1') throw new Error('Malformed international model.');
    if (version === 17 && current.operations?.version !== 'operations-0.19-v1') throw new Error('Malformed operations model.');
    if (version === 18 && current.multilateral?.version !== MULTILATERAL_VERSION) throw new Error('Malformed multilateral model.');
    if (version === 20 && current.assets?.version !== ASSETS_VERSION) throw new Error('Malformed assets model.');
    const fiscal = version >= 9 ? upgradeFiscalStateV1(current.fiscal, current.date) : emptyFiscal();
    const countryIds = countryIdsFor(current, regions, diplomacyContext);
    const crisis = version >= 10 ? current.crisis! : initializeCrisisState(emptyCrisis(), countryIds, current.date);
    const base = { ...current, schemaVersion: 20 as const, operations: version >= 17 ? current.operations! : emptyOperations(), international: version >= 16 ? current.international! : emptyInternational(), multilateral: version >= 18 ? current.multilateral! : emptyMultilateral(), constitution: version >= 19 ? current.constitution! : initializeConstitution(current, [...countryIds]).constitution, elections: version >= 19 ? current.elections! : initializeElections(current, [...countryIds]).elections, assets: version >= 20 ? current.assets! : emptyAssets(current.date), trade: version >= 15 ? current.trade : emptyTrade(), military: version >= 14 ? current.military : emptyMilitary(), information: version >= 13 ? current.information! : emptyInformation(current.date), governance: version >= 12 ? current.governance! : emptyGovernance(current.date), politics: version >= 11 ? current.politics! : emptyPolitics(), crisis, fiscal, socioeconomy: version === 7 ? emptySocioeconomy() : current.socioeconomy };
    const upgraded = cloneSimulationState(base);
    const fiscalRestored = version >= 9 ? upgraded : initializeFiscal(version === 7 ? initializeSocioeconomy(upgraded, regions) : upgraded);
    const savedRegistryVersion = version >= 11 ? (current.politics as { registryVersion?: unknown }).registryVersion : undefined;
    if (version >= 13 && savedRegistryVersion !== politicalRegistry.version) throw new Error(`Incompatible political registry in schema-${version} save: ${String(savedRegistryVersion)}. An explicit versioned migration is required.`);
    const hasNormalizedPolitics = savedRegistryVersion === politicalRegistry.version;
    // Early 0.13 schema-11 saves embedded mutable static registries. Rebuild their
    // deterministic opinion branch against the current pinned registry instead of
    // carrying stale party references into the runtime.
    const needsPoliticalRebase = savedRegistryVersion === 'political-registry-0.13-v2' || savedRegistryVersion === 'political-registry-0.13-v3';
    const politicsRestored = hasNormalizedPolitics ? fiscalRestored : needsPoliticalRebase ? { ...fiscalRestored, politics: rebasePoliticsRegistry(fiscalRestored) } : { ...fiscalRestored, politics: initializePolitics({ ...fiscalRestored, politics: emptyPolitics() }, countryIds, regions) };
    let restored = version === 12 ? upgradeGovernanceSchema12(politicsRestored) : politicsRestored;
    if (version >= 12) restored = upgradeGovernanceProposalModel(restored);
    if (version < 13) {
      restored = initializeInformationState(restored);
      restored = initializePartyLeaders(restored);
    } else {
      restored = upgradeInformationState(restored);
    }
    if (version < 14) restored = initializeMilitary(restored);
    else restored = upgradeMilitaryReportReadiness(restored);
    if (version < 15) restored = initializeTrade(restored);
    if (version < 16) restored = initializeInternational(restored);
    if (version < 17) {
      if (version === 16) restored = upgradeOperationsAuthority(restored);
      restored = initializeOperations(restored);
    } else {
      restored = upgradeOperationsDeployments(restored);
    }
    if (version < 18) restored = initializeMultilateral(restored);
    // Intra-schema-19 backfill for saves written before pendingAmendments, per-chamber elections
    // and organization banEvents were introduced. Idempotent: present fields are never rewritten.
    restored = backfillSchema19(restored);
    assertSimulationInvariants(restored, validationContext(regions, diplomacyContext), 'reload');
    return restored;
  }
  if (version !== undefined && ![1, 2, 3, 4, 5, 6].includes(version as number)) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);

  let migrated: SimulationState;
  if (version === 6) {
    const current = save as SimulationStateV6;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v6 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli) || !Array.isArray(current.wars) || !current.occupationByRegion) throw new Error('Malformed v6 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: current.wars.map(war => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } })), occupationByRegion: Object.fromEntries(Object.entries(current.occupationByRegion).map(([id, occupation]) => [id, { ...occupation }])) }, regions, diplomacyContext);
  } else if (version === 5) {
    const current = save as SimulationStateV5;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v5 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli)) throw new Error('Malformed v5 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 4) {
    const current = save as SimulationStateV4;
    if (!current.populationByRegion || !current.economicOutputByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || Object.values(current.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v4 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 3) {
    const current = save as SimulationStateV3;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v3 simulation population state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 2) {
    const current = save as SimulationStateV2;
    if (!current.territoryOwnership || !current.regionOwnership || !current.date || ![1, 2, 5].includes(current.speed)) throw new Error('Malformed v2 simulation save.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else {
    const legacy = save as LegacySimulationStateV1;
    if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
    const regionOwnership = Object.fromEntries(regions.map(region => [region.id, (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId]));
    migrated = withEngine({ ...legacy, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  }
  const finalContext = diplomacyContext ?? { countryIds: countryIdsFor(migrated, regions), regionIds: new Set(regions.map(region => region.id)) };
  assertSimulationInvariants(migrated, validationContext(regions, finalContext), 'reload');
  return migrated;
}

function upgradeOperationsDeployments(state: SimulationState): SimulationState {
  const deployments = { ...state.operations.deployments };
  for (const [id, deployment] of Object.entries(deployments)) {
    if (deployment.allocated) continue;
    const allocatedEquipment: Partial<Record<string, number>> = {};
    for (const [item, quantity] of Object.entries(deployment.equipment)) allocatedEquipment[item] = (quantity as number) + (deployment.losses.equipment[item as keyof typeof deployment.losses.equipment] ?? 0);
    deployments[id] = {
      ...deployment,
      allocated: {
        personnel: deployment.personnel + deployment.losses.personnel,
        equipment: allocatedEquipment,
      },
    };
  }
  return { ...state, operations: { ...state.operations, deployments } };
}

function upgradeOperationsAuthority(state: SimulationState): SimulationState {
  const persons = { ...state.governance.persons };
  for (const [id, person] of Object.entries(persons)) {
    if (!person.office || !['head_of_government', 'head_of_state'].includes(person.office.role)
      || person.office.evidence?.authorityBasis === 'institutional_authority_unresolved'
      || person.office.authorityProfile.capabilities.includes('command_military_operations')) continue;
    persons[id] = { ...person, office: { ...person.office, authorityProfile: { ...person.office.authorityProfile, capabilities: [...person.office.authorityProfile.capabilities, 'command_military_operations' as const].sort() as typeof person.office.authorityProfile.capabilities } } };
  }
  return { ...state, governance: { ...state.governance, persons } };
}

export function serializeSimulationState(state: SimulationState, context?: InvariantContext) {
  if (context) assertSimulationInvariants(state, context, 'save');
  return JSON.stringify(state);
}
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext) => migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation, baselineEconomicOutput, diplomacyContext);
