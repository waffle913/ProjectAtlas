/**
 * 0.32 — Media V2 runtime integration over the canonical politics opinion owner.
 *
 * A dated, causal opinion shift mutates the canonical `politics.regionalOpinion`
 * cohort sentiment (the 0.13 signed opinion value), bounded to the canonical
 * sentiment range and carrying the material event/statement id that caused it —
 * never a magic modifier. The reality / government-information / public-
 * perception layer distinction is preserved: this module only touches the public
 * opinion store and never writes government-only intelligence.
 */

import type { SimulationState } from '../../types';
import { COHORT, type CohortPoliticalOpinion } from '../politics/model';
import { validateOpinionShift, type OpinionShift } from './opinion';

/** The canonical 0.13 sentiment value is signed and bounded to [-10000, 10000]. */
const clampSentiment = (value: number): number => Math.max(-10000, Math.min(10000, value));

/** Apply a dated, causal opinion shift to the canonical cohort sentiment(s).
 *  `cohortKey === null` applies the shift to the whole Region's cohorts. The
 *  shift is clamped to the canonical signed sentiment range; population is never
 *  affected. Unknown Region/cohort fails closed. */
export function applyOpinionShiftToPolitics(state: SimulationState, shift: OpinionShift): SimulationState {
  validateOpinionShift(shift);
  const regional = state.politics.regionalOpinion[shift.regionId];
  if (!regional) throw new Error('Unknown political Region opinion.');
  const keys = shift.cohortKey !== null ? [shift.cohortKey] : Object.keys(regional.cohorts).sort();
  if (keys.some((key) => !regional.cohorts[key])) throw new Error('Unknown political cohort.');
  const cohorts = { ...regional.cohorts };
  for (const key of keys) {
    const opinion = [...regional.cohorts[key]];
    opinion[COHORT.sentiment] = clampSentiment(opinion[COHORT.sentiment] + shift.deltaBps);
    cohorts[key] = opinion as CohortPoliticalOpinion;
  }
  return {
    ...state,
    politics: { ...state.politics, regionalOpinion: { ...state.politics.regionalOpinion, [shift.regionId]: { ...regional, cohorts } } },
  };
}
