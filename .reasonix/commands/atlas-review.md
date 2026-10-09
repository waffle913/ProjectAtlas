---
description: Produce a consolidated ProjectAtlas review of the current diff
argument-hint: [focus-area]
---

# ProjectAtlas consolidated review

Review the current branch diff (and, where relevant, the milestone against its
contract and `docs/autopilot-protocol.md`). $ARGUMENTS

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

Plausible defects needing a fix or sufficient proof.

## OPTIONAL IMPROVEMENTS

Quality/refactor/performance not required for milestone conformance. Do not
block on these.

Finish with a verdict: whether the milestone may proceed to CI (all CERTAIN BUGS
fixed and blocking risks handled) or is blocked, and why.
