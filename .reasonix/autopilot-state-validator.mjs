// Autopilot persistent-state validator (hardening, schema 3).
//
// Deterministic, cheap consistency checks for .reasonix/projectatlas-autopilot-state.json.
// It does NOT run the application suite; it only validates the Autopilot state machine,
// human-acceptance record, runtime-vs-metadata SHA distinction, blocker state and CI wait state.
//
// Run the tests with:
//   node --test .reasonix/autopilot-state-validator.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'projectatlas-autopilot-state.json');

export const VALID_PHASES = [
  'BRANCH_SYNC',
  'IMPLEMENTING',
  'CONSOLIDATED_REVIEW',
  'CORRECTING_REVIEW_FINDINGS',
  'FINAL_VERIFICATION_REVIEW',
  'FINAL_CORRECTIONS',
  'TARGETED_VERIFICATION',
  'BRANCH_CI',
  'MERGE_TO_MAIN',
  'MAIN_CI',
  'AWAITING_HUMAN_ACCEPTANCE',
  'SEALED_SAFE_ZONE',
  'AWAITING_NEXT_MILESTONE_AUTHORIZATION',
  'NEXT_MILESTONE',
];

/**
 * Return a list of human-readable consistency violations. Empty array == consistent.
 * `state` is the parsed JSON object of the autopilot state file.
 */
export function validateAutopilotState(state) {
  const errors = [];
  const push = (message) => errors.push(message);

  if (state.schema !== 3) push(`state.schema must be 3 (hardened schema); got ${String(state.schema)}.`);
  if (!VALID_PHASES.includes(state.milestone_phase)) push(`Invalid milestone_phase: ${String(state.milestone_phase)}.`);

  const sealed = typeof state.sealed_milestone === 'string' && state.sealed_milestone.length > 0;
  const acceptance = Boolean(state.human_acceptance && typeof state.human_acceptance.accepted_milestone === 'string' && state.human_acceptance.accepted_milestone.length > 0);
  const nextAuthorized = Boolean(state.next_milestone_authorization && typeof state.next_milestone_authorization.authorized_milestone === 'string');

  // Sealed phases require a persisted human acceptance and a sealed milestone.
  if (state.milestone_phase === 'SEALED_SAFE_ZONE' || state.milestone_phase === 'AWAITING_NEXT_MILESTONE_AUTHORIZATION') {
    if (!acceptance) push(`${state.milestone_phase} without a recorded human acceptance.`);
    if (!sealed) push(`${state.milestone_phase} without a sealed milestone.`);
  }
  // A green CI / merge is not human acceptance: while explicitly awaiting acceptance, an
  // already-recorded acceptance is contradictory.
  if (state.milestone_phase === 'AWAITING_HUMAN_ACCEPTANCE' && acceptance) push('AWAITING_HUMAN_ACCEPTANCE while acceptance is already recorded.');

  // accepted milestone must match the sealed milestone (absent an explicit transitional state).
  if (acceptance && sealed && state.human_acceptance.accepted_milestone !== state.sealed_milestone) {
    push(`accepted_milestone ${state.human_acceptance.accepted_milestone} differs from sealed_milestone ${state.sealed_milestone} without a transitional state.`);
  }
  // The accepted runtime SHA and the recorded runtime SHA must agree with the sealed SHA.
  if (acceptance && sealed && state.human_acceptance.accepted_runtime_sha && state.human_acceptance.accepted_runtime_sha !== state.sealed_sha) {
    push('accepted_runtime_sha differs from sealed_sha.');
  }
  if (sealed && state.runtime_sha && state.runtime_sha !== state.sealed_sha) push('runtime_sha differs from sealed_sha.');

  // A green CI must be recorded against the exact SHA being validated.
  if (state.ci_status === 'success' && state.ci_head_sha && state.runtime_sha && state.ci_head_sha !== state.runtime_sha) {
    push('ci_status=success while ci_head_sha differs from the validated runtime_sha.');
  }

  // The Safe Zone must not be moved to a metadata-only commit.
  if (sealed && state.metadata_head_sha && state.runtime_sha && state.sealed_sha === state.metadata_head_sha && state.runtime_sha !== state.metadata_head_sha) {
    push('sealed_sha points at the metadata-only HEAD rather than the validated runtime SHA.');
  }

  // Starting the next milestone requires the previous milestone sealed AND accepted AND authorized.
  if (state.milestone_phase === 'NEXT_MILESTONE') {
    if (!sealed || !acceptance) push('NEXT_MILESTONE phase without the previous milestone sealed and accepted.');
    if (!nextAuthorized) push('NEXT_MILESTONE phase without an explicit next-milestone authorization record.');
  }

  // Active blocker and stop_reason must agree.
  if (state.active_blocker && (state.stop_reason === null || state.stop_reason === undefined)) push('active_blocker present but stop_reason is null.');
  if (state.stop_reason && !state.active_blocker) push(`stop_reason ${String(state.stop_reason)} present but no active_blocker.`);

  // blocked_head_sha must not point at an already-resolved historical blocker.
  if (state.blocked_head_sha && Array.isArray(state.blocker_history) && state.blocker_history.some((b) => b.head_sha === state.blocked_head_sha && b.resolved_at)) {
    push('blocked_head_sha refers to a blocker already recorded as resolved in blocker_history.');
  }

  // A CI WAIT phase must not carry a terminal recorded conclusion.
  if (state.milestone_phase === 'BRANCH_CI' && (state.ci_status === 'success' || state.ci_status === 'failure')) {
    push(`BRANCH_CI phase with a terminal ci_status=${String(state.ci_status)} (stale CI wait state).`);
  }

  // Review/repair counters must be within their locked bounds (never negative, never over the limit).
  const rc = state.review_campaign;
  if (rc) {
    if (!Number.isInteger(rc.full_review_round) || rc.full_review_round < 0) push('review_campaign.full_review_round must be a non-negative integer.');
    if (!Number.isInteger(rc.max_full_review_rounds) || rc.max_full_review_rounds < 1) push('review_campaign.max_full_review_rounds must be a positive integer.');
    if (rc.full_review_round > rc.max_full_review_rounds) push('review_campaign.full_review_round exceeds max_full_review_rounds.');
    if (!Number.isInteger(rc.reopen_count) || rc.reopen_count < 0) push('review_campaign.reopen_count must be a non-negative integer.');
    if (rc.reopen_count > rc.max_autonomous_post_seal_reopens) push('review_campaign.reopen_count exceeds max_autonomous_post_seal_reopens.');
  }

  return errors;
}

export function loadAutopilotState(path = STATE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
