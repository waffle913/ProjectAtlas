#!/usr/bin/env node
/**
 * ci-wait — resumable, exact-SHA-verified, moderate GitHub Actions wait.
 *
 * Replaces ad-hoc background polling loops for the Roadmap Autopilot. It is
 * orchestration only: it never touches simulation runtime, never hides a
 * failure, and never weakens a validation gate.
 *
 * Properties (see docs/autopilot-protocol.md "CI wait" section):
 * - PERSISTENT: writes `.reasonix/ci-wait-state.json` on every poll, so a fresh
 *   session can resume without a blind re-poll.
 * - EXACT-SHA: refuses to wait on a run whose `head_sha` differs from the
 *   expected one (exit 2, status `sha_mismatch`).
 * - MODERATE: polls at `--interval-ms` (default 180000 = 3 min), with a
 *   `--max-checks` safety cap.
 * - EVENT WAKE is NOT used here (no webhook server exists); polling is the
 *   honest mechanism. If a webhook/event runtime becomes available, it may
 *   replace the loop, not complement it.
 *
 * Usage:
 *   node .reasonix/ci-wait.mjs --run-id <id> --head-sha <sha40> --branch <name> \
 *        [--interval-ms 180000] [--max-checks 60]
 *
 * Exit codes: 0 = terminal success; 1 = terminal failure/cancelled/timeout;
 * 2 = usage or head-SHA mismatch.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, '.reasonix', 'ci-wait-state.json');
const REPO = 'waffle913/ProjectAtlas';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

const runId = Number(arg('run-id', 0));
const headSha = arg('head-sha', '');
const branch = arg('branch', '');
const intervalMs = Number(arg('interval-ms', 180000));
const maxChecks = Number(arg('max-checks', 60));

if (!runId || !/^[0-9a-f]{40}$/.test(headSha) || !branch || !Number.isFinite(intervalMs) || intervalMs < 30000) {
  console.error('usage: node .reasonix/ci-wait.mjs --run-id <id> --head-sha <40-hex> --branch <name> [--interval-ms 180000] [--max-checks 60]');
  process.exit(2);
}

const loadState = () => existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
const saveState = (patch) => {
  const next = {
    workflow: 'verify',
    run_id: runId,
    head_sha: headSha,
    branch,
    ...patch,
    last_poll_at: new Date().toISOString(),
  };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + '\n');
};

async function fetchRun(id) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${id}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`run ${id} fetch HTTP ${res.status}`);
  return res.json();
}

// Resume: consume an already-recorded terminal result for this exact run, no re-poll.
const prior = loadState();
if (prior.run_id === runId && prior.head_sha === headSha && prior.conclusion) {
  console.log(`TERMINAL ${prior.conclusion} (recorded ${prior.last_poll_at})`);
  process.exit(prior.conclusion === 'success' ? 0 : 1);
}

console.log(`ci-wait run=${runId} sha=${headSha} branch=${branch} interval=${intervalMs}ms max=${maxChecks}`);

for (let check = 0; check < maxChecks; check++) {
  if (check > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  let run;
  try {
    run = await fetchRun(runId);
  } catch (error) {
    console.error(`fetch-error ${String(error)}`);
    continue; // transient network error: keep waiting within the cap.
  }
  if (run.head_sha !== headSha) {
    console.error(`HEAD SHA MISMATCH: expected ${headSha}, run ${run.id} is for ${run.head_sha}. Refusing to wait on the wrong run.`);
    saveState({ status: 'sha_mismatch', conclusion: null });
    process.exit(2);
  }
  console.log(`poll ${new Date().toISOString()} status=${run.status} conclusion=${run.conclusion}`);
  saveState({ status: run.status, conclusion: run.conclusion });
  if (run.status === 'completed') {
    console.log(`TERMINAL ${run.conclusion}`);
    process.exit(run.conclusion === 'success' ? 0 : 1);
  }
}
console.error('max-checks reached without a terminal status');
saveState({ status: 'timeout', conclusion: null });
process.exit(1);
