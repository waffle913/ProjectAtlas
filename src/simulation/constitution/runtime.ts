import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { CONSTITUTION_VERSION, MATERIAL_KEYS, type AmendmentDecision, type AmendmentStatus, type ConstitutionalRevisionDomain, type ConstitutionalRights, type EmergencyConstitution, type HeadOfStateConstitution, type JudicialEffect, type JudicialTiming, type JudicialVerdict, type ParliamentConstitution, type PendingAmendment } from './model';
import { POLITICAL_ISSUES } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { governanceFingerprint } from '../governance/model';
import { reconcileOfficeCapabilitiesForCountry } from '../governance/runtime';
import { isSimulationDate as validDate } from '../date';

/** A person holding the executive office of the Country (head of government or head of state). */
const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const activeCrisisEpisodes = (state: SimulationState, countryId: string) =>
  Object.values(state.crisis.countries[countryId]?.currentByType ?? {}).filter(episode => episode.state === 'ACTIVE');

const hasActiveCrisis = (state: SimulationState, countryId: string): boolean => activeCrisisEpisodes(state, countryId).length > 0;

/** Date arithmetic that keeps Feb-29 deadlines valid in non-leap years (Feb 29 -> Feb 28). */
export const addYearsToDate = (isoDate: string, years: number): string => {
  if (!validDate(isoDate) || !Number.isSafeInteger(years) || years < 0) throw new Error('Invalid date arithmetic input.');
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const month = date.getUTCMonth(), day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear() + years, month, day));
  if (target.getUTCMonth() !== month) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
};

/** Declare a state of emergency. Requires an active crisis and the executive office. The justifying
 *  crises are recorded by permanent episode identity, never by type alone. A declaration never
 *  overwrites an emergency already in force: an active or expired emergency must be ended (or its
 *  justification expire into `ended` via endEmergency) before a new declaration, so accumulated
 *  unjustifiedSince/discontent counters are never silently reset. */
export function declareEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may declare a state of emergency.');
  if (!hasActiveCrisis(state, countryId)) throw new Error('A state of emergency requires an active crisis.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  if (entry.emergency.status !== 'none') throw new Error('A state of emergency is already in force (or expired but not ended); end it before declaring a new one.');
  const justificationEpisodeIds = activeCrisisEpisodes(state, countryId).map(episode => episode.id);
  const emergency: EmergencyConstitution = {
    status: 'active', justificationEpisodeIds,
    restrictions: { assembliesBanned: true, strikesBanned: true, policePowersEnhanced: true, bordersClosed: true },
    ministerialRecommendations: [],
  };
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency } } } };
}

/** End a state of emergency and lift every restriction. Pending ministerial recommendations are
 *  marked acted-on by the end, never silently dropped. */
export function endEmergency(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may end a state of emergency.');
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const ministerialRecommendations = entry.emergency.ministerialRecommendations.map(recommendation => recommendation.status === 'pending' ? { ...recommendation, status: 'acted_on' as const } : recommendation);
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, emergency: { status: 'none', justificationEpisodeIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false }, ministerialRecommendations } } } } };
}

/** Schedule an adopted amendment to apply at its effective date, recording the constitutional
 *  judicial-review timing/effect (the court's power, never a verdict). A pending can only come from
 *  the canonical adopted instrument: instrument id, country, effective date, payload and their
 *  fingerprint are bound strictly, and the same instrument can never be scheduled twice. */
export function scheduleConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; effectiveDate: string; payload: PendingAmendment['payload'] }): SimulationState {
  const instrument = state.governance.proposals[proposal.id];
  const adopted = Boolean(instrument
    && instrument.kind === 'constitutional_amendment'
    && instrument.status === 'enacted'
    && instrument.countryId === proposal.countryId
    && instrument.effectiveDate === proposal.effectiveDate
    && JSON.stringify(instrument.payload) === JSON.stringify(proposal.payload));
  if (!adopted) throw new Error('A pending amendment must come from the adopted canonical constitutional amendment instrument (id, Country, effective date and payload).');
  if (state.constitution.pendingAmendments.some(pending => pending.instrumentId === proposal.id)) throw new Error('This amendment instrument is already scheduled.');
  const judicialReview = state.constitution.countries[proposal.countryId]?.judicialReview ?? { timing: 'unavailable' as const, effect: 'unavailable' as const };
  const pending: PendingAmendment = {
    instrumentId: proposal.id, countryId: proposal.countryId, applyOn: proposal.effectiveDate, payload: structuredClone(proposal.payload),
    payloadFingerprint: governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload }),
    status: 'scheduled', judicialReview: { timing: judicialReview.timing, effect: judicialReview.effect },
  };
  return { ...state, constitution: { ...state.constitution, pendingAmendments: [...state.constitution.pendingAmendments, pending] } };
}

const findPending = (state: SimulationState, instrumentId: string): PendingAmendment => {
  const amendment = state.constitution.pendingAmendments.find(item => item.instrumentId === instrumentId);
  if (!amendment) throw new Error(`Unknown scheduled constitutional amendment: ${instrumentId}.`);
  return amendment;
};

const replacePending = (state: SimulationState, amendment: PendingAmendment): SimulationState => ({
  ...state,
  constitution: { ...state.constitution, pendingAmendments: state.constitution.pendingAmendments.map(item => item.instrumentId === amendment.instrumentId ? amendment : item) },
});

const courtExists = (state: SimulationState, countryId: string): boolean => state.constitution.countries[countryId]?.judicialReview.courtExists === 'exists';

const hasDecision = (amendment: PendingAmendment): boolean => amendment.decision !== undefined;

const pickFields = <T extends object>(source: T, changed: object): Partial<T> =>
  Object.fromEntries(Object.keys(changed).filter(key => key in source).map(key => [key, (source as Record<string, unknown>)[key]])) as Partial<T>;

/** Capture the limited inverse: only the pre-amendment values of the fields this payload actually
 *  changes. A posteriori annulment restores exactly these, never a full snapshot that could erase a
 *  later amendment. Material keys are reversed from the payload lists, not from this record. */
function captureAppliedInverse(state: SimulationState, countryId: string, payload: PendingAmendment['payload']): PendingAmendment['appliedInverse'] {
  const entry = state.constitution.countries[countryId];
  if (!entry) return undefined;
  const inverse: NonNullable<PendingAmendment['appliedInverse']> = {};
  if (payload.rightsChanges && Object.keys(payload.rightsChanges).length) inverse.rights = pickFields(entry.rights, payload.rightsChanges);
  if (payload.parliamentChanges && Object.keys(payload.parliamentChanges).length) inverse.parliament = pickFields(entry.parliament, payload.parliamentChanges);
  if (payload.executiveChanges?.headOfState && Object.keys(payload.executiveChanges.headOfState).length) inverse.headOfState = pickFields(entry.headOfState, payload.executiveChanges.headOfState);
  if (payload.executiveChanges?.government && Object.keys(payload.executiveChanges.government).length) inverse.government = pickFields(entry.government, payload.executiveChanges.government);
  if (payload.electionChanges && Object.keys(payload.electionChanges).length) inverse.election = pickFields(entry.election, payload.electionChanges);
  if (payload.judicialChanges && Object.keys(payload.judicialChanges).length) inverse.judicialReview = pickFields(entry.judicialReview, payload.judicialChanges);
  if (payload.territoryChanges) inverse.territory = pickFields(entry.territory, payload.territoryChanges);
  if (payload.amendmentChanges && Object.keys(payload.amendmentChanges).length) inverse.amendment = pickFields(entry.amendment, payload.amendmentChanges);
  return inverse;
}

/** A party is `parliamentary_parties` accessor only when it is really represented in the Country's
 *  Parliament (the dynamic post-election snapshot first, the sourced 2026 allocation otherwise).
 *  Being a party leader alone is never parliamentary representation. */
const representedInParliament = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  const partyId = person?.partyId;
  if (!partyId) return false;
  const electionEntry = state.elections.countries[countryId];
  if (electionEntry) {
    for (const chamber of Object.values(electionEntry.chambers)) if ((chamber.seatsByParty[partyId] ?? 0) > 0) return true;
  }
  const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
  return Boolean(institution?.chambers.some(chamber => chamber.seatAllocationStatus === 'sourced' && (chamber.seatsByParty[partyId] ?? 0) > 0));
};

const personAccessorKinds = (state: SimulationState, personId: string, countryId: string): Array<'executive' | 'government' | 'parliament' | 'parliamentary_parties' | 'citizens'> => {
  const kinds: Array<'executive' | 'government' | 'parliament' | 'parliamentary_parties' | 'citizens'> = [];
  const person = state.governance.persons[personId];
  const role = person?.office?.role;
  if (person?.office?.countryId === person.countryId) {
    if (role === 'head_of_government' || role === 'head_of_state') kinds.push('executive');
    if (role === 'head_of_government' || role === 'minister') kinds.push('government');
    if (role === 'legislator') kinds.push('parliament');
  }
  if (representedInParliament(state, personId, countryId)) kinds.push('parliamentary_parties');
  kinds.push('citizens');
  return kinds;
};

/** Refer an amendment to the constitutional court (saisine). The constitution's accessors are
 *  enforced, and the saisine timing follows the real judicial-review timing: `both` allows a priori
 *  (before application) and a posteriori (after application); `none`/`unavailable` refuse a saisine.
 *  An amendment that already received a decision can never be seized again: a new constitutional
 *  cycle requires a distinct amendment instrument, never a re-run of the same one. */
export function referAmendmentForJudicialReview(state: SimulationState, instrumentId: string, byPersonId: string): SimulationState {
  const amendment = findPending(state, instrumentId);
  if (amendment.decision) throw new Error('This amendment has already been decided; it cannot be seized again. A new constitutional cycle requires a distinct amendment instrument.');
  const person = state.governance.persons[byPersonId];
  if (!person || person.status !== 'active' || person.countryId !== amendment.countryId) throw new Error('Only an active person of the Country may refer the amendment.');
  const timing: JudicialTiming = amendment.judicialReview.timing;
  if (timing === 'none' || timing === 'unavailable') throw new Error('This constitution provides no judicial review; no saisine is possible.');
  if (!['scheduled', 'promulgated'].includes(amendment.status)) throw new Error('Only a scheduled or applied amendment may be referred for judicial review.');
  if (!courtExists(state, amendment.countryId)) throw new Error('This Country has no constitutional court to review the amendment.');
  const accessors = state.constitution.countries[amendment.countryId]?.judicialReview.accessors ?? [];
  const kinds = personAccessorKinds(state, byPersonId, amendment.countryId);
  if (!accessors.some(kind => kinds.includes(kind))) throw new Error('This person is not among the constitutional accessors who may seize the court.');
  const applied = amendment.appliedOn !== undefined;
  if (timing === 'before_promulgation' && applied) throw new Error('This constitution allows only a priori review; an already-applied amendment cannot be seized again.');
  if (timing === 'after_promulgation' && !applied) throw new Error('This constitution allows only a posteriori review; the amendment has not been applied yet.');
  const referralTiming: AmendmentReferralTiming = applied ? 'after_promulgation' : 'before_promulgation';
  return replacePending(state, { ...amendment, status: 'referred', referral: { on: state.date, byPersonId, timing: referralTiming } });
}

type AmendmentReferralTiming = 'before_promulgation' | 'after_promulgation';

const rightStrength = (value: string | undefined): number | undefined => {
  switch (value) {
    case 'guaranteed': case 'strong': case 'constitutional_right': case 'constitutional': return 10_000;
    case 'guaranteed_with_restrictions': case 'guaranteed_with_legal_expropriation': case 'limited': return 7_000;
    case 'official_plus_tolerance': case 'authorization_required': case 'state_objective_not_justiciable': case 'ordinary_law_only': return 6_000;
    case 'strongly_restricted': case 'official_plus_restrictions': case 'weak': return 3_000;
    case 'not_guaranteed': case 'not_constitutionalized': return 0;
    default: return undefined;
  }
};

/** The constitutional court's institutional verdict. It is derived deterministically from the
 *  saisine, the amendment text and the constitutional norms currently in force — never an arbitrary
 *  result injected by the caller. Every finding and norm applied is recorded as a traceable ground.
 *
 *  Norms applied (documented, modelled — not sourced rules):
 *  1. Procedural review of the recorded adoption: the parliamentary threshold in force and the
 *     referendum requirement in force are checked against the recorded vote/referendum evidence.
 *  2. Substantive review of the text: weakening a right the constitution in force guarantees,
 *     lowering the amendment's own threshold below the threshold in force, removing a referendum
 *     requirement in force, or withdrawing the court's own a priori control in force.
 *  The court's constitutional power (judicialReview.effect) bounds which blocking verdict is
 *  admissible: an advisory-only court reports findings without annulling or declaring anything. */
function institutionalVerdict(state: SimulationState, amendment: PendingAmendment): { outcome: JudicialVerdict; grounds: string[] } {
  const grantedEffect = amendment.judicialReview.effect;
  const entry = state.constitution.countries[amendment.countryId];
  const proposal = state.governance.proposals[amendment.instrumentId];
  const referral = amendment.referral;
  // A posteriori review judges the text against the constitutional standard that existed BEFORE
  // this amendment was applied — the canonical appliedInverse (the pre-amendment values of exactly
  // the fields this payload changed). An amendment that weakened a right can therefore never be
  // compared against its own new value and appear conforming. A priori review compares against the
  // constitution currently in force (nothing has been applied yet).
  const applied = amendment.appliedOn !== undefined;
  const prior = applied ? amendment.appliedInverse : undefined;
  const amendmentRule = { ...entry?.amendment, ...(prior?.amendment ?? {}) };
  const parliamentRule = { ...entry?.parliament, ...(prior?.parliament ?? {}) };
  const judicialRule = { ...entry?.judicialReview, ...(prior?.judicialReview ?? {}) };
  const rightsRule = { ...entry?.rights, ...(prior?.rights ?? {}) };
  const grounds: string[] = [
    `Saisine: ${referral?.timing ?? 'unknown'} control${referral ? ` recorded on ${referral.on}${referral.byPersonId ? ` by ${referral.byPersonId}` : ' (no actor fabricated)'}` : ' (not recorded)'}.`,
    `Text reviewed: amendment instrument ${amendment.instrumentId} of ${amendment.countryId}, effective ${amendment.applyOn}.`,
  ];
  const findings: string[] = [];
  // 1. Procedural review of the recorded adoption evidence.
  const parliamentPower = parliamentRule.power;
  if (amendmentRule.parliamentaryThresholdBps !== undefined) {
    const bindingVote = parliamentPower !== undefined && !['none', 'consultative'].includes(parliamentPower);
    const yes = proposal?.voteResult?.yesSeats, total = proposal?.voteResult?.totalSeats;
    if (bindingVote && yes !== undefined && total !== undefined && total > 0 && yes * 10_000 < amendmentRule.parliamentaryThresholdBps * total) {
      findings.push(`The recorded parliamentary adoption (${yes}/${total} seats) is below the constitutional threshold in force (${amendmentRule.parliamentaryThresholdBps} basis points).`);
    }
  }
  const referendumRequired = Boolean(amendmentRule && (amendmentRule.referendum === 'always' || (amendmentRule.referendum === 'principal_only' && proposal?.constitutionalDisposition === 'principal')));
  if (referendumRequired) {
    if (!proposal?.referendumResult) findings.push('The constitution in force requires a referendum; no referendum outcome is recorded.');
    else if (!proposal.referendumResult.adopted) findings.push('The recorded referendum rejected the amendment.');
  }
  // 2. Substantive review of the text against the norms in force before this amendment (a
  // posteriori) or currently in force (a priori) — never against the amendment's own new values.
  const payload = amendment.payload;
  if (payload.rightsChanges && entry) {
    for (const [fieldValue, afterValue] of Object.entries(payload.rightsChanges)) {
      const field = fieldValue as keyof ConstitutionalRights;
      const before: string | undefined = rightsRule[field];
      const after: string | undefined = typeof afterValue === 'string' ? afterValue : undefined;
      const beforeStrength = rightStrength(before), afterStrength = rightStrength(after);
      if (beforeStrength !== undefined && afterStrength !== undefined && afterStrength < beforeStrength) {
        findings.push(`The text weakens the constitutional right ${field} (${before} -> ${after}); the constitutional standard in force before this amendment guarantees ${field} at ${before}.`);
      }
    }
  }
  if (payload.amendmentChanges && entry) {
    if (payload.amendmentChanges.parliamentaryThresholdBps !== undefined && amendmentRule.parliamentaryThresholdBps !== undefined
      && payload.amendmentChanges.parliamentaryThresholdBps < amendmentRule.parliamentaryThresholdBps) {
      findings.push('The text lowers the amendment\'s own parliamentary threshold below the threshold in force before this amendment.');
    }
    if (payload.amendmentChanges.referendum !== undefined && amendmentRule.referendum !== 'never' && payload.amendmentChanges.referendum === 'never') {
      findings.push('The text removes the referendum requirement in force before this amendment.');
    }
  }
  if (payload.judicialChanges?.timing !== undefined && entry) {
    const beforeTiming = judicialRule.timing;
    const afterTiming = payload.judicialChanges.timing;
    if ((beforeTiming === 'before_promulgation' || beforeTiming === 'both') && (afterTiming === 'none' || afterTiming === 'after_promulgation' || afterTiming === 'unavailable')) {
      findings.push('The text withdraws the constitutional court\'s own a priori control in force before this amendment.');
    }
  }
  if (!findings.length) {
    if (grantedEffect === 'advisory_only') {
      return { outcome: 'advisory', grounds: [...grounds, 'The text raises no finding against the constitutional norms in force; the court\'s power is advisory only, so the opinion is recorded without any blocking effect.'] };
    }
    return { outcome: 'clear', grounds: [...grounds, 'The text raises no finding against the constitutional norms in force.'] };
  }
  grounds.push(...findings.map(finding => `Finding: ${finding}`));
  if (grantedEffect === 'annul') return { outcome: 'annulled', grounds };
  if (grantedEffect === 'declare_incompatibility') return { outcome: 'incompatible', grounds };
  grounds.push('The court\'s constitutional power is advisory only: the findings are reported, but no annulment or incompatibility is declared.');
  return { outcome: 'advisory', grounds };
}

/** Decide a referred saisine. The verdict is the court's own institutional decision, derived from
 *  the saisine, the text and the constitutional norms in force — never a caller-supplied result.
 *  A decided amendment can never be decided again. A posteriori annulment reverses only the
 *  annulled amendment's own changes (replaying the revision trace), never a later amendment's. */
export function decideAmendmentJudicialReview(state: SimulationState, instrumentId: string, _legacyRequestedVerdict?: unknown): SimulationState {
  const amendment = findPending(state, instrumentId);
  if (amendment.status !== 'referred') throw new Error('Only a referred amendment may receive a judicial decision.');
  if (amendment.decision) throw new Error('This saisine has already been decided; a decided amendment cannot be re-judged.');
  const grantedEffect = amendment.judicialReview.effect;
  if (grantedEffect === 'unavailable') throw new Error('This constitution grants the court no known power; a verdict cannot be issued from an unavailable power.');
  if (!courtExists(state, amendment.countryId)) throw new Error('This Country has no constitutional court to decide the saisine.');
  const entry = state.constitution.countries[amendment.countryId];
  // The appointment/term rules are a usable institutional state: when the constitution defines an
  // appointment rule, the court decides through its seated members, never as a floating institution.
  if (entry?.judicialReview.appointment !== 'unavailable' && !(entry.courtMembers ?? []).some(member => !member.termEnd || member.termEnd > state.date)) {
    throw new Error('The constitutional court has no seated judge; the appointment rule must be exercised before a decision.');
  }
  const verdict = institutionalVerdict(state, amendment);
  const decision: AmendmentDecision = { outcome: verdict.outcome, effect: grantedEffect, on: state.date, grounds: verdict.grounds };
  if (verdict.outcome === 'annulled') {
    // A posteriori annulment reverses only this amendment's own changes; a priori annulment just blocks.
    if (amendment.appliedOn) {
      const reversed = reverseConstitutionalAmendment(state, amendment);
      return replacePending(reversed, { ...amendment, status: 'annulled', decision });
    }
    return replacePending(state, { ...amendment, status: 'annulled', decision });
  }
  if (verdict.outcome === 'incompatible') {
    // Distinct from annulment: the incompatibility is recorded without reversing the applied effects.
    return replacePending(state, { ...amendment, status: 'incompatible', decision });
  }
  // A clear or advisory verdict removes the a priori block only when the amendment was not yet applied.
  if (amendment.appliedOn) {
    // Already applied (a posteriori review): stays promulgated — never re-scheduled or re-applied.
    return replacePending(state, { ...amendment, status: 'promulgated', decision });
  }
  return replacePending(state, { ...amendment, status: 'scheduled', decision });
}

/** Apply amendments whose effective date has arrived, exactly once. Terminal amendments are never
 *  reprocessed. A priori control never auto-triggers and never blocks forever: application waits
 *  only on a real prior saisine (no actor is fabricated). Without a saisine the amendment applies
 *  at its date; a real saisine waits for the court's verdict — clear/advisory resumes the
 *  procedure, a blocking verdict has already left a terminal status. */
export function applyDueAmendments(state: SimulationState): SimulationState {
  const due = state.constitution.pendingAmendments.filter(amendment => amendment.applyOn <= state.date && amendment.status === 'scheduled');
  if (!due.length) return state;
  let next = state;
  for (const amendment of due) {
    const terminal = (status: AmendmentStatus, extra: Partial<PendingAmendment> = {}): void => {
      next = replacePending(next, { ...amendment, ...extra, status });
    };
    const proposal = next.governance.proposals[amendment.instrumentId];
    const enacted = proposal?.status === 'enacted' && proposal.kind === 'constitutional_amendment';
    if (!enacted) { terminal('blocked', { blockReason: 'not_enacted' }); continue; }
    const decision = amendment.decision;
    if (decision && (decision.outcome === 'annulled' || decision.outcome === 'incompatible')) continue; // terminal status already set by the decision
    const timing: JudicialTiming = amendment.judicialReview.timing;
    // A real prior saisine (recorded with a real actor) is the only thing that holds the
    // application: no saisine means no auto-referral and no eternal block.
    const priorSaisinePending = (timing === 'before_promulgation' || timing === 'both')
      && amendment.referral?.timing === 'before_promulgation'
      && !decision;
    if (priorSaisinePending) {
      // The saisine can only be resolved by the court; without one the application is refused
      // instead of waiting forever on a decision that can never come.
      if (!courtExists(next, amendment.countryId)) { terminal('blocked', { blockReason: 'judicial_review_unavailable' }); continue; }
      continue;
    }
    const appliedInverse = timing === 'after_promulgation' || timing === 'both' ? captureAppliedInverse(next, amendment.countryId, amendment.payload) : undefined;
    try {
      next = applyConstitutionalAmendment(next, { id: amendment.instrumentId, countryId: amendment.countryId, payload: amendment.payload }).next;
    } catch {
      // A structurally invalid payload is recorded as blocked, never applied and never a crash.
      terminal('blocked', { blockReason: 'payload_invalid' });
      continue;
    }
    terminal('promulgated', { appliedOn: state.date, ...(appliedInverse ? { appliedInverse } : {}) });
  }
  return next;
}

/** A monthly pass records a real interior-minister recommendation to end the emergency once the
 *  justifying crises cease. The minister is a real person holding a real interior portfolio; no
 *  actor is ever fabricated. */
const interiorMinisterEndRecommendation = (state: SimulationState, countryId: string): SimulationState['constitution']['countries'][string]['emergency']['ministerialRecommendations'] => {
  const cabinet = state.governance.cabinets[countryId];
  if (!cabinet) return [];
  const portfolio = Object.values(cabinet.portfolios).find(item => /interior/i.test(`${item.id} ${item.name}`));
  const ministerId = portfolio?.ministerPersonId;
  if (!portfolio || !ministerId) return [];
  const minister = state.governance.persons[ministerId];
  if (!minister || minister.status !== 'active' || minister.office?.countryId !== countryId || minister.office.role !== 'minister') return [];
  return [{
    on: state.date,
    byPersonId: ministerId,
    portfolioId: portfolio.id,
    action: 'end_emergency',
    reason: 'The justifying crisis episodes are no longer active; the emergency restrictions are no longer justified.',
    status: 'pending',
  }];
};

/** Monthly pass: while an emergency's justification episodes are no longer active, expire it and add
 *  a progressively accumulating causal dissatisfaction driver for every month the restrictions are
 *  maintained without justification. Episode identity — not crisis type — decides justification. */
export function runEmergencyMonth(state: SimulationState): SimulationState {
  let changed = false;
  const countries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    const emergency = entry.emergency;
    if (emergency.status === 'none') { countries[countryId] = entry; continue; }
    const currentEpisodes = state.crisis.countries[countryId]?.currentByType ?? {};
    const justificationActive = emergency.justificationEpisodeIds.length > 0 && emergency.justificationEpisodeIds.some(episodeId =>
      Object.values(currentEpisodes).some(episode => episode.id === episodeId && episode.state === 'ACTIVE'));
    if (justificationActive) {
      if (emergency.status === 'expired' && emergency.justificationEpisodeIds.length) {
        // A justifying crisis resumed; the emergency is justified again.
        countries[countryId] = { ...entry, emergency: { ...emergency, status: 'active', unjustifiedSince: undefined } };
        changed = true;
      } else countries[countryId] = entry;
      continue;
    }
    // No justification: expire (once) and add a progressive public-order driver every month.
    const wasJustified = emergency.unjustifiedSince === undefined;
    const unjustifiedSince = emergency.unjustifiedSince ?? state.date;
    // When the situation improves (the justifying crises cease), the interior minister — a real
    // portfolio holder, never a fabricated actor — recommends ending the emergency. The
    // recommendation is advisory only: it never lifts the restrictions by itself.
    const ministerialRecommendations = wasJustified ? [...emergency.ministerialRecommendations, ...interiorMinisterEndRecommendation(state, countryId)] : emergency.ministerialRecommendations;
    countries[countryId] = { ...entry, emergency: { ...emergency, status: 'expired', unjustifiedSince, discontentDriversApplied: (emergency.discontentDriversApplied ?? 0) + 1, ministerialRecommendations } };
    changed = true;
    const country = state.politics.countries[countryId];
    if (country) {
      state = { ...state, politics: { ...state.politics, countries: { ...state.politics.countries, [countryId]: { ...country, recentOpinionDrivers: [...country.recentOpinionDrivers, { date: state.date, drivers: [POLITICAL_ISSUES.indexOf('public_order')] }].slice(-12) } } } };
    }
  }
  return changed ? { ...state, constitution: { ...state.constitution, countries } } : state;
}

/** Constitutional court terms expire on their end date; expired members leave the seated court. */
export function runCourtTermsMonth(state: SimulationState): SimulationState {
  let changed = false;
  const countries: Record<string, SimulationState['constitution']['countries'][string]> = {};
  for (const [countryId, entry] of Object.entries(state.constitution.countries)) {
    if (!entry.courtMembers?.length) { countries[countryId] = entry; continue; }
    const courtMembers = entry.courtMembers.filter(member => !member.termEnd || member.termEnd > state.date);
    if (courtMembers.length !== entry.courtMembers.length) { countries[countryId] = { ...entry, courtMembers }; changed = true; }
    else countries[countryId] = entry;
  }
  return changed ? { ...state, constitution: { ...state.constitution, countries } } : state;
}

/** Appoint a judge to the constitutional court through the constitutional appointment rule.
 *  Only the modelled rule (`executive`) has a procedure; `parliament`/`shared` stay unavailable
 *  until a parliamentary appointment procedure exists, and `term`/`termYears` produce the real
 *  mandate end used by the court state. */
export function appointConstitutionalJudge(state: SimulationState, countryId: string, actorPersonId: string, judgePersonId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const review = entry.judicialReview;
  if (review.courtExists !== 'exists') throw new Error('This constitution has no constitutional court.');
  const actor = state.governance.persons[actorPersonId];
  if (review.appointment === 'executive') {
    if (!isExecutive(state, actorPersonId, countryId)) throw new Error('The constitution grants the executive the appointment; the executive office is required.');
  } else {
    throw new Error(`The constitutional appointment rule (${review.appointment}) has no modelled appointment procedure; the appointment is unavailable.`);
  }
  const judge = state.governance.persons[judgePersonId];
  if (!judge || judge.status !== 'active' || judge.countryId !== countryId) throw new Error('Only an active person of the Country may be appointed to the constitutional court.');
  if ((entry.courtMembers ?? []).some(member => member.personId === judgePersonId && (!member.termEnd || member.termEnd > state.date))) throw new Error('This person is already seated on the constitutional court.');
  const termEnd = review.term === 'years' && review.termYears !== undefined ? addYearsToDate(state.date, review.termYears) : undefined;
  const courtMembers = [...(entry.courtMembers ?? []), { personId: judgePersonId, appointedOn: state.date, ...(termEnd ? { termEnd } : {}) }];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, courtMembers } } } };
}

/** Canonical material keys a fiscal proposal would actually modify, determined by comparing the
 *  proposed value against the current fiscal state — not by the mere presence of a payload field.
 *  Payroll changes are attributed to the real rules changed: `fiscal.employee` / `fiscal.employer`
 *  for the components actually modified, `fiscal.payroll` only when the rule changes as a whole
 *  (both components, or a structural change beyond the known components). */
const fiscalMaterialKeys = (state: SimulationState, countryId: string, payload: { policy?: Record<string, unknown>; annualBudget?: Record<string, number> }): string[] => {
  const keys: string[] = [];
  const current = state.fiscal.countries[countryId];
  const currentPolicy = (current?.policy ?? {}) as Record<string, unknown>;
  for (const [kind, proposed] of Object.entries(payload.policy ?? {})) {
    if (proposed === undefined) continue;
    const existing = currentPolicy[kind];
    if (proposed === null) {
      if (existing === undefined || existing === null) continue;
      keys.push(`fiscal.${kind}`);
      if (kind === 'payroll' && typeof existing === 'object') {
        const record = existing as Record<string, unknown>;
        if (record.employee !== undefined) keys.push('fiscal.employee');
        if (record.employer !== undefined) keys.push('fiscal.employer');
      }
      continue;
    }
    if (JSON.stringify(proposed) === JSON.stringify(existing)) continue;
    if (kind === 'payroll') {
      const beforeRecord = (existing ?? {}) as Record<string, unknown>;
      const afterRecord = (proposed ?? {}) as Record<string, unknown>;
      const employeeChanged = JSON.stringify(beforeRecord.employee) !== JSON.stringify(afterRecord.employee);
      const employerChanged = JSON.stringify(beforeRecord.employer) !== JSON.stringify(afterRecord.employer);
      if (employeeChanged) keys.push('fiscal.employee');
      if (employerChanged) keys.push('fiscal.employer');
      if ((employeeChanged && employerChanged) || (!employeeChanged && !employerChanged)) keys.push('fiscal.payroll');
      continue;
    }
    keys.push(`fiscal.${kind}`);
  }
  const currentBudget = (current?.annualBudget ?? {}) as Record<string, number>;
  for (const [category, value] of Object.entries(payload.annualBudget ?? {})) {
    if (currentBudget[category] !== value) keys.push(`fiscal.annualBudget.${category}`);
  }
  return keys;
};

/** Reject an ordinary-law proposal that would modify a constitutionally protected material key. */
export function rejectProtectedModification(state: SimulationState, countryId: string, instrumentClass: string, payload: { policy?: Record<string, unknown>; annualBudget?: Record<string, number> }): string | undefined {
  if (instrumentClass === 'constitutional_amendment') return undefined;
  const protectedKeys = state.constitution.countries[countryId]?.protectedMaterialKeys ?? [];
  const modified = fiscalMaterialKeys(state, countryId, payload).filter(key => protectedKeys.includes(key));
  if (modified.length) return `Ordinary law cannot modify constitutionally protected material keys: ${modified.join(', ')}. A constitutional amendment is required.`;
  return undefined;
}

/** Record the material keys a secondary constitutional disposition protects. Internal: only an
 *  enacted amendment (via applyConstitutionalAmendment) may call this. */
function registerConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const merged = [...new Set([...entry.protectedMaterialKeys, ...materialKeys])].sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'protected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

/** Remove constitutional protection of material keys. Internal: only an enacted amendment may call this. */
function removeConstitutionalBinding(state: SimulationState, countryId: string, materialKeys: string[], instrumentId: string): SimulationState {
  const entry = state.constitution.countries[countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const removed = new Set(materialKeys);
  const merged = entry.protectedMaterialKeys.filter(key => !removed.has(key)).sort();
  const events = [...entry.bindingEvents, ...materialKeys.map(materialKey => ({ date: state.date, materialKey, action: 'unprotected' as const, instrumentId, provenance: 'constitutional_amendment' as const }))];
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...entry, protectedMaterialKeys: merged, bindingEvents: events } } } };
}

const leafChanges = (beforeRecord: Record<string, unknown>, afterRecord: Record<string, unknown>): Array<{ field: string; before: unknown; after: unknown }> => {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const field of [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort()) {
    if (JSON.stringify(beforeRecord[field]) !== JSON.stringify(afterRecord[field])) {
      changes.push({ field, before: structuredClone(beforeRecord[field] ?? null), after: structuredClone(afterRecord[field] ?? null) });
    }
  }
  return changes;
};

/** Apply an adopted constitutional amendment: protect/unprotect material keys and revise the
 *  constitution's records. Internal: it requires canonical proof of an enacted instrument, so it
 *  can never be used to bypass parliamentary adoption. The owning governance runtime schedules
 *  the amendment and the daily task applies it exactly once. Every changed non-material field is
 *  traced as a dated revision event (before/after), so a later annulment replays ownership
 *  without ever erasing a later amendment's value. Territory changes link devolved competences to
 *  the Regions actually granted autonomy, and an explicit sovereignty transfer moves canonical
 *  ownership when the procedure authorizes it. */
function applyConstitutionalAmendment(state: SimulationState, proposal: { id: string; countryId: string; payload: PendingAmendment['payload'] }): { next: SimulationState; protectedMaterialKeys: string[]; unprotectedMaterialKeys: string[] } {
  const instrument = state.governance.proposals[proposal.id];
  if (!instrument || instrument.status !== 'enacted' || instrument.kind !== 'constitutional_amendment') throw new Error('Only an enacted constitutional amendment may be applied.');
  const protect = proposal.payload.materialKeysToProtect ?? [];
  const unprotect = proposal.payload.materialKeysToUnprotect ?? [];
  const unknown = [...protect, ...unprotect].filter(key => !(MATERIAL_KEYS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`Unknown material keys cannot be constitutionally protected: ${unknown.join(', ')}.`);
  let next = state;
  if (protect.length) next = registerConstitutionalBinding(next, proposal.countryId, protect, proposal.id);
  if (unprotect.length) next = removeConstitutionalBinding(next, proposal.countryId, unprotect, proposal.id);
  const entry = next.constitution.countries[proposal.countryId];
  if (!entry) throw new Error('No constitutional state for this Country.');
  const p = proposal.payload;
  const updated = { ...entry };
  const revisionEvents = [...(entry.revisionEvents ?? [])];
  const recordRevision = (domain: ConstitutionalRevisionDomain, beforeRecord: Record<string, unknown>, afterRecord: Record<string, unknown>): void => {
    const changes = leafChanges(beforeRecord, afterRecord);
    if (changes.length) revisionEvents.push({ date: state.date, instrumentId: proposal.id, domain, changes });
  };
  if (p.rightsChanges && Object.keys(p.rightsChanges).length) {
    const after = { ...entry.rights, ...p.rightsChanges };
    recordRevision('rights', entry.rights as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.rights = after;
  }
  if (p.parliamentChanges && Object.keys(p.parliamentChanges).length) {
    const after = { ...entry.parliament, ...p.parliamentChanges };
    recordRevision('parliament', entry.parliament as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.parliament = after;
  }
  if (p.executiveChanges?.headOfState) {
    const after = { ...entry.headOfState, ...p.executiveChanges.headOfState };
    recordRevision('headOfState', entry.headOfState as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.headOfState = after;
  }
  if (p.executiveChanges?.government) {
    // vacancySuccession is a locked project rule (temporary/permanent succession), never amendable.
    const { vacancySuccession: _locked, ...amendableGovernment } = p.executiveChanges.government as Partial<{ vacancySuccession: unknown }> & Record<string, unknown>;
    if (Object.keys(amendableGovernment).length) {
      const after = { ...entry.government, ...amendableGovernment };
      recordRevision('government', entry.government as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
      updated.government = after;
    }
  }
  if (p.electionChanges && Object.keys(p.electionChanges).length) {
    const after = { ...entry.election, ...p.electionChanges };
    recordRevision('election', entry.election as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.election = after;
  }
  if (p.judicialChanges && Object.keys(p.judicialChanges).length) {
    const after = { ...entry.judicialReview, ...p.judicialChanges };
    recordRevision('judicialReview', entry.judicialReview as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.judicialReview = after;
  }
  if (p.territoryChanges) {
    const { regionIds, sovereigntyTransfer, delegatedCompetences: _competences, ...territoryFields } = p.territoryChanges;
    const competences = Array.isArray(_competences) ? _competences : undefined;
    const after = { ...entry.territory, ...territoryFields, ...(competences ? { delegatedCompetences: [...competences] } : {}) };
    // Regional autonomy is linked to real powers: the devolved competences are attached to the
    // Regions the amendment actually grants autonomy to, with dated provenance.
    if (regionIds?.length) {
      for (const regionId of regionIds) {
        if (next.regionOwnership[regionId] !== proposal.countryId) throw new Error(`Region ${regionId} is not owned by ${proposal.countryId}; autonomy cannot be devolved to it.`);
      }
      const devolvedPowers = [...entry.territory.devolvedPowers, ...regionIds.map(regionId => ({
        regionId, competences: [...(competences ?? [])], instrumentId: proposal.id, on: state.date,
      }))];
      after.devolvedPowers = devolvedPowers;
    }
    recordRevision('territory', entry.territory as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.territory = after;
    // A constitutional sovereignty transfer moves canonical ownership when the procedure authorizes
    // it. Independence into a brand-new State is not implemented; the recipient must exist.
    if (sovereigntyTransfer) {
      if (!sovereigntyTransfer.regionIds?.length || !sovereigntyTransfer.toCountryId?.trim()) throw new Error('A constitutional sovereignty transfer requires Regions and a recipient Country.');
      if (!politicalRegistry.countries[sovereigntyTransfer.toCountryId]) throw new Error(`Unknown sovereignty recipient Country: ${sovereigntyTransfer.toCountryId}.`);
      for (const regionId of sovereigntyTransfer.regionIds) {
        if (next.regionOwnership[regionId] !== proposal.countryId) throw new Error(`Region ${regionId} is not owned by ${proposal.countryId}; its sovereignty cannot be transferred.`);
      }
      next = { ...next, regionOwnership: { ...next.regionOwnership, ...Object.fromEntries(sovereigntyTransfer.regionIds.map(regionId => [regionId, sovereigntyTransfer.toCountryId])) } };
    }
  }
  if (p.amendmentChanges && Object.keys(p.amendmentChanges).length) {
    const after = { ...entry.amendment, ...p.amendmentChanges };
    recordRevision('amendment', entry.amendment as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    updated.amendment = after;
  }
  updated.revisionEvents = revisionEvents;
  next = { ...next, constitution: { ...next.constitution, countries: { ...next.constitution.countries, [proposal.countryId]: updated } } };
  // Institutional powers may have changed: persisted office capabilities are reconciled with the
  // constitution in force so no office keeps stale authority.
  if (p.parliamentChanges || p.executiveChanges || p.electionChanges) {
    next = reconcileOfficeCapabilitiesForCountry(next, proposal.countryId);
  }
  return { next, protectedMaterialKeys: protect, unprotectedMaterialKeys: unprotect };
}

/** Reverse an already-applied amendment after a posteriori annulment. It restores only the fields
 *  and material keys this amendment actually changed: the dated per-field revision trace (and the
 *  material-key binding trace) is replayed without the annulled instruments, so a later amendment's
 *  change to the same field or key survives — annulling A after B never deletes B's value. */
function reverseConstitutionalAmendment(state: SimulationState, amendment: PendingAmendment): SimulationState {
  const entry = state.constitution.countries[amendment.countryId];
  if (!entry) return state;
  // Every protection/removal is traced as a dated binding event, so the protected set is exactly the
  // replay of the remaining trace (baseline empty at initialization). Filtering this instrument out
  // and replaying never erases a later amendment's change — even for the same material key.
  const annulledInstrumentIds = new Set<string>(
    state.constitution.pendingAmendments.filter(pending => pending.status === 'annulled' && pending.instrumentId !== amendment.instrumentId).map(pending => pending.instrumentId),
  );
  annulledInstrumentIds.add(amendment.instrumentId);
  const bindingEvents = entry.bindingEvents
    .filter(event => event.instrumentId === undefined || !annulledInstrumentIds.has(event.instrumentId))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const keys = new Set<string>();
  for (const event of bindingEvents) {
    if (event.action === 'protected') keys.add(event.materialKey);
    else keys.delete(event.materialKey);
  }
  // Non-material domains: replay the per-field revision trace without the annulled instruments.
  // For each field, the surviving trace's last write owns the value; when only annulled writes
  // touched a field, the field returns to its pre-first-amendment value.
  const allIndexed = (entry.revisionEvents ?? []).map((event, index) => ({ event, index }));
  const surviving = allIndexed.filter(({ event }) => !annulledInstrumentIds.has(event.instrumentId));
  const ordered = [...surviving].sort((a, b) => (a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : a.index - b.index));
  const replayDomain = <T extends object>(domain: ConstitutionalRevisionDomain, current: T): T => {
    const result = { ...current } as Record<string, unknown>;
    const fields = new Set<string>(allIndexed.filter(({ event }) => event.domain === domain).flatMap(({ event }) => event.changes.map(change => change.field)));
    for (const field of fields) {
      const fieldWrites = ordered.filter(({ event }) => event.domain === domain && event.changes.some(change => change.field === field));
      const lastWrite = fieldWrites.at(-1);
      if (lastWrite) {
        result[field] = structuredClone(lastWrite.event.changes.find(change => change.field === field)!.after);
      } else {
        const firstWrite = allIndexed.find(({ event }) => event.domain === domain && event.changes.some(change => change.field === field));
        const first = firstWrite?.event.changes.find(change => change.field === field);
        if (first) result[field] = structuredClone(first.before);
      }
    }
    return result as T;
  };
  const updated = {
    ...entry,
    protectedMaterialKeys: [...keys].sort(),
    bindingEvents,
    revisionEvents: entry.revisionEvents ?? [],
    rights: replayDomain('rights', entry.rights),
    parliament: replayDomain('parliament', entry.parliament),
    headOfState: replayDomain('headOfState', entry.headOfState),
    government: replayDomain('government', entry.government),
    election: replayDomain('election', entry.election),
    judicialReview: replayDomain('judicialReview', entry.judicialReview),
    territory: replayDomain('territory', entry.territory),
    amendment: replayDomain('amendment', entry.amendment),
  };
  return { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [amendment.countryId]: updated } } };
}

export const constitutionVersion = () => CONSTITUTION_VERSION;

/** The constitutional right level acts as the legal basis/constraint when a concerned system acts:
 *  a guarantee is a constitutional foundation; `not_guaranteed` means ordinary law governs — it
 *  never means automatically forbidden; `unavailable` means no legal basis is known. */
export const rightsBasisFor = (level: string | undefined): { basis: 'constitutional_guarantee' | 'ordinary_law' | 'unavailable'; limitation: string } => {
  switch (level) {
    case 'guaranteed': case 'constitutional_right': return { basis: 'constitutional_guarantee', limitation: 'The constitution guarantees the right; the action is constitutionally grounded.' };
    case 'guaranteed_with_restrictions': case 'authorization_required': case 'strongly_restricted': case 'limited': case 'official_plus_tolerance': case 'official_plus_restrictions': return { basis: 'constitutional_guarantee', limitation: 'The constitution guarantees the right with restrictions; the action must respect them.' };
    case 'not_guaranteed': case 'not_constitutionalized': case 'ordinary_law_only': case 'state_objective_not_justiciable': return { basis: 'ordinary_law', limitation: 'The right is not constitutionally guaranteed; ordinary law governs — this never means automatically forbidden.' };
    default: return { basis: 'unavailable', limitation: 'No constitutional basis is available; the legality of the action is unknown.' };
  }
};

export const runConstitutionMonth = (state: SimulationState) => runCourtTermsMonth(runEmergencyMonth(applyDueAmendments(state)));

export const registerConstitutionTasks = (scheduler: SimulationScheduler) => {
  // Daily application: amendments take effect on their real effective date, not only on monthly
  // ticks, and a same-day electoral-rule change is in force before the daily election cycle
  // (priority 454 < elections 455).
  scheduler.register({ id: 'constitution.daily', cadence: 'daily', priority: 454, run: applyDueAmendments });
  scheduler.register({ id: 'constitution.monthly', cadence: 'monthly', priority: 460, run: runConstitutionMonth });
  return scheduler;
};
