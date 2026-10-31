# Executive authority capabilities (corrective mission)

Status: implementation, validation delegated to GitHub Actions (no local test/build/verify was run for
this mission). No save-schema bump, no migration of historical decisions, no RNG/scheduler change.
Builds on `docs/playable-start-routes.md` (start routes) and supersedes nothing there.

## 1. Confirmed defects

| # | Defect | Location |
|---|---|---|
| E1 | `capabilitiesForReconciledAuthority()` granted **all ten** capabilities, including `vote_legislation`, to every resolved executive basis | `governance/officeEvidence.ts` |
| E2 | `capabilitiesFor()` used a *different* distribution for the same offices (head of state: 2, head of government: 10), so the same office could hold two different capability sets depending on how it was created | `governance/runtime.ts` |
| E3 | The parliamentary suffrage was attached to the executive, and the chamber vote was triggered through it | `runtime.ts` (`resolveProposalVoteForActor`), `FiscalPolicy.tsx` |
| E4 | A newly appointed head of government received the whole set, regardless of the institutions and of what the office already held | `runtime.ts` (`assignPoliticalOffice`) |
| E5 | Nothing stated which capabilities an office deliberately does **not** carry | office/selection API |

## 2. The model now implemented

Three things are kept distinct, as required:

1. **the function** (`head_of_state`, `head_of_government`, `legislator`, `minister`);
2. **the holder** (reconciled at scenario start, or appointed in game);
3. **the competences of the function**, resolved from the institutional state.

`governance/officeAuthority.ts` is the single resolver. It reads:

- the constitution in force (`state.constitution.countries[countryId]`): `government.responsibility`,
  `parliament.power`, `headOfState.selectionMethod` — the rules the constitution subsystem already
  represents, so there is **no second authority system**;
- the sourced executive system of the political registry.

| Arrangement | Basis | Head of government | Head of state |
|---|---|---|---|
| parliamentary / parliamentary monarchy | `constitutional_responsibility` (censurable government) or `sourced_executive_system` | government agenda | **none** (ceremonial, reason stated) |
| presidential | `sourced_executive_system` | government agenda | government agenda (it is the executive) |
| semi-presidential | `modelled_semi_presidential_split` | government agenda | state functions (government information, military command) |
| no institutional record (generic) | `modelled_generic_office_scope` | government agenda | state functions |
| legislator | `office_role` | — | — |
| minister | `office_role` | portfolio + suggestions only | — |

**Government agenda** (9, deliberately not ten): `sponsor_legislation`, `sponsor_fiscal_reform`,
`sponsor_budget_reform`, `access_government_information`, `command_military_operations`,
`propose_construction`, `authorize_construction`, `fund_construction`, `cancel_construction`.
**State functions** (2): `access_government_information`, `command_military_operations`.
**Suffrage** (1, legislators only): `vote_legislation` — never held by an executive office.

A resolution derived from a sourced system or from the constitution in force is `resolved`; a
distribution the represented rules do not fully determine (the semi-presidential split, a Country
without an institutional record) is `modelled`, with an explicit limitation. A capability the
arrangement withholds is reported in `withheldCapabilities` (API + `nationalExecutiveAuthority`),
never invented.

## 3. Replacement of a holder

`transferPoliticalOffice` captures the function's established competences **before** the outgoing
office is revoked and hands them to the incoming holder; `assignPoliticalOffice` otherwise inherits
`establishedOfficeCapabilities()`. An election, a succession, a government formation or a temporary
acting arrangement therefore changes who holds the office, never the office's powers. A constitutional
amendment remains the one deliberate way the institutional rules change:
`reconcileOfficeCapabilitiesForCountry` re-derives every office of that Country afterwards.

## 4. Parliamentary procedures

- The chamber's decision stays the modelled seat/party estimate — independent of the executive's
  capabilities; whip instructions, negotiations, internal party distribution, public estimates and
  the vote outcome are unchanged.
- Referring one's own bill to the chamber is now the **presenting authority's** act
  (`sponsor_legislation`), not a personal parliamentary vote; `FiscalPolicy.tsx` follows the runtime.
- A partly unresolved executive arrangement never disables the chamber procedures: the chamber still
  votes, and a head of government keeps the agenda in every arrangement, so a represented Country is
  never left without a legislative initiative.

## 5. Save compatibility

The persisted capability list is a *derived* field of the modelled abstraction, not a historical
decision. `reconcilePersistedOfficeCapabilities` runs on every restore:

- an **evidence-backed** office is re-derived exactly from its reconciled authority basis;
- a **role-derived** office only loses capabilities outside its function scope — a load never widens
  an appointment.

Offices, roles, titles, authority bases, source evidence, identities, proposals, successions and
player control are untouched; no schema version changes, so old saves load and converge
deterministically. Because the derived list is corrected (not the history), replaying an old save is
not required.

## 6. Remaining institutional limits (stated, not hidden)

- **Presidential overlap** — the head of state is the executive, and the head-of-government office
  also carries the agenda: the engine appoints that person as the government's head but does not
  model how much of the executive a cabinet chief really holds. A sourced rule for that split is not
  represented; the limitation is persisted on the office profile.
- **Semi-presidential split** — the distribution (agenda to the government, state functions to the
  president) is **modelled**, not a sourced claim: no registry field states how the two offices
  share power, and the start routes keep their stricter evidence criterion (a modelled capability
  profile does not become a sourced national-leader assertion).
- **Ceremonial state functions** — a ceremonial head of state carries nothing: no pardon, decree,
  appointment, confidence or dissolution capability is modelled for it. Those powers are gated by
  role in their own subsystems (government nomination, ministerial appointment, censure, dissolution
  holder, executive override) and were left unchanged.
- **Unrepresented Countries** — no institutional record at all falls back to the documented generic
  office scope (`modelled`). Admissible institutional data added to the registry later resolves it
  for **new appointments and via the explicit amendment reconciliation**, never by silently rewriting
  a running game (a load only narrows).

## 7. Tests (CI only)

`src/simulation/__tests__/executiveAuthority.test.ts` covers: no suffrage and no full set for any
office; arrangement resolution (presidential, parliamentary, monarchy-parliamentary,
semi-presidential, generic); the head-of-state/head-of-government distinction; an evidence-backed
office staying on its evidence; command refusals without the capability; function competences across
holder replacement and office transfer; save normalization (legacy blanket set, narrowed appointment,
idempotency); and both authorized start routes. `governance.test.ts`, `startSelection.test.ts`,
`trade.test.ts` and `military.test.ts` were adapted to the corrected scope.
