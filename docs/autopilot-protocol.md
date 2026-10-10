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
8. **Repeated root cause** (§13.4 — `REPEATED_ROOT_CAUSE`);
9. **Review campaign exhausted** (§23/§25 — `REVIEW_CAMPAIGN_EXHAUSTED`);
10. **Reviewer capability unavailable** (§27 — `BLOCKED_REVIEW_CAPABILITY`);
11. **Unattended critical defect** (§37 — `UNATTENDED_CRITICAL_DEFECT`);
12. **Unattended uncertain propagation** (§37 — `UNATTENDED_TRIAGE_UNCERTAIN`).

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
| `REVIEW_CAMPAIGN_EXHAUSTED` | Another broad review would exceed the two-round limit; targeted verification after final corrections still finds a blocker; or a sealed milestone would need more autonomous reopenings than allowed (§23/§25). |
| `BLOCKED_REVIEW_CAPABILITY` | The required independent reviewer interface cannot be invoked reliably after the bounded adapter resolution attempts (§27). |
| `UNATTENDED_CRITICAL_DEFECT` | A critical current defect or credible critical downstream/cascade risk was detected while `unattended_safe` is active (§37); no autonomous corrective attempt is made. |
| `UNATTENDED_TRIAGE_UNCERTAIN` | A detected anomaly cannot be safely classified as local/deferable versus critically propagating while `unattended_safe` is active (§37); no guessing, no speculative repair. |

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

The following are all spin and are prohibited autonomously:

- repeated broad reviews after the review campaign is exhausted;
- repeated post-seal reopenings;
- alternating reviewer schemas indefinitely;
- spawning replacement reviewers after repeated schema failures;
- polling a terminal CI run;
- repeatedly validating metadata-only Safe-Zone commits with the full runtime suite;
- repeatedly re-reading the same diff without a new evidence trigger.

"New activity" is not necessarily "material progress".

---

# Hardening (schema v2)

This part tightens the protocol based on the live 0.22–0.23 run. It is normative
and supersedes the earlier sections wherever they conflict. It does not retroactively
rewrite how earlier milestones were actually run; it governs every milestone from
the moment the schema-v2 state is adopted.

## 22. Milestone phase machine

A milestone must progress through this explicit phase machine, and every phase
transition is persisted in the Autopilot state on material changes:

```text
BRANCH_SYNC
-> IMPLEMENTING
-> CONSOLIDATED_REVIEW
-> CORRECTING_REVIEW_FINDINGS
-> FINAL_VERIFICATION_REVIEW
-> FINAL_CORRECTIONS              (only if needed)
-> TARGETED_VERIFICATION          (only if FINAL_CORRECTIONS occurred)
-> BRANCH_CI
-> MERGE_TO_MAIN
-> MAIN_CI
-> SEALED_SAFE_ZONE
-> NEXT_MILESTONE
```

`NEXT_MILESTONE` means the previous milestone is **sealed**. A sealed milestone
cannot receive a spontaneous new general review. Do not set `current_milestone`
to the next milestone and then continue reviewing the previous milestone.

On the `NEXT_MILESTONE -> BRANCH_SYNC` transition, before any work on the new
milestone begins: archive the previous milestone's `review_campaign` verbatim
(counters, findings, reopen record) into `review_campaign_history`, then
initialize a fresh `review_campaign` for the new milestone with
`full_review_round = 0`, `final_verification_complete = false`,
`targeted_verification_complete = false`, `reopen_count = 0`, and empty
findings/late-blocking lists. The prior history is never erased. The fresh
campaign is initialized only at this transition (resume/`BRANCH_SYNC`), not
beforehand and not at pause time.

## 23. Bounded review campaign

Defaults:

```text
MAX_FULL_MILESTONE_REVIEW_ROUNDS = 2
MAX_AUTONOMOUS_POST_SEAL_REOPENS = 1
```

### Round 1 — CONSOLIDATED_REVIEW

One comprehensive independent milestone review. The reviewer inspects the actual
milestone delta and attempts to report **all detectable issues in one pass**,
grouped as CERTAIN BUGS / PROBABLE RISKS / OPTIONAL IMPROVEMENTS. It does not stop
after the first few findings.

- All CERTAIN BUGS block.
- All PROBABLE RISKS block until fixed, disproved with sufficient evidence, or
  explicitly waived by the human.
- The contradictory label "non-blocking probable risk" is forbidden: if a finding
  is non-blocking it is an OPTIONAL IMPROVEMENT or a documented residual limitation.

### Round 2 — FINAL_VERIFICATION_REVIEW

After the Round-1 correction campaign, one last independent **general** review of
the milestone. This is the final general review.

If Round 2 finds blocking issues:

1. gather all Round-2 blocking findings;
2. perform one consolidated `FINAL_CORRECTIONS` campaign;
3. perform `TARGETED_VERIFICATION`.

`TARGETED_VERIFICATION` may inspect the corrected lines, directly affected
invariants, direct dependencies, and regression surfaces caused by those
corrections. It must **not** silently expand into Round 3 of a full milestone
review.

If targeted verification still demonstrates a blocking defect, or confidence
requires another general review:

```text
CRYO_MODE
reason = REVIEW_CAMPAIGN_EXHAUSTED
```

No Round 3 / Round 4 / Round 5 general review is permitted autonomously. The fact
that each new review finds a *different* bug does not bypass this breaker.

## 24. Sealed Safe Zones

A new Safe Zone requires all of:

1. milestone scope complete;
2. Round 1 complete;
3. Round-1 corrections complete;
4. Round 2 complete;
5. final corrections complete if needed;
6. targeted verification complete if needed;
7. milestone branch CI green;
8. integration into `main`;
9. required `main` CI green;
10. no known blocking defect.

A sealed Safe Zone may contain documented deferred defects; it never contains an
unresolved `BLOCKING_CRITICAL` or a `TRIAGE_UNCERTAIN` with plausible critical
propagation. The Safe-Zone report summarizes the count of open deferred defects.

Only then:

```text
milestone_phase = SEALED_SAFE_ZONE
sealed_milestone = <milestone>
sealed_sha = <exact green runtime SHA on main>
last_safe_milestone = <same milestone>
last_safe_sha = <same exact runtime SHA>
```

The exact SHA whose required checks are green is the Safe-Zone SHA. Do not record
an older SHA if later runtime corrections for the same milestone were added. A
subsequent metadata-only Autopilot commit does **not** replace the runtime
Safe-Zone SHA.

## 25. Evidence-only reopening

After `SEALED_SAFE_ZONE`, no new general review may start merely because "another
review could be useful". A sealed milestone may be reopened autonomously only for
a concrete new event:

- required CI on the sealed runtime state becomes red;
- the next milestone exposes a reproducible regression in the sealed milestone;
- a newly triggered invariant/test supplies concrete evidence;
- synchronization/merge changed validated behavior;
- a concrete external report demonstrates a critical defect;
- explicit human request.

Before reopening, persist:

```text
milestone_phase = REOPENED_BY_EVIDENCE
reopened_milestone
reopen_reason
reopen_evidence
reopen_count
```

A post-seal reopening is a **targeted corrective campaign**, not a fresh unlimited
review campaign. Default `MAX_AUTONOMOUS_POST_SEAL_REOPENS = 1`. If the same sealed
milestone would need a second autonomous reopening before meaningful progress on
the next milestone:

```text
CRYO_MODE
reason = REVIEW_CAMPAIGN_EXHAUSTED
```

A human may explicitly authorize another reopening.

## 26. Root-cause breaker remains separate

Preserve `MAX_SAME_ROOT_CAUSE_REPAIR_CYCLES = 2`. This protects against
`A -> fix A -> A returns`. The review-campaign breaker protects against
`review -> new A -> review -> new B -> review -> new C -> ...`. These are separate
counters and both are persisted.

Do not erase repair history merely because the latest CI becomes green. Resolved
signatures may be marked resolved; they must not disappear from the audit trail
for the active milestone.

## 27. Reviewer capability negotiation

At Goal startup, resolve **one** usable reviewer invocation interface and persist:

```text
review_capability_adapter:
  capability_identity
  invocation_parameter
  resolved_at
  status
```

The adapter is **never pre-resolved without proof of a successful invocation**.
While paused or before the Goal starts, its `status` is `resolve_on_resume` (or
`unresolved`) and `capability_identity` / `invocation_parameter` are null. Only
at Goal startup/resume does the Autopilot inspect the schema of the reviewer
capability it will actually use, perform at most the bounded adaptation below,
and — only after a **successful** reviewer invocation — persist
`status = resolved` together with the identity and the exact `task` or
`arguments` parameter that worked. A `resolved` adapter is never recorded from
an assumption, a stale run, or a failed/interrupted invocation.

Rules:

1. Never assume globally that the parameter is `task`.
2. Never assume globally that the parameter is `arguments`.
3. Inspect the capability/runtime schema when available.
4. Use one selected reviewer interface consistently throughout a review campaign.
5. An invocation-schema failure is an **orchestration failure**, not a ProjectAtlas
   code finding and not a code repair cycle.
6. If the first attempt fails and the runtime explicitly states the accepted
   parameter, adapt once and persist the working adapter only after a successful
   invocation confirms it.
7. Do not alternate indefinitely `task -> arguments -> task -> arguments`.
8. If the same named `review` capability later presents a contradictory/unresolvable
   schema, either switch once to a distinct known reviewer interface and persist
   that identity, or enter Cryo.

Blocker: `BLOCKED_REVIEW_CAPABILITY` — used when an independent reviewer cannot be
invoked reliably after the bounded adapter resolution attempts. An interrupted
reviewer does **not** count as a completed review round.

## 28. Reviewer fan-out and subagent cost control

A review round has one lead consolidated review. Specialist subagents may be used
only when their scopes are explicitly non-overlapping. Default:

```text
MAX_REVIEW_SUBAGENTS_PER_ROUND = 4
```

Do not spawn many broad reviewers all independently rereading the same full diff.
If more than four are genuinely necessary, record why, ensure scopes are distinct,
and verify budget telemetry if accessible before spawning them. A schema-failed or
interrupted subagent must not trigger a cascade of replacement subagents.

## 29. Review the milestone delta, not unrelated branch noise

Persist:

```text
milestone_scope_base_sha
milestone_branch_head_sha
carried_commits
carried_unrelated_scope
```

Before implementing or reviewing an old milestone branch:

1. start from the current sealed Safe Zone;
2. identify useful existing milestone commits;
3. integrate/replay them cleanly;
4. preserve their authorship/history as reasonably possible;
5. establish the milestone review base;
6. only then continue implementation.

Reviewers focus on the actual milestone delta. If an inherited branch carries
unrelated deliverables, identify them explicitly instead of treating the whole
noisy merge as newly authored milestone scope. (The 0.23 integration carried
unrelated playable-shell/Tauri and prior refinements; the 0.24.1A commit lives on
a stale base and must be replayed, not re-reviewed as new.)

## 30. GitHub CI polling state machine

Never use a blind long wait as the primary CI control. For each CI gate persist:

```text
ci_run_id
ci_head_sha
ci_branch
ci_status
ci_last_checked_at
```

Poll the **specific run for the exact expected head SHA**. Behavior:

```text
queued / waiting / in_progress
    -> wait a reasonable polling interval
    -> poll again

completed + success
    -> exit polling immediately
    -> continue

completed + failure / cancelled / timed_out / action_required
    -> exit polling immediately
    -> diagnose or apply blocker rules
```

Do not sleep for hundreds of additional seconds after a terminal status is already
known. Do not use a short global timeout that treats a legitimate 20–30 minute
ProjectAtlas verify as hung. If the run id or head SHA changes unexpectedly,
reconcile that explicitly rather than silently waiting on the wrong run.

## 31. CI failures and repair accounting

A red CI is not automatically the same root cause as the previous red CI. For each
failure: identify the root-cause signature, persist it, associate the CI run id and
SHA, and count repairs by root cause. Infrastructure-only failures may be rerun
without consuming a code repair cycle. Stale CI from a branch created before the
current Safe Zone does not count as a failure of the synchronized milestone.

## 32. Avoid metadata-only full CI runs

The `.github/workflows/verify.yml` workflow uses `paths-ignore` so that a push/PR
containing **only** Autopilot/documentation metadata does not run the heavy runtime
verify. Ignored paths are at least:

```text
.reasonix/**
docs/**
README.md
AGENTS.md
.github/copilot-instructions.md
```

Do **not** ignore runtime/source files, package files, data/scripts, build
configuration, or `.github/workflows/verify.yml` itself. `paths-ignore` semantics
must ensure that a commit changing both ignored metadata and runtime code still
runs verify. The Safe Zone runtime SHA stays the exact runtime code SHA that passed
CI; a later state-only metadata commit may record that Safe Zone without causing
another 20–30 minute simulation validation cycle.

## 33. Branch CI vs main CI

Runtime milestone code must be validated before integration, and the integrated
runtime state must be validated on `main`. Do not remove the `main` gate merely to
save time. However: do not add extra heavy CI solely because the Autopilot state
file was updated; do not create repeated "record Safe Zone" runtime-verification
loops; a state-only metadata commit is not a new runtime Safe Zone.

## 34. Budget state must be explicit

`budget_status = "not_checked"` must not silently persist forever if the runtime
has an accessible billing/quota capability. At milestone boundaries, persist one of:

```text
checked_sufficient
checked_low
blocked
not_observable_to_agent
```

Include the observation source/time when available. If wallet information is
visible only to the human UI and not programmatically accessible to Reasonix,
record `not_observable_to_agent`. Do not invent the balance from conversation text
or stale screenshots. Provider refusal for exhausted funds/quota still immediately
triggers `BLOCKED_BUDGET`; no paid retry loop.

## 35. Persistent state schema v2

The state at `.reasonix/projectatlas-autopilot-state.json` uses schema 2 with at
least the fields listed in §17 of the hardening patch (schema, mode, roadmap_id,
current_milestone, current_block, milestone_phase, last_safe_*, sealed_*,
current_branch, milestone_scope_base_sha, milestone_branch_head_sha,
carried_commits, blocked_head_sha, ci_*, review_campaign, review_campaign_history,
review_capability_adapter, repair_signatures, repair_cycles, budget_status,
budget_observation, stop_reason, max_same_root_cause_repair_cycles, updated_at,
notes). Material history remains auditable; review/repair counters are not reset
merely to make the state look clean.

## 36. Cryo reasons

In addition to the existing reasons, add:

- `REVIEW_CAMPAIGN_EXHAUSTED` — another broad review would exceed the two-round
  limit; targeted verification after final corrections still finds a blocker; or
  a sealed milestone would require more autonomous reopenings than allowed.
- `BLOCKED_REVIEW_CAPABILITY` — the required independent reviewer interface cannot
  be invoked reliably after bounded adapter resolution.
- `UNATTENDED_CRITICAL_DEFECT` — a critical current defect or credible critical
  downstream/cascade risk was detected while `unattended_safe` is active; the
  Autopilot preserves evidence and stops with zero autonomous corrective attempts.
- `UNATTENDED_TRIAGE_UNCERTAIN` — a detected anomaly cannot be safely classified as
  local/deferable versus critically propagating while `unattended_safe` is active;
  the Autopilot stops instead of guessing or attempting speculative repairs.

Cryo reports include the review campaign counts and review adapter state when
relevant.

---

# Part C — Unattended Safe Mode + Deferred Defect Register

## 37. Operating safety mode

A persistent `safety_mode` field is separate from the Goal running/paused state:

```text
safety_mode:
  mode: normal | unattended_safe
  enabled_by: human
  enabled_at
  note
```

- `normal` — existing schema-v2 behavior; ordinary autonomous repair cycles apply.
- `unattended_safe` — the fail-safe rules in this part apply. It is a fail-safe
  mode, not a budget limiter, and it stays active until the human explicitly
  changes it.

Unattended mode is **never inferred** from time of day, inactivity, context
percentage, or absence of messages. Only an explicit human instruction enables or
disables it. Installing this patch leaves the Goal paused and `safety_mode`
inactive/normal; the human enables `unattended_safe` when resuming for the night.

## 38. Defect triage model

Every detected anomaly/finding is first assigned exactly one disposition:

```text
BLOCKING_CRITICAL
DEFERRED_DEFECT
TRIAGE_UNCERTAIN
OPTIONAL_IMPROVEMENT
```

Detection and disposition are distinct: the Reviewer detects and supplies
evidence; the Planner/Autopilot evaluates roadmap impact and dependencies; the
Executor acts only after disposition.

- `BLOCKING_CRITICAL` — critical now, or credible risk of a CRITICAL downstream
  problem (canonical-state corruption; broken conservation; broken determinism;
  save corruption or destructive migration risk; compromised permanent IDs; false
  provenance or unavailable→zero; incoherent sovereignty/control/occupation; a
  duplicated canonical engine; an invalid contract/API/schema later milestones
  depend on; incorrect outputs that become canonical inputs; a defect that would
  require wider/destructive correction later; unreliable tests/invariants; a
  cross-domain propagation risk; a critical security/data-integrity problem; a
  core milestone behavior being fundamentally false/incomplete). This is about
  impact, not merely demonstrability.
- `DEFERRED_DEFECT` — only with positive evidence that deferral is safe: local and
  contained, not corrupting canonical state, not feeding false canonical data
  downstream, not violating a dependency contract, not making a future repair
  materially harder, not undermining CI/tests/invariants, not hiding a likely
  critical defect, and not required for the core milestone acceptance contract.
- `TRIAGE_UNCERTAIN` — cannot establish with reasonable confidence whether the
  defect is safely local or could cause critical downstream effect. **If critical
  propagation cannot be ruled out, do not guess that it is minor.**
- `OPTIONAL_IMPROVEMENT` — not a correctness requirement; may be recorded but does
  not enter the defect register unless useful.

## 39. Unattended behavior (`unattended_safe`)

- Confident `DEFERRED_DEFECT`: record it in the register with the deferral
  rationale and a concrete future trigger; do not start a correction campaign,
  do not reopen a sealed milestone, do not start an extra review; continue.
- `BLOCKING_CRITICAL`: `CRYO_MODE` with `UNATTENDED_CRITICAL_DEFECT`. STOP
  immediately before any autonomous repair attempt — no Repair Cycle 1/2, no extra
  reviewer, no "one obvious fix first", no next block. Preserve branch/work/evidence
  and wait for the human.
- `TRIAGE_UNCERTAIN` with plausible critical downstream effect: `CRYO_MODE` with
  `UNATTENDED_TRIAGE_UNCERTAIN`. STOP; do not guess or downgrade it to keep moving.
- A correction already in progress when unattended mode is enabled: finish only an
  atomic write/commit necessary to leave the repository recoverable; record
  `blocked_head_sha` when committed; never begin a new speculative repair.

## 40. No anomaly may disappear silently

Every actual defect found ends in exactly one of: `fixed`, `deferred`,
`blocked/cryo`, `disproved`, `human_waived`. Never silently omit it, call it
optional to avoid blocking, erase it when CI turns green, or lose it across
milestones/restarts.

## 41. Persistent deferred-defect register

A persistent `deferred_defects: []` register records, per defect: id, status
(open / trigger_reached / fixed / disproved / human_waived / superseded),
detected_at, detected_at_sha, milestone_detected, subsystem, summary, evidence,
source, severity, disposition, reason_deferred, canonical_state_impact,
propagation_risk, affected_future_milestones, fix_trigger, fix_before,
related_files, related_tests_or_invariants, last_revalidated_at, resolution.

`fix_trigger` must be concrete where possible (`before_milestone: X`,
`when_touching_subsystem: Y`, `before_v1_acceptance: true`,
`when_downstream_dependency_appears: Z`). Never invent a future milestone number
not in the authorized roadmap; if none is known, use `before_v1_acceptance`.

Do not fabricate historical deferred defects for 0.22/0.23 from memory — only
populate from actual repository/runtime evidence or future detections.

## 42. Re-evaluate deferred defects at dependency boundaries

A deferred defect is re-evaluated only at a meaningful trigger (its `fix_trigger`;
a milestone starts consuming the subsystem; the subsystem is materially modified;
new evidence raises propagation risk; V1 acceptance; explicit human request).
Outcome: stay deferred / schedule normal corrective work / `BLOCKING_CRITICAL` /
`TRIAGE_UNCERTAIN`. In unattended mode the last two Cryo immediately. A deferred
defect by itself never causes spontaneous reopening/re-review before its trigger.

## 43. Roadmap dependency check before deferral

Before classifying a defect as `DEFERRED_DEFECT`, inspect enough of the roadmap and
contracts to answer: (1) does any remaining authorized milestone consume this
behavior/state/API; (2) could the defect contaminate canonical inputs to those
systems; (3) would building on top make correction materially harder; (4) could it
undermine tests/invariants protecting future work. Only a confident "no critical
consequence" permits deferral. Keep the check focused — not a full-roadmap audit
for every typo.

## 44. Reviewer output

The Reviewer reports evidence-rich findings in three groups:

```text
## DEFECT FINDINGS
## PROBABLE RISKS
## OPTIONAL IMPROVEMENTS
```

Each DEFECT FINDING / PROBABLE RISK includes: evidence/reproduction, affected
contract/invariant, likely scope, known downstream consumers, propagation
indicators. The Reviewer never makes the final defer/fix-now decision alone; after
review the Planner/Autopilot performs `ROADMAP_IMPACT_TRIAGE`. Demonstrable is not
automatically critical; probable is not automatically blocking; minor is not safe
to defer unless downstream impact has been checked. This supersedes the earlier
sentence that all PROBABLE RISKS block until fixed/disproved/human-waived.

## 45. Review-campaign and Safe-Zone interaction

The two-round review bound is unchanged. Round findings go through roadmap-impact
triage:

- normal mode: blocking → existing correction rules; deferred → register and
  continue; uncertain → resolve/block per normal protocol; optional → non-blocking.
- unattended_safe: blocking → immediate Cryo; deferred → register and continue;
  uncertain-with-critical-propagation → immediate Cryo; optional → continue.

Deferred defects do not consume repair cycles, and recording one does not authorize
a third review round. A Safe Zone may contain documented deferred defects; it is
valid when no `BLOCKING_CRITICAL` remains, no unresolved `TRIAGE_UNCERTAIN` with
plausible critical propagation exists, all deferred defects are recorded with
justified deferral and triggers, and all review/CI/Safe-Zone requirements are met.
Never reopen a sealed Safe Zone merely because a recorded deferred defect still
exists.

## 46. Unattended mode is stricter than repair loops

`MAX_SAME_ROOT_CAUSE_REPAIR_CYCLES = 2` remains for normal mode. In
`unattended_safe`, a newly detected `BLOCKING_CRITICAL` or `TRIAGE_UNCERTAIN` does
not enter Repair Cycle 1 — it Cryos immediately. The loop breaker is not the first
line of defense overnight; the safety stop is.

## 47. Ordinary implementation errors vs discovered defects

A simple deterministic implementation mistake may still be corrected automatically
in unattended mode only if ALL hold: cause clear; fix mechanically determined by an
existing contract; no ambiguity; no canonical-state corruption; no cross-domain
downstream critical risk; no design change; not a recurrence of a previous root
cause; no new unrelated failure. Examples: typo/import/compiler error, obvious
fixture mismatch from just-written code, trivial serialization typo, unambiguous
merge conflict. Otherwise classify through roadmap-impact triage.

## 48. Unattended Cryo report additions

For unattended safety stops, the Cryo report adds:

```text
Safety mode: unattended_safe
Defect: <id + summary>
Disposition: BLOCKING_CRITICAL / TRIAGE_UNCERTAIN
Critical now: yes/no/unknown
Critical downstream risk: yes/no/unknown
Affected future systems/milestones: <known dependencies>
Evidence: <tests/CI/diff/invariant/file:line>
Why it was not deferred: <reason>
Automatic repair attempts after detection: 0
Repository state: <safe SHA + branch + current/blocked HEAD>
Human decision needed: <minimal question/action>
```

## 49. Anti-spin additions

Prohibited unattended behavior: correcting a deferred minor defect "while here
anyway"; repeatedly reconsidering the same deferred defect before its trigger;
escalating a local defect merely because it exists; downgrading a potentially
critical issue to keep progressing; performing "one quick fix" after an unattended
critical stop; launching extra reviewers to avoid Cryo; converting uncertainty into
an assumption; continuing downstream implementation while a critical dependency
defect is unresolved.

## 50. Human return / normal mode

When the human explicitly switches back to normal:

```text
safety_mode.mode = normal
```

Do not automatically fix the entire deferred register. Instead: (1) inspect any
Cryo blocker first; (2) show/report any new deferred defects; (3) continue
according to their triggers and roadmap impact; (4) preserve history. The
existence of deferred defects is not itself a reason to stop normal roadmap
progression unless a trigger has been reached or new evidence raises their impact.
