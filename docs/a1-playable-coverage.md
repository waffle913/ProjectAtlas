# A1.5 — Playable-country coverage and design decision

This report reconciles the initial playable selection against the registered
world entities. It is evidence, not a scope decision: the open
**human design decision** at the end is not resolved here.

## 1. Entity universe (252 registered entities)

From `src/data/entity-registry.json`:

| Category | Count |
|---|---|
| Sovereign states | 194 |
| Dependent territories | 46 |
| Partially recognized states | 5 |
| Special-status entities | 6 |
| Disputed entities | 1 |
| **Total** | **252** |

UN membership: 193 members, 2 observers, 57 non-members.

## 2. What `selection.ts` actually requires

`src/simulation/governance/selection.ts` admits a country only when it has at
least one **active** person who is either:

- a **party leader** whose party is registered for that country (`party_leader`
  path), or
- an **officeholder** whose office carries
  `evidence.status === 'source_reconciled'` and whose role is
  `head_of_government` or `head_of_state` (`officeholder` path).

`StartGame.tsx` disables every other entity.

## 3. Coverage (verified against the data)

| Category | Total | Party data | Reconciled HOG/HOS officeholder | Selectable |
|---|---:|---:|---:|---:|
| Sovereign states | 194 | 118 | 194 | **194** |
| Partially recognized states | 5 | 0 | 5 | **5** |
| Dependent territories | 46 | 0 | 0 | 0 |
| Special-status entities | 6 | 0 | 0 | 0 |
| Disputed entities | 1 | 0 | 0 | 0 |
| **Total** | **252** | **118** | **199** | **199** |

So the current initial selection covers **199 of 252** entities: every sovereign
state and every partially recognized state (all through the officeholder path;
118 sovereign states also through the party-leader path). **53 entities are not
playable**: 46 dependencies, 6 special-status entities, and 1 disputed entity —
none of which has a reconciled head-of-government/head-of-state officeholder or
registered party.

## 4. The four situations must not be equated

- **Missing party data** (134 entities) is a *party-registry coverage gap*, not a
  statehood question: every sovereign state still has an officeholder route.
- **Missing officeholder evidence** (53 entities) is what actually removes
  playability today: dependencies, special-status and disputed entities have no
  reconciled HOG/HOS record, so no fictional starting person can be derived.
- **Missing institutional-authority evidence** is a third, separate axis. Of the
  199 officeholder-selectable countries, `executiveSystem` coverage is
  `sourced` for 181, `partial` for 12, and `unavailable` for 6. A
  source-reconciled officeholder with unavailable institutional authority is
  still selectable, but receives **no** executive capabilities (the
  `institutional_authority_unresolved` basis) — the game never fabricates powers
  for an office whose authority is not evidenced.
- **Dependent / special-status / disputed entity status** is a *scope* question,
  not a data defect: these are real registered entities whose playability
  arrangement is undecided.

## 5. Open human design decision (not resolved here)

Whether the initial playable selection must:

1. remain **sovereign states first** (all sovereign + partially recognized
   states, today's 199), with a separate, later gameplay arrangement for
   dependencies/special-status/disputed entities; or
2. cover **all 252 registered entities**, requiring a decided gameplay model for
   dependencies (devolved offices, suzerain vs sovereign authority) and for
   special-status/disputed entities.

A fictional leader identity may be modelled where authorized, but governmental
powers must never be fabricated: extending coverage to dependencies would
require decided institutional authority, not inferred offices. This decision is
left to the project owner.

## 6. Safe corrections applied

- `StartGame.tsx` now labels disabled entities by their actual reason (entity
  type + missing officeholder evidence) instead of the uniform "playable person
  evidence unavailable", so missing party data, missing officeholder evidence,
  and entity type are not presented as one thing. Eligibility is unchanged.
