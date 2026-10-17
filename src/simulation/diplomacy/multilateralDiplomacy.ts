/**
 * 0.31.4 — Diplomacy V2: multilateral diplomacy and de-escalation.
 *
 * Pure de-escalation contract (docs/diplomacy-0.31.md). Mediation and concrete
 * de-escalation measures map onto the existing 0.20 multilateral bodies /
 * decisions and the 0.18 international-action system — no second body or
 * decision store. A mediator is non-omniscient: its information basis is
 * explicit and it never gains access to hidden state merely by mediating.
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';
import { canConductDiplomacy, type DiplomaticMandate } from './contract';

export const DEESCALATION_MEASURE_KINDS = Object.freeze(['lift_restriction', 'withdraw_condemnation', 'mediation_offer'] as const);
export type DeescalationMeasureKind = typeof DEESCALATION_MEASURE_KINDS[number];

/** Canonical owners: each de-escalation measure maps onto an existing system — no second store. */
export const DEESCALATION_OWNERS: Readonly<Record<DeescalationMeasureKind, string>> = Object.freeze({
  lift_restriction: 'international.actions',      // 0.18 liftDeclaredOn
  withdraw_condemnation: 'international.actions', // 0.18 liftDeclaredOn
  mediation_offer: 'multilateral.decisions',      // 0.20 OrganizationDecision
});

export interface DeescalationMeasure {
  readonly id: string;
  readonly actorCountryId: string;
  readonly mandate: DiplomaticMandate;
  readonly targetCountryId: string;
  readonly kind: DeescalationMeasureKind;
  readonly date: string;
  readonly note: string;
}

export function validateDeescalationMeasure(m: DeescalationMeasure): void {
  if (!m || typeof m.id !== 'string' || !m.id.trim()) throw new Error('De-escalation measure needs a non-empty id.');
  if (typeof m.actorCountryId !== 'string' || !m.actorCountryId.trim()) throw new Error('De-escalation measure needs a non-empty actor country id.');
  if (typeof m.targetCountryId !== 'string' || !m.targetCountryId.trim()) throw new Error('De-escalation measure needs a non-empty target country id.');
  if (m.actorCountryId === m.targetCountryId) throw new Error('A de-escalation measure needs distinct actor and target.');
  if (!canConductDiplomacy(m.mandate)) throw new Error('A de-escalation measure needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  if (!DEESCALATION_MEASURE_KINDS.includes(m.kind)) throw new Error(`Unknown de-escalation measure kind: ${String(m.kind)}.`);
  if (!isSimulationDate(m.date)) throw new Error('De-escalation measure date must be a valid simulation date.');
  if (typeof m.note !== 'string' || !m.note.trim()) throw new Error('De-escalation measure needs a note.');
}

export type MediatorKind = 'country' | 'organization';
export type InformationBasis = 'sourced' | 'modelled' | 'unavailable';

export interface MediationOffer {
  readonly id: string;
  /** Country or organization offering mediation. */
  readonly mediatorId: string;
  readonly mediatorKind: MediatorKind;
  /** Office mandate when a country mediates; null for an organization (collective body). */
  readonly mediatorMandate: DiplomaticMandate | null;
  readonly partyAId: string;
  readonly partyBId: string;
  /** Non-omniscient: the mediator's explicit information basis; mediating never grants hidden access. */
  readonly informationBasis: InformationBasis;
  readonly date: string;
  readonly note: string;
}

export function validateMediationOffer(o: MediationOffer): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Mediation offer needs a non-empty id.');
  if (typeof o.mediatorId !== 'string' || !o.mediatorId.trim()) throw new Error('Mediation offer needs a non-empty mediator id.');
  if (!['country', 'organization'].includes(o.mediatorKind)) throw new Error(`Unknown mediator kind: ${String(o.mediatorKind)}.`);
  if (o.mediatorKind === 'country') {
    if (o.mediatorMandate === null) throw new Error('A country mediator needs an office mandate.');
    if (!canConductDiplomacy(o.mediatorMandate)) throw new Error('A country mediator needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  } else if (o.mediatorMandate !== null) {
    throw new Error('An organization mediator must not carry an office mandate (collective body).');
  }
  if (typeof o.partyAId !== 'string' || !o.partyAId.trim()) throw new Error('Mediation offer needs a non-empty party A id.');
  if (typeof o.partyBId !== 'string' || !o.partyBId.trim()) throw new Error('Mediation offer needs a non-empty party B id.');
  if (o.partyAId === o.partyBId) throw new Error('Mediation needs distinct parties.');
  if (o.partyAId === o.mediatorId || o.partyBId === o.mediatorId) throw new Error('A mediator must be distinct from both parties.');
  if (!['sourced', 'modelled', 'unavailable'].includes(o.informationBasis)) throw new Error(`Unknown information basis: ${String(o.informationBasis)}.`);
  if (!isSimulationDate(o.date)) throw new Error('Mediation offer date must be a valid simulation date.');
  if (typeof o.note !== 'string' || !o.note.trim()) throw new Error('Mediation offer needs a note.');
}
