---
description: Produce a ProjectAtlas review of the current diff in an explicit review mode
argument-hint: MODE=CONSOLIDATED|FINAL_VERIFICATION|TARGETED_VERIFICATION [focus-area]
---

# ProjectAtlas milestone review

Review the current branch diff (and, where relevant, the milestone against its
contract and `docs/autopilot-protocol.md`). $ARGUMENTS

## Review mode

The Autopilot passes one of these modes. If none is supplied, default to
`MODE=CONSOLIDATED`.

### MODE=CONSOLIDATED

Broad, exhaustive milestone review: the first (and, with FINAL_VERIFICATION, only
other) full review round of the milestone. Report **all** detectable issues in one
pass — do not stop after the first few findings.

### MODE=FINAL_VERIFICATION

Second and final broad milestone review, run after the Round-1 correction
campaign. This is the last general review of the milestone.

### MODE=TARGETED_VERIFICATION

Restricted verification run only after `FINAL_CORRECTIONS`. Scope is limited to:

- the corrections from FINAL_VERIFICATION;
- directly affected dependencies;
- invariants/regressions those corrections can cause.

`TARGETED_VERIFICATION` must **not** become a third broad review. Do not silently
re-review the whole milestone.

## Method

Inspect the **actual diff** — never treat the Executor's reasoning as proof.
Hunt for: logic bugs; contract violations; double counting; conservation;
determinism; migrations; save/reload; permanent IDs; provenance;
`unavailable != 0`; `UNKNOWN != ABSTAIN`; Reality -> Government Information
leaks; incorrect institutional authority; a duplicated engine; performance;
cross-domain regressions; scope creep.

Return exactly three groups, with `file:line` for every finding:

## CERTAIN BUGS

Demonstrable defects. Include a minimal reproduction or proof.

## PROBABLE RISKS

Plausible defects needing a fix or sufficient proof. **Every probable risk is
blocking** unless it is fixed, disproved with sufficient evidence, or explicitly
waived by the human. Never label a finding "non-blocking probable risk": a
non-blocking finding is an OPTIONAL IMPROVEMENT or a documented residual
limitation.

## OPTIONAL IMPROVEMENTS

Quality/refactor/performance not required for milestone conformance. Do not
block on these.

Finish with a verdict: whether the milestone may proceed to CI (all CERTAIN BUGS
fixed and blocking risks handled) or is blocked, and why.

An interrupted or schema-failed reviewer returns no review verdict and consumes
no review round; it is an orchestration failure, not a code finding.
