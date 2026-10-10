---
description: Launch the ProjectAtlas roadmap-wide Autopilot objective
argument-hint: [optional authorization-boundary override]
---

# ProjectAtlas Roadmap Autopilot

Execute all currently authorized ProjectAtlas roadmap milestones in canonical
order, according to `docs/roadmap-submilestones.md` (what to build) and
`docs/autopilot-protocol.md` (how to build it autonomously). $ARGUMENTS

## Runtime

This is a long-running objective. Run it in **Goal mode** (Goal composer or
`/goal`). This command only supplies the objective text — it does not switch the
runtime to Goal. Do not treat a single answer as completion; report `update_goal`
(`continue` / `complete` / `blocked`) every turn, and keep going until a STOP
condition in the protocol.

## Rules this run must obey

- **Autonomous progression** — no re-authorization between micro-blocks,
  sub-milestones, or milestones inside the authorized roadmap. Stop only at the
  authorization boundary or a protocol STOP condition.
- **Startup** — inspect `main`, milestone branches, contracts, commits, CI, and
  documented state. Distinguish planned / implemented / pushed / CI-green /
  reviewed / merged / accepted / sealed, and start at the first authorized
  milestone that genuinely still needs work. Never rebuild a milestone already
  in the Safe Zone.
- **Startup branch synchronization** — before implementing or reviewing an old
  milestone branch, start from the current sealed Safe Zone, identify useful
  existing milestone commits, integrate/replay them cleanly (preserving their
  history), and establish the milestone review base. Stale red CI from a
  pre-sync branch is not a current failure signature.
- **Roles** — separate Planner (read-only), Executor, and Reviewer (independent
  subagent/context) as the installed capabilities allow. The Reviewer inspects
  the real diff and reports DEFECT FINDINGS / PROBABLE RISKS / OPTIONAL
  IMPROVEMENTS; the Planner/Autopilot then performs ROADMAP_IMPACT_TRIAGE
  (BLOCKING_CRITICAL / DEFERRED_DEFECT / TRIAGE_UNCERTAIN / OPTIONAL_IMPROVEMENT).
- **Milestone phase machine** — every milestone proceeds through
  `BRANCH_SYNC -> IMPLEMENTING -> CONSOLIDATED_REVIEW ->
  CORRECTING_REVIEW_FINDINGS -> FINAL_VERIFICATION_REVIEW ->
  FINAL_CORRECTIONS? -> TARGETED_VERIFICATION? -> BRANCH_CI -> MERGE_TO_MAIN ->
  MAIN_CI -> SEALED_SAFE_ZONE -> NEXT_MILESTONE`, persisting each transition.
  `NEXT_MILESTONE` means the previous milestone is sealed. On
  `NEXT_MILESTONE -> BRANCH_SYNC`, archive the previous `review_campaign` into
  `review_campaign_history` and initialize a fresh campaign for the new
  milestone (`full_review_round = 0`, flags false, `reopen_count = 0`) without
  erasing prior history.
- **Bounded review campaign** — maximum **two** full milestone review rounds
  (`MAX_FULL_MILESTONE_REVIEW_ROUNDS = 2`): one CONSOLIDATED_REVIEW, then one
  FINAL_VERIFICATION_REVIEW. After final corrections, only TARGETED_VERIFICATION
  (corrected lines, direct dependencies, regression surfaces) — never a third
  broad review. Exceeding this is CRYO_MODE with `REVIEW_CAMPAIGN_EXHAUSTED`.
- **Sealed Safe Zones** — a Safe Zone requires the full phase chain complete,
  branch CI green, integration into `main`, required `main` CI green, and no
  known blocking defect. Record the exact runtime SHA whose required checks are
  green; a metadata-only commit never replaces the runtime Safe-Zone SHA.
- **Evidence-only reopening** — after `SEALED_SAFE_ZONE`, no new general review
  starts merely because "another review could be useful". Reopen only on a
  concrete new event, persist `REOPENED_BY_EVIDENCE` + reason + evidence, and
  treat it as a targeted corrective campaign.
  `MAX_AUTONOMOUS_POST_SEAL_REOPENS = 1`; a second autonomous reopening is
  CRYO_MODE with `REVIEW_CAMPAIGN_EXHAUSTED`.
- **GitHub CI is the gate** — push, wait for GitHub Actions, read the real
  result, and only advance on green. No local `npm run verify` / `npm test` /
  build / audit / benchmark by default; use only light local operations (reads,
  search, `git status`, `git diff`, `git diff --check`, Git).
- **CI polling state machine** — poll the specific run for the exact expected
  head SHA; exit polling immediately on any terminal status (`completed`
  with success/failure/cancelled/timed_out/action_required), and treat a
  legitimate 20–30 minute verify as in-progress rather than hung.
- **Loop breaker** — track failure signatures by root cause, not error text;
  `MAX_SAME_ROOT_CAUSE_REPAIR_CYCLES = 2`. Same root cause surviving two repair
  cycles -> CRYO_MODE, reason `REPEATED_ROOT_CAUSE`. This is separate from the
  review-campaign breaker; both are persisted and never reset to look clean.
- **Reviewer capability negotiation** — the adapter is never pre-resolved
  without proof: while paused it is `resolve_on_resume` (identity/parameter
  null). At startup/resume, inspect the chosen capability's schema, adapt at
  most once, and persist `resolved` + identity + `task`/`arguments` only after
  a successful invocation. An invocation-schema failure is an orchestration
  failure, not a code repair cycle; if unresolvable enter CRYO_MODE with
  `BLOCKED_REVIEW_CAPABILITY`.
- **Bounded reviewer fan-out** — one lead consolidated review per round;
  specialist subagents only with non-overlapping scopes
  (`MAX_REVIEW_SUBAGENTS_PER_ROUND = 4`). Do not cascade replacement reviewers
  after schema failures.
- **Cryo Mode** — on any critical problem / budget / design / contract /
  migration / external blocker / `REVIEW_CAMPAIGN_EXHAUSTED` /
  `BLOCKED_REVIEW_CAPABILITY` / `UNATTENDED_CRITICAL_DEFECT` /
  `UNATTENDED_TRIAGE_UNCERTAIN`: freeze at the last Safe Zone, produce the CRYO
  report, then STOP. Never work around a broken system, mark it TODO, add an
  arbitrary fallback, invent data, disable an invariant, weaken a test, or build
  the next milestone on top of the defect.
- **Safety mode** — a persistent `safety_mode.mode` is `normal` or
  `unattended_safe`, enabled only by an explicit human instruction (never inferred
  from time of day, inactivity, or absence of messages). In `unattended_safe`, a
  `BLOCKING_CRITICAL` or `TRIAGE_UNCERTAIN` finding triggers immediate CRYO_MODE
  (`UNATTENDED_CRITICAL_DEFECT` / `UNATTENDED_TRIAGE_UNCERTAIN`) with **zero**
  autonomous repair attempts; a confident `DEFERRED_DEFECT` is recorded in
  `deferred_defects` with a deferral rationale and a concrete fix trigger and does
  not block progression. A simple deterministic implementation error (typo/import,
  obvious fixture mismatch, trivial serialization typo, unambiguous merge) may
  still be corrected automatically when the contract determines the fix.
- **Defect triage** — every detected defect is assigned exactly one disposition
  (`BLOCKING_CRITICAL` / `DEFERRED_DEFECT` / `TRIAGE_UNCERTAIN` /
  `OPTIONAL_IMPROVEMENT`) via `ROADMAP_IMPACT_TRIAGE` before any action. No
  anomaly may disappear silently: each ends in `fixed` / `deferred` /
  `blocked/cryo` / `disproved` / `human_waived`. Deferred defects are re-evaluated
  only at their fix trigger or a dependency boundary, never spontaneously.
- **Budget/quota** — act on observable provider/quota signals only; enter
  CRYO_MODE with `BLOCKED_BUDGET` on provider refusal; no paid retry loops.
  Persist an explicit `budget_status` at milestone boundaries
  (`checked_sufficient` / `checked_low` / `blocked` / `not_observable_to_agent`);
  do not invent a balance from conversation text or stale screenshots.
- **No unauthorized backlog expansion** — never invent 0.26+; the unnumbered
  post-0.25 backlog is not automatically authorized.
- **Metadata-only updates** — state-only/docs-only Autopilot commits do not
  trigger the heavy runtime verify (`.github/workflows/verify.yml` `paths-ignore`),
  and are never treated as a new runtime Safe Zone.
- **Persistent state** — update `.reasonix/projectatlas-autopilot-state.json`
  (schema v2) on material changes only; store no secrets in it or in Git; keep
  the audit trail of review/repair counters intact.
- **End of roadmap** — when every numbered, authorized milestone is complete,
  produce the ROADMAP AUTOPILOT — COMPLETE report and stop; do not convert the
  unnumbered backlog into new versions.

## Resuming in unattended safe mode

A human can resume the authorized roadmap in fail-safe mode with an explicit
instruction such as:

```text
Resume the authorized roadmap in UNATTENDED_SAFE_MODE.
```

On receipt: set persistent `safety_mode.mode = unattended_safe` with
`enabled_by = human`, continue from the first unfinished roadmap work, and obey
the unattended-safe rules until the human explicitly returns to normal mode.
No new milestone authorization is required — the existing roadmap authorization
remains intact.
