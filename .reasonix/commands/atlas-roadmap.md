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
  documented status. Distinguish planned / implemented / pushed / CI-green /
  reviewed / merged / accepted, and start at the first authorized milestone that
  genuinely still needs work. Never rebuild a milestone already in the Safe Zone.
- **Roles** — separate Planner (read-only), Executor, and Reviewer (independent
  subagent/context) as the installed capabilities allow. The Reviewer inspects
  the real diff and classifies CERTAIN BUGS / PROBABLE RISKS / OPTIONAL
  IMPROVEMENTS.
- **GitHub CI is the gate** — push, wait for GitHub Actions, read the real
  result, and only advance on green. No local `npm run verify` / `npm test` /
  build / audit / benchmark by default; use only light local operations (reads,
  search, `git status`, `git diff`, `git diff --check`, Git).
- **Safe Zones** — maintain `LAST_SAFE_ZONE`; advance it only after a complete,
  reviewed, corrected milestone is merged to `main` with required checks green
  and no known critical defect. Progress never passes a known critical defect.
- **Loop breaker** — track failure signatures by root cause, not error text;
  `MAX_SAME_ROOT_CAUSE_REPAIR_CYCLES = 2`. Same root cause surviving two repair
  cycles -> CRYO_MODE, reason `REPEATED_ROOT_CAUSE`.
- **Cryo Mode** — on any critical problem / budget / design / contract /
  migration / external blocker: freeze at the last Safe Zone, produce the CRYO
  report, then STOP. Never work around a broken system, mark it TODO, add an
  arbitrary fallback, invent data, disable an invariant, weaken a test, or build
  the next milestone on top of the defect.
- **Budget/quota** — act on observable provider/quota signals only; enter
  CRYO_MODE with `BLOCKED_BUDGET` on provider refusal; no paid retry loops.
- **No unauthorized backlog expansion** — never invent 0.26+; the unnumbered
  post-0.25 backlog is not automatically authorized.
- **Persistent state** — update `.reasonix/projectatlas-autopilot-state.json` on
  material changes only; store no secrets in it or in Git.
- **End of roadmap** — when every numbered, authorized milestone is complete,
  produce the ROADMAP AUTOPILOT — COMPLETE report and stop; do not convert the
  unnumbered backlog into new versions.
