# ProjectAtlas Roadmap Autopilot — protocol

This document is the **canonical contract** for autonomous execution of the
ProjectAtlas roadmap by Reasonix. It does not replace the roadmap, the subsystem
contracts, `AGENTS.md`, `.github/copilot-instructions.md`, or
[the canonical agent handoff](agent-handoff.md); it governs **how Reasonix builds
the roadmap automatically**.

| Document | Responsibility |
| --- | --- |
| [Sub-milestone roadmap](roadmap-submilestones.md) | **What** to build (scope, ordering, decomposition). |
| This protocol | **How** Reasonix builds it autonomously (authorization, gates, stop rules). |
| Subsystem contracts / `AGENTS.md` / handoff | The locked engineering rules every micro-block must obey. |

Do not merge these responsibilities. The roadmap never authorizes implementation
on its own; this protocol never defines gameplay scope.

---

## 1. Purpose

The Roadmap Autopilot lets a human authorize a **single Goal** to execute every
currently authorized, numbered roadmap milestone in canonical order. After that
authorization, Reasonix works autonomously through:

```text
roadmap -> milestone -> micro-blocks -> review -> push -> GitHub CI
        -> corrections -> next milestone -> repeat
```

until one of the STOP conditions in §12 is reached.

Installing this protocol is not executing the roadmap. The roadmap starts only
when a human explicitly launches the Roadmap Goal.

---

## 2. Authorization unit: the whole authorized roadmap

The Roadmap Goal may receive a single global authorization such as:

> Execute all currently authorized ProjectAtlas roadmap milestones in canonical
> order.

When that authorization is given, Reasonix needs **no new authorization** between
two micro-blocks, two sub-milestones, or two milestones already inside the
authorized roadmap. Example: an authorized roadmap containing `0.24 -> 0.25` lets
the Goal complete `0.24`, validate it, and start `0.25` without waking the user
between the two.

The authorization boundary is therefore **the end of the currently authorized
numbered roadmap**.

- An unnumbered backlog item, or an explicitly not-authorized milestone, is
  **not** automatically authorized.
- Reasonix must never invent a new `0.26`, `0.27`, etc. The
  post-0.25 backlog in [the roadmap](roadmap-submilestones.md) stays an
  unnumbered register until a human fixes its order and authorizes it.

---

## 3. Startup: determine the first milestone that still needs work

At the start of a Roadmap Goal, Reasonix inspects:

- `main`;
- milestone branches;
- the contracts carried on those branches;
- commits and CI status;
- documented status (`planned`, `implemented on branch`, `pending independent
  review`, `validated`, `accepted`).

It must keep these statuses distinct — an agent's declaration, a commit actually
present, a green CI run, an independent review, and user acceptance are five
different things. A branch existing does not mean the milestone is done; an
implementation existing does not mean it is accepted.

Reasonix determines the **first authorized milestone that genuinely still needs
work**, then starts there. It never rebuilds a milestone already correctly
integrated into the Safe Zone.

---

## 4. Execution runtime: Reasonix Goal

Long Roadmap Autopilot runs use the **Goal** mechanism. Goal is the long-running
runtime: it keeps working until the objective is complete, blocked, paused, or
cleared. A single model answer is never, by itself, proof that the work is done.

- Start the objective in Goal mode (composer Goal mode, or `/goal`).
- The objective should be written as a task contract — Context, Request, Output
  format, Constraints, Pause policy — because Goal treats those sections as the
  boundary for autonomous work.
- The Goal reports its disposition every turn through the structured `update_goal`
  tool (`continue` / `complete` / `blocked`); a `blocked` report (or an
  evaluator failure) pauses instead of continuing silently.
- Where this Reasonix build provides an equivalent, newer runtime, prefer it while
  preserving the same guarantees.

---

## 5. Roles

Separate three roles as far as the installed Reasonix capabilities allow.

### Planner (read-only)

Reads the roadmap, contracts, and current state; establishes dependencies;
identifies micro-blocks, migrations, invariants, and regression surfaces; defines
the order; and prevents scope creep. **The Planner does not write code.**

Use the dedicated planner model (`[agent].planner_model`) or an isolated read-only
subagent when the build provides one.

### Executor

Modifies code; writes migrations and tests; updates affected documentation;
manages Git; fixes bugs; pushes commits; reads GitHub CI results. **Only one
functional micro-block is active at a time.**

### Reviewer

Inspects the **actual diff** as far as possible in a context separate from the
Executor (a subagent or dedicated review model). It never treats the Executor's
reasoning as proof. It hunts for:

- logic bugs; contract violations; double counting; conservation;
- determinism; migrations; save/reload; permanent IDs; provenance;
- `unavailable != 0`; `UNKNOWN != ABSTAIN`;
- Reality -> Government Information leaks; incorrect institutional authority;
- a duplicated engine; performance; cross-domain regressions; scope creep.

Findings are classified:

| Class | Meaning | Blocks progression? |
| --- | --- | --- |
| **CERTAIN BUGS** | Demonstrable defects. | Yes — must be fixed. |
| **PROBABLE RISKS** | Plausible defects needing a fix or sufficient proof. | Blocking until fixed or disproven. |
| **OPTIONAL IMPROVEMENTS** | Quality/refactor/performance not required for milestone conformance. | Not automatically blocking. |

Do not auto-promote optional improvements to mandatory work.

### Models

Use the models/providers actually available in this build. A reasonable split is
a competent economical model for the Executor and a more capable model for the
Planner/Reviewer, via Reasonix's planner model / subagent model / review subagent
mechanisms. **Never invent a model alias that does not exist and never hardcode a
provider configuration that would break the user's installation.** The repository
may reference existing aliases but must not contain their secrets; user/provider
configuration stays out of Git (see [reasonix-setup.md](reasonix-setup.md)).

---

## 6. Execution environment

### GitHub Actions is the primary executable validation environment

In Roadmap Autopilot, GitHub Actions is the primary validation environment. Do
**not** run locally by default:

- `npm run verify`, `npm test`, `npm run build`;
- npm audits or benchmarks;
- equivalent workloads via `npx`, `pnpm`, or `yarn`.

Do not bypass this rule by running the same workload under another local command.

### Allowed local operations

Reasonix may always use local, non-project, inexpensive operations: file reads,
search, static inspection, `git status`, `git diff`, `git diff --check`, Git
operations, and cheap tools that do not re-run the application suites.

### Explicit exception

The user may explicitly authorize a local run for a specific diagnostic. That
authorization must be explicit; it is not implied by the Goal.

---

## 7. Micro-blocks

The roadmap defines the functional decomposition. For each micro-block, Reasonix
records: scope included; scope excluded; canonical state touched; dependencies;
migration; invariants; required tests; risks. It implements the smallest coherent
unit, never swallowing several central engines in one patch, and commits small
enough for review, bisect, revert, and diagnosis — without artificially splitting
an atomic function into untestable pieces.

---

## 8. Git strategy per milestone

```text
main = LAST_SAFE_ZONE
        |
        v
milestone branch
        |
        v
micro commits -> review -> push -> GitHub CI -> green
        |
        v
merge to main -> main CI / required checks
        |
        v
NEW LAST_SAFE_ZONE
        |
        v
next milestone branch
```

Each main milestone has its own branch (e.g.
`waffle913-construction-assets-024`). Do not put the whole roadmap on one giant
branch.

---

## 9. Merge autonomy

When a milestone is complete, the Reviewer is satisfied, CERTAIN BUGS are fixed,
blocking risks are handled, and milestone CI is green, Reasonix may advance the
milestone toward `main` automatically:

- If the repository uses pull requests: open the PR, wait for required checks, and
  merge when GitHub allows it.
- If fast-forward/direct merge is the normal, authorized policy: use it.

Never bypass branch protection, force push, disable a check, or merge a red
branch. If `main` changed since the branch was created, synchronize cleanly. If
that synchronization introduces a material conflict or a new red CI, **do not
declare a Safe Zone**.

---

## 10. Safe Zone

Reasonix maintains a persistent `LAST_SAFE_ZONE`: the last state of ProjectAtlas
known to be sufficiently valid to base further development on. It records at
minimum: milestone, SHA, branch/ref, CI result, and date. Progress never advances
past a known critical defect.

A **new** Safe Zone requires all of:

- milestone complete;
- review complete;
- corrections complete;
- code integrated into `main`;
- required GitHub checks green;
- no known critical defect.

Only then update `LAST_SAFE_ZONE`, and only then start the next milestone.

---

## 11. No human wake-up for ordinary bugs

Do not wake the user for normal, self-inflicted problems: TypeScript/import/
compile errors, fixtures, tests, mocks, lint, ordinary red CI, bad names, local
algorithmic bugs, serialization problems whose solution the contract determines
unambiguously, trivial Git conflicts, or errors caused by Reasonix's own code.
These are the Autopilot's responsibility.

---

## 12. STOP conditions

The Goal continues until one of:

1. **End of authorized roadmap** (§17);
2. **Budget/quota insufficient** (§15);
3. **Critical problem** (§13);
4. **Real design ambiguity** (§14 — `BLOCKED_DESIGN`);
5. **Contract conflict** (§14 — `BLOCKED_CONTRACT`);
6. **Indispensable external dependency unavailable** (§14 — `BLOCKED_EXTERNAL`);
7. **Destructive/migration ambiguity** (§14 — `BLOCKED_MIGRATION`);
8. **Repeated root cause** (§13.4 — `REPEATED_ROOT_CAUSE`).

---

## 13. Repair cycle, loop breaker, and critical problems

### 13.1 Repair cycle 1

On first occurrence of a problem: identify the cause, produce a fix, push, wait
for CI. If the problem disappears, continue.

### 13.2 Failure signature

Identify a **failure signature** from the root cause, not just the exact error
text: same test, same invariant, same corruption type, same migration, same
interaction, same faulty architecture, same functional behavior.

### 13.3 Root cause review and repair cycle 2

If the same problem returns after repair cycle 1, do not apply another similar
patch. Mandatory: re-read the contracts, re-read the diff, use an independent
Reviewer/subagent if possible, determine why the first fix was insufficient, and
propose a **materially different** approach. Then perform **repair cycle 2** with
that second strategy: push, wait for CI.

### 13.4 Two failures = critical blocker

ProjectAtlas default: `MAX_SAME_ROOT_CAUSE_REPAIR_CYCLES = 2`.

If the same root cause survives two repair cycles, **stop automatically**. No
repair #3/#4/#12, no "just one last patch". Enter `CRYO_MODE` with reason
`REPEATED_ROOT_CAUSE`.

### 13.5 Indirect loops

Recognize a loop even when the error changes shape (A breaks -> fix A -> B breaks
-> fix B -> A breaks again; or migration fails -> fix -> determinism fails -> fix
-> migration fails again). If the errors belong to the same architectural loop,
treat them as the same root cause. Do not let the agent spend indefinitely because
error messages differ slightly.

### 13.6 Critical problems

A critical problem makes further development unsafe. Examples: a violated
canonical invariant; broken conservation; money/population/stocks/equipment
created or lost artificially; save corruption; an ambiguous destructive
migration; broken determinism; compromised Country/Region IDs; incoherent
ownership/control/occupation; a duplicated canonical engine; an impossible
validated contract; real design ambiguity; an indispensable external datum
missing; the same root cause surviving two repairs; a fundamental bug future
systems depend on.

### 13.7 Absolute rule

**Never advance the roadmap past a known critical defect.** Never work around the
broken system, mark it TODO and continue, add an arbitrary fallback, invent data,
disable an invariant, weaken a test, create a second engine, or build the next
milestone on top of the defect. On a critical problem: **ROADMAP FREEZE**.

### 13.8 Preserve the unsafe work

Do not destroy the evidence needed to analyze the problem: keep the Safe Zone
intact in `main`, keep the problematic branch, commits, proofs, CI, and diff.
Record `last_safe_sha` and `blocked_head_sha` (when one exists). **Never merge
`blocked_head_sha` into `main`.**

---

## 14. Cryo Mode and blockers

### 14.1 CRYO_MODE

When active, Reasonix: adds no new features; starts no next milestone; makes no
further expensive exploratory attempts; does no opportunistic refactoring or
workarounds; consumes no tokens just to "try again". It preserves state, produces
one wake-up report (§16), then **STOPs**.

`CRYO_MODE` reasons:

| Reason | Trigger |
| --- | --- |
| `BLOCKED_CRITICAL` | A critical problem (§13.6) not covered by a more specific blocker. |
| `REPEATED_ROOT_CAUSE` | Same root cause survived two repair cycles (§13.4). |
| `BLOCKED_BUDGET` | Provider refuses for credits/quota/spending limit/balance; or remaining budget is insufficient to finish a unit (§15). |
| `BLOCKED_DESIGN` | Several genuinely possible gameplay behaviors and no validated code/roadmap/contract/handoff decides (§14.2). |
| `BLOCKED_CONTRACT` | Milestone cannot reasonably be implemented without breaking a validated contract (§14.3). |
| `BLOCKED_MIGRATION` | A migration/transformation could lose data, invent history, break saves, or arbitrarily change IDs, and no canonical rule decides (§14.4). |
| `BLOCKED_EXTERNAL` | An indispensable source/service/GitHub/provider/dependency is unavailable and the contract does not honestly allow `unavailable`/`partial`/other planned behavior (§14.5). |

### 14.2 Design blocker

Wake the user when several genuinely possible gameplay behaviors exist and
neither validated code, roadmap, contract, AGENTS, nor handoff decides. Reasonix
does not choose arbitrarily. `CRYO_MODE` reason `BLOCKED_DESIGN`.

### 14.3 Contract blocker

If the milestone cannot reasonably be implemented without breaking a validated
contract: STOP, `BLOCKED_CONTRACT`. Never silently modify the contract to make the
code pass.

### 14.4 Destructive data/migration blocker

If a migration/transformation could lose data, invent history, break saves,
arbitrarily modify IDs, or reinterpret historical data, and no canonical rule
decides: STOP, `BLOCKED_MIGRATION`.

### 14.5 External blocker

If a genuinely indispensable resource is inaccessible and the contract does not
honestly permit `unavailable`, `partial`, or another planned behavior: STOP,
`BLOCKED_EXTERNAL`. Do not invent a substitute.

---

## 15. Budget / quota breaker

Reasonix monitors only the quota/cost information its provider and build actually
expose (for example Goal statistics, `/goal status`, and the real provider
refusal). It never invents a credit measure that is not observable.

- If the remaining budget/quota is observable, avoid starting a new unit when it
  is insufficient to finish that unit reasonably, and preserve a diagnostic
  reserve where a reserve configuration exists.
- If the provider refuses a request for insufficient credits / exhausted quota /
  spending limit / depleted balance, enter `CRYO_MODE` immediately with
  `BLOCKED_BUDGET`. Do not run a series of paid retries.
- If exact financial telemetry is not available, document that limitation. The
  minimal breaker remains the real provider/quota error.

---

## 16. Persistent state

Reasonix maintains a persistent state machine at
`.reasonix/projectatlas-autopilot-state.json`. It survives Reasonix shutdown,
restart, conversation loss, model change, and human intervention. It contains at
minimum:

```text
mode
roadmap_id
current_milestone
current_block
last_safe_milestone
last_safe_sha
current_branch
blocked_head_sha
ci_status
repair_signatures
repair_cycles
budget_status
stop_reason
```

Never store secrets in it. Update it on material changes only — new milestone,
new micro-block, push, CI, repair cycle, new Safe Zone, Cryo — not on every
internal thought, and never as a Git commit per thought.

---

## 17. Cryo notification

On Cryo, produce exactly one report complete enough to wake a human:

```text
# PROJECTATLAS AUTOPILOT — CRYO

Status:
`BLOCKED_CRITICAL / BLOCKED_BUDGET / BLOCKED_DESIGN / BLOCKED_CONTRACT /
BLOCKED_MIGRATION / BLOCKED_EXTERNAL / REPEATED_ROOT_CAUSE`

Last safe milestone:
`0.xx`

Last safe commit:
`SHA`

Current milestone/block:
`0.xx.y`

Current branch:
`branch`

Blocked HEAD:
`SHA / none`

Problem:
concise description.

Why roadmap progression is unsafe:
contract / invariant / dependency affected.

Evidence:
CI, diff, error, invariant, reproduction.

Repair cycle 1:
approach + result.

Repair cycle 2:
different approach + result.

Why automatic attempts stopped:
circuit breaker.

Repository state:
safe main + blocked branch.

Decision required:
only the real human decision needed.

Autopilot action:
`ROADMAP FROZEN AT LAST_SAFE_ZONE`
```

Then STOP.

---

## 18. Human wake-up

After human intervention, do not restart from scratch:

1. read the Autopilot state;
2. re-read the Safe Zone;
3. read the blocked branch;
4. apply the decision/correction;
5. push;
6. wait for CI;
7. if green, update the Safe Zone when justified;
8. exit Cryo;
9. resume at the first unfinished micro-block.

Never redo validated milestones merely because a new session started.

---

## 19. End-of-milestone review and CI

Before the final push of a milestone, do a full milestone review. The Reviewer
seeks **all** detectable defects in the pass, not just the first two — avoid the
"2 bugs -> fix -> 3 older bugs -> fix -> 4 more" spiral, seeking reasonably
exhaustive coverage before the correction campaign.

After review and corrections: push, then wait for CI. Reasonix never treats its
own inspections as a replacement for GitHub Actions, and never re-runs the same
suites locally just to duplicate GitHub.

A CI failure that is clearly external infrastructure (unrelated to the code) may
be re-run without a change and does not count as a code repair cycle. If the
infrastructure stays unavailable and blocks validation: `BLOCKED_EXTERNAL`, Cryo
at the last Safe Zone.

---

## 20. Roadmap progression and end of roadmap

When milestone N becomes the new Safe Zone, Reasonix may immediately identify
milestone N+1, create its branch, read its contracts, plan, and begin — no
intermediate user confirmation if N+1 is already inside the authorized roadmap.

When every numbered, authorized milestone is complete: STOP. Do not convert the
unnumbered backlog into new versions. Produce:

```text
# PROJECTATLAS ROADMAP AUTOPILOT — COMPLETE
```

with the final Safe Zone, final SHA, milestones processed, commits, CI,
migrations, limitations, data coverage, residual risks, and optional
improvements. Then wait for the user.

---

## 21. Anti-spin

Autonomy never means repeating the same action indefinitely. If no material
progress is made: reduce the problem, identify the root cause, change approach,
consult a Reviewer, re-read the contract. Configure Reasonix's stall/Goal
mechanisms where the build provides them. Apparent progress from new patches is
not real progress if the same invariant stays broken.
