// Autopilot persistent-state validator (schema 4 — autonomous technical validation).
//
// Deterministic, cheap consistency checks for .reasonix/projectatlas-autopilot-state.json.
// It does NOT run the application suite; it only validates the Autopilot state machine,
// human-acceptance record, autonomous technical-validation record, runtime-vs-metadata SHA
// distinction, standing authorization, blocker state and CI wait state.
//
// Run the validator directly (validates the real persisted state; exit 0 = consistent,
// 1 = violation, 2 = invalid JSON):
//   node .reasonix/autopilot-state-validator.mjs
// Run the tests with:
//   node --test .reasonix/autopilot-state-validator.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  'TECHNICALLY_VALIDATED',
  'AWAITING_HUMAN_ACCEPTANCE',
  'SEALED_SAFE_ZONE',
  'AWAITING_NEXT_MILESTONE_AUTHORIZATION',
  'NEXT_MILESTONE',
];

export const VALID_SAFETY_MODES = ['normal', 'unattended_safe'];
export const VALID_MODES = ['running', 'paused_by_user', 'complete', 'blocked'];
// Phases in which the Autopilot is waiting (on a human or the next milestone) rather
// than actively implementing; `mode = running` is contradictory with these.
const WAITING_PHASES = ['SEALED_SAFE_ZONE', 'AWAITING_HUMAN_ACCEPTANCE', 'AWAITING_NEXT_MILESTONE_AUTHORIZATION'];

// Milestones whose ordering matters for the "sealing may lag behind validation" rule.
const ORDERED_MILESTONES = [
  '0.22', '0.23', '0.24', '0.25', '0.26', '0.27', '0.28', '0.29', '0.30', '0.31', '0.32', '0.33', '0.34',
];
const milestoneIndex = (m) => ORDERED_MILESTONES.indexOf(m);

/**
 * Return a list of human-readable consistency violations. Empty array == consistent.
 * `state` is the parsed JSON object of the autopilot state file.
 */
export function validateAutopilotState(state) {
  const errors = [];
  const push = (message) => errors.push(message);

  if (state.schema !== 4) push(`state.schema must be 4 (autonomous-validation schema); got ${String(state.schema)}.`);
  if (!VALID_PHASES.includes(state.milestone_phase)) push(`Invalid milestone_phase: ${String(state.milestone_phase)}.`);
  if (state.safety_mode && !VALID_SAFETY_MODES.includes(state.safety_mode.mode)) {
    push(`Invalid safety_mode.mode: ${String(state.safety_mode.mode)}.`);
  }
  if (state.mode !== undefined && !VALID_MODES.includes(state.mode)) {
    push(`Invalid mode: ${String(state.mode)}.`);
  }
  if (state.mode === 'running' && WAITING_PHASES.includes(state.milestone_phase)) {
    push(`milestone_phase ${String(state.milestone_phase)} while mode is running (contradictory execution state).`);
  }

  const sealed = typeof state.sealed_milestone === 'string' && state.sealed_milestone.length > 0;
  const acceptance = Boolean(state.human_acceptance && typeof state.human_acceptance.accepted_milestone === 'string' && state.human_acceptance.accepted_milestone.length > 0);
  const nextAuthorized = Boolean(state.next_milestone_authorization && typeof state.next_milestone_authorization.authorized_milestone === 'string');
  const standing = Boolean(state.standing_authorization && Array.isArray(state.standing_authorization.scope) && state.standing_authorization.scope.length > 0);
  const avCurrent = state.autonomous_validation && state.autonomous_validation.current;

  // Sealed phases require a persisted human acceptance and a sealed milestone.
  if (state.milestone_phase === 'SEALED_SAFE_ZONE' || state.milestone_phase === 'AWAITING_NEXT_MILESTONE_AUTHORIZATION') {
    if (!acceptance) push(`${state.milestone_phase} without a recorded human acceptance.`);
    if (!sealed) push(`${state.milestone_phase} without a sealed milestone.`);
  }
  // A green CI / merge is not human acceptance.
  if (state.milestone_phase === 'AWAITING_HUMAN_ACCEPTANCE' && acceptance && state.human_acceptance.accepted_milestone === state.current_milestone) {
    push('AWAITING_HUMAN_ACCEPTANCE while acceptance is already recorded for the current milestone.');
  }

  // accepted milestone must match the sealed milestone.
  if (acceptance && sealed && state.human_acceptance.accepted_milestone !== state.sealed_milestone) {
    push(`accepted_milestone ${state.human_acceptance.accepted_milestone} differs from sealed_milestone ${state.sealed_milestone} without a transitional state.`);
  }
  if (acceptance && sealed && state.human_acceptance.accepted_runtime_sha && state.human_acceptance.accepted_runtime_sha !== state.sealed_sha) {
    push('accepted_runtime_sha differs from sealed_sha.');
  }

  // runtime_sha and last_safe_sha must agree (the autonomous build-on baseline).
  if (state.runtime_sha && state.last_safe_sha && state.runtime_sha !== state.last_safe_sha) {
    push('runtime_sha differs from last_safe_sha.');
  }

  // sealed_sha may lag behind runtime_sha only with an autonomous technical-validation
  // record for a milestone later than the sealed milestone.
  if (sealed && state.runtime_sha && state.sealed_sha !== state.runtime_sha) {
    const avMilestone = avCurrent && avCurrent.milestone;
    const sealedIdx = milestoneIndex(state.sealed_milestone);
    const avIdx = avMilestone ? milestoneIndex(avMilestone) : -1;
    if (!(avMilestone && sealedIdx !== -1 && avIdx > sealedIdx)) {
      push('sealed_sha differs from runtime_sha without an autonomous technical-validation record for a later milestone.');
    }
  }

  // A green CI must be recorded against the exact SHA being validated.
  if (state.ci_status === 'success' && state.ci_head_sha && state.runtime_sha && state.ci_head_sha !== state.runtime_sha) {
    push('ci_status=success while ci_head_sha differs from the validated runtime_sha.');
  }

  // The Safe Zone must not be moved to a metadata-only commit.
  if (sealed && state.metadata_head_sha && state.runtime_sha && state.sealed_sha === state.metadata_head_sha && state.runtime_sha !== state.metadata_head_sha) {
    push('sealed_sha points at the metadata-only HEAD rather than the validated runtime SHA.');
  }

  // TECHNICALLY_VALIDATED requires a complete autonomous_validation.current record.
  if (state.milestone_phase === 'TECHNICALLY_VALIDATED') {
    if (!avCurrent || typeof avCurrent.milestone !== 'string' || !avCurrent.runtime_sha) {
      push('TECHNICALLY_VALIDATED without a complete autonomous_validation.current record.');
    }
    if (avCurrent && avCurrent.accepted_by === 'human') {
      push('autonomous technical validation must never record accepted_by = human.');
    }
  }

  // Autonomous validation must never claim human acceptance (in any phase).
  if (avCurrent && avCurrent.accepted_by === 'human') {
    push('autonomous_validation.current records accepted_by = human (autonomous validation is not acceptance).');
  }

  // NEXT_MILESTONE requires either (sealed + human-accepted) or (standing authorization + previous milestone technically validated).
  if (state.milestone_phase === 'NEXT_MILESTONE') {
    const humanSealed = sealed && acceptance;
    const autonomousProgression = standing && Boolean(avCurrent && avCurrent.milestone && avCurrent.runtime_sha);
    if (!humanSealed && !autonomousProgression) {
      push('NEXT_MILESTONE phase without a sealed+accepted previous milestone or (standing authorization + autonomous technical validation).');
    }
    if (!nextAuthorized && !standing) {
      push('NEXT_MILESTONE phase without an explicit next-milestone authorization or standing authorization.');
    }
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

// CLI entry — `node .reasonix/autopilot-state-validator.mjs` validates the real state.
// Exit codes: 0 = consistent; 1 = consistency violation; 2 = invalid JSON.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let state;
  try {
    state = loadAutopilotState();
  } catch (error) {
    console.error(`Autopilot state is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const errors = validateAutopilotState(state);
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    console.error(`${errors.length} autopilot-state violation(s).`);
    process.exit(1);
  }
  console.log('Autopilot state is consistent.');
  process.exit(0);
}
