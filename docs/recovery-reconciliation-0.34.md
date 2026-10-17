# Recovery reconciliation — 0.33 / 0.34 technical status

Targeted recovery after the premature administrative closure of the roadmap at
0.34. This report states, against the actual repository (`main` HEAD `24031e6`),
what is genuinely complete, what is technically incomplete, what is correctly
deferred/blocked, which validations are independently demonstrated, and whether
0.34 legitimately qualifies for technical validation.

## 1. What is actually complete

**0.33 — technically validated** (independently demonstrated):

- Two-round bounded review: Round 1 consolidated (block → 1 blocking D1 authority
  leak + should-fix + risks, all corrected); Round 2 final verification (minor
  nits → fixed).
- Branch CI green (run `39067860709`, head `3912b79`); merged to `main`
  (`66a761e`); main CI green (run `39070236846`, Ubuntu + Windows).
- Functional, causally integrated in 0.33: the desktop/browser persistence layer
  (awaitable honest writes, atomic native writes, autosave), the interface shell
  (map layers, left rail, urgency/interruption, Tablet), the governing/opposition/
  save-load gameplay paths, and the Economy V2 restitution (`inspectEconomy`)
  rendered authority-gated in the UI.

**Data infrastructure** (0.09 + domain data): audited source snapshots, per-domain
coverage reports, permanent entity/region registries with identity fingerprints,
and the 2026-01-01 admissibility cutoff — all present and CI-verified.

## 2. What remains technically incomplete

The previous turn labelled the 0.26–0.32 V2 contract layers "redundant — do not
wire". That was **overbroad**. A verified, per-subsystem split is required, because
"an older canonical subsystem has a similar name" is not proof of redundancy:

| Subsystem | Core mechanics already canonical (verified) | V2-specific behavior NOT wired (incomplete) |
|---|---|---|
| Finance (0.26) | conservation (`fiscal/invariants.ts:83-84`), interest-before-principal (`runtime.ts:302`), borrowing capacity (`runtime.ts:300`) | `assessSolvency` solvent/stressed/default view; `creditCeiling` default-blocks-borrowing gate |
| Resources (0.27) | `TradeStock` stock-flow ledger (`trade/model.ts:35,64`) | extraction installations, energy plants, network links, war damage (`applyDamage`), StockLedger reconciliation |
| Industry (0.28) | assets (0.24) installations/equipment; military (0.16) orders | research projects, technology diffusion/adoption, industrial process chains |
| Services (0.29) | budget→service backlog/coverage evolution (`fiscal/runtime.ts:329`) | establishment-level delivery (beds/personnel), supply requirements |
| Demography (0.30) | socioeconomy is the sole population/cohort owner | dated birth/death/migration transitions, legal-status integration, `deployPolice` |
| Diplomacy/Military (0.31) | international (0.18) actions; military (0.16/0.19) orders/operations | negotiations/concessions, sanctions direction, support-chain availability, territorial-control contracts |
| Media (0.32) | politics (0.13) opinion; information (0.15) briefings | channel diffusion, statements/political communication, opinion shifts |

So the correct classification is **partially redundant (core accounting) + partially
incomplete (V2-specific behaviors unwired)**, not "redundant". These are genuine
runtime-integration gaps, not duplicates; wiring them is the remaining 0.33 scope,
to be done only where no design gate blocks them.

## 3. What is correctly deferred or design-blocked

- `BLOCKED_DESIGN` (unchanged, requires a human decision): FX/bank-created money
  (0.26), intra-region spatial grid (0.27), competition/market structures (0.28),
  rent rules (0.29), justice (0.30.6) + intelligence (0.30.7) + security events
  (0.30.8), disinformation/censorship (0.32), creative/professional sandbox
  (0.33.10).
- `DEFERRED`: `deferred-0.25-B2` (firms pre-fiscal fallback), `deferred-0.25-R2-emptyregions`
  (both low, view-only, with fix triggers).

## 4. Which validations were independently demonstrated

- `verify` CI green on Ubuntu + Windows through 0.33 (run `39070236846`).
- `desktop-windows` CI green (cargo test + Tauri packaging) on the 0.33 checkpoint.
- Independent `tool:review` rounds for 0.33 (Round 1 + Round 2).
- Deterministic scenario tests: `crossSystemLoops`, `crisisWorld` (positive causal
  crisis lifecycle), `worldBenchmark`, `v1Endurance`/`v1Stress`.

## 5. Does 0.34 legitimately qualify for technical validation?

**No.** 0.34 is a validation/documentation campaign, and its sub-milestones are
not all complete:

- 0.34.2 documentary recovery — `DEFERRED` (independent Work campaign; not restarted).
- 0.34.6 calibration — `PARTIAL`.
- 0.34.9 human/professional validation — `AWAITING_HUMAN_VALIDATION` (no fabricated
  expert feedback).
- 0.34.11 licences — `PARTIAL` (several sources record "licence not stated" =
  release blocker).

Therefore 0.34 is **not** `TECHNICALLY_VALIDATED`; it is `AWAITING_HUMAN_ACCEPTANCE`
at the roadmap boundary. The persisted phase now reflects this (repaired from the
invalid `COMPLETE`).

## 6. Exact safe runtime SHA and CI evidence

- **Last technically-safe runtime baseline: `0.33` @ `66a761e5cbef7324c7a5bf311bcccaa34b2195d3`**,
  green CI run `39070236846` (Ubuntu + Windows).
- Last human-accepted/sealed baseline: `0.24` @ `6b6794ef1e5440cf02152a84ee0012aa155f7ad0`
  (unchanged).
- The 0.34 documentary merge (`f123d67`) and this recovery (`24031e6`) are metadata/docs
  commits — they do **not** advance the safe runtime baseline.

## 7. Remaining human decisions

1. Accept or reject the 0.25–0.33 technical validations (human acceptance is separate).
2. Decide the `BLOCKED_DESIGN` gates listed in §3.
3. Resolve the unstated source licences (release blocker) before any distribution.
4. Authorize the remaining 0.33 runtime-integration micro-blocks (the V2-specific
   behaviors in §2) or confirm they stay out of scope.
5. Schedule the 0.34.9 human/professional validation.

---

**Status preserved:** 0.34 is **not** technically validated; the roadmap is at its
human-validation boundary. This is not ROADMAP COMPLETE in the technical sense.
