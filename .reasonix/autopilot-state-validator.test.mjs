import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAutopilotState, validateAutopilotState } from './autopilot-state-validator.mjs';

const base = () => loadAutopilotState();
const RT = 'a'.repeat(40);

test('the real persisted autopilot state is internally consistent', () => {
  assert.deepEqual(validateAutopilotState(base()), []);
});

test('detects a sealed phase without a recorded human acceptance', () => {
  const s = base();
  s.milestone_phase = 'SEALED_SAFE_ZONE';
  s.human_acceptance.accepted_milestone = null;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('without a recorded human acceptance')));
});

test('detects AWAITING_HUMAN_ACCEPTANCE while acceptance is already recorded for the current milestone', () => {
  const s = base();
  s.milestone_phase = 'AWAITING_HUMAN_ACCEPTANCE';
  s.human_acceptance.accepted_milestone = s.current_milestone;
  s.sealed_milestone = s.current_milestone;
  s.sealed_sha = s.runtime_sha;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('acceptance is already recorded')));
});

test('detects an accepted milestone differing from the sealed milestone', () => {
  const s = base();
  s.human_acceptance.accepted_milestone = '0.23';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('differs from sealed_milestone')));
});

test('detects the sealed SHA moved to a metadata-only HEAD', () => {
  const s = base();
  s.sealed_sha = s.metadata_head_sha;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('metadata-only HEAD')));
});

test('detects ci_status=success against a mismatched CI SHA', () => {
  const s = base();
  s.ci_status = 'success';
  s.ci_head_sha = '0'.repeat(40);
  assert.ok(validateAutopilotState(s).some((e) => e.includes('ci_head_sha differs')));
});

test('detects NEXT_MILESTONE without any authorization record', () => {
  const s = base();
  s.milestone_phase = 'NEXT_MILESTONE';
  s.next_milestone_authorization.authorized_milestone = null;
  s.standing_authorization = null;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('without an explicit next-milestone authorization')));
});

test('detects an active blocker with null stop_reason', () => {
  const s = base();
  s.active_blocker = 'BLOCKED_DESIGN';
  s.stop_reason = null;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('active_blocker present but stop_reason is null')));
});

test('detects stop_reason present without an active blocker', () => {
  const s = base();
  s.stop_reason = 'BLOCKED_DESIGN';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('stop_reason') && e.includes('no active_blocker')));
});

test('detects a stale BRANCH_CI wait with a terminal conclusion', () => {
  const s = base();
  s.milestone_phase = 'BRANCH_CI';
  s.ci_status = 'success';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('stale CI wait state')));
});

test('detects a review-round counter exceeding its locked maximum', () => {
  const s = base();
  s.review_campaign.full_review_round = 3;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('exceeds max_full_review_rounds')));
});

test('detects TECHNICALLY_VALIDATED without an autonomous_validation record', () => {
  const s = base();
  s.autonomous_validation.current = null;
  s.milestone_phase = 'TECHNICALLY_VALIDATED';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('TECHNICALLY_VALIDATED without a complete autonomous_validation.current record')));
});

test('detects autonomous validation mislabeled as human acceptance', () => {
  const s = base();
  s.milestone_phase = 'TECHNICALLY_VALIDATED';
  s.autonomous_validation.current = { milestone: '0.25', runtime_sha: RT, accepted_by: 'human' };
  assert.ok(validateAutopilotState(s).some((e) => e.includes('accepted_by = human')));
});

test('detects sealed_sha lagging behind runtime_sha without an autonomous record', () => {
  const s = base();
  s.autonomous_validation.current = null;
  s.runtime_sha = RT;
  s.last_safe_sha = RT;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('sealed_sha differs from runtime_sha')));
});

test('permits sealing to lag behind an autonomously validated milestone', () => {
  const s = base();
  s.runtime_sha = RT;
  s.last_safe_sha = RT;
  s.last_safe_milestone = '0.25';
  s.ci_head_sha = RT;
  s.ci_run_id = 999;
  s.autonomous_validation.current = { milestone: '0.25', runtime_sha: RT, ci_run_id: 999, validated_at: '2026-10-15' };
  s.milestone_phase = 'TECHNICALLY_VALIDATED';
  assert.deepEqual(validateAutopilotState(s), []);
});

test('permits NEXT_MILESTONE via standing authorization + autonomous validation (no human acceptance)', () => {
  const s = base();
  s.runtime_sha = RT;
  s.last_safe_sha = RT;
  s.last_safe_milestone = '0.25';
  s.ci_head_sha = RT;
  s.ci_run_id = 999;
  s.autonomous_validation.current = { milestone: '0.25', runtime_sha: RT, ci_run_id: 999, validated_at: '2026-10-15' };
  s.milestone_phase = 'NEXT_MILESTONE';
  s.next_milestone_authorization.authorized_milestone = null;
  assert.deepEqual(validateAutopilotState(s), []);
});

test('detects an invalid safety_mode', () => {
  const s = base();
  s.safety_mode.mode = 'yolo';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('safety_mode.mode')));
});

test('detects an invalid mode', () => {
  const s = base();
  s.mode = 'yolo';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('Invalid mode')));
});

test('detects a waiting phase while mode is running (contradictory execution state)', () => {
  const s = base();
  s.mode = 'running';
  s.milestone_phase = 'AWAITING_HUMAN_ACCEPTANCE';
  assert.ok(validateAutopilotState(s).some((e) => e.includes('contradictory execution state')));
});
