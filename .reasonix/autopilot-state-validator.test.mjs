import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAutopilotState, validateAutopilotState } from './autopilot-state-validator.mjs';

const base = () => loadAutopilotState();

test('the real persisted autopilot state is internally consistent', () => {
  assert.deepEqual(validateAutopilotState(base()), []);
});

test('detects a sealed phase without a recorded human acceptance', () => {
  const s = base();
  s.milestone_phase = 'SEALED_SAFE_ZONE';
  s.human_acceptance.accepted_milestone = null;
  assert.ok(validateAutopilotState(s).some((e) => e.includes('without a recorded human acceptance')));
});

test('detects AWAITING_HUMAN_ACCEPTANCE while acceptance is already recorded', () => {
  const s = base();
  s.milestone_phase = 'AWAITING_HUMAN_ACCEPTANCE';
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
  s.ci_head_sha = '0'.repeat(40);
  assert.ok(validateAutopilotState(s).some((e) => e.includes('ci_head_sha differs')));
});

test('detects NEXT_MILESTONE without an explicit authorization record', () => {
  const s = base();
  s.milestone_phase = 'NEXT_MILESTONE';
  s.next_milestone_authorization.authorized_milestone = null;
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
