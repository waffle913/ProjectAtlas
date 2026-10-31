# Playable political start routes (corrective mission)

Status: implementation, independent review pending. No schema change, no migration, no RNG or
scheduler change. Supersedes the *eligibility* description in
[`a1-playable-coverage.md`](a1-playable-coverage.md) (§2, §3, §6); that document's entity-coverage
history stays valid as evidence.

## 1. The two — and only two — authorized routes

| Path id | Meaning | Admits |
|---|---|---|
| `national_leader` | The person who actually exercises national governmental authority on the start date. | A `head_of_state`/`head_of_government` office whose **reconciled** evidence establishes a resolved executive authority. |
| `opposition_party_leader` | The leader of a party whose **opposition status is established** for the start date. | An active `isPartyLeader` person whose registered party resolves to `opposition`. |

No third generic "public officeholder" route exists. A route never grants an office, a party or a
capability: `StartingPathDescriptor.grantsCapabilities === false` for both. Whatever a starting
person can do comes from the office they already hold.

## 2. National leader: the authority criterion

`nationalExecutiveAuthority({ person, date, registry })` in
`src/simulation/governance/officeEvidence.ts` is the single source of truth. It returns one of:

| Status | Meaning | Eligible |
|---|---|---|
| `resolved` | `sourced_presidential_head_of_state` + `head_of_state`, or `sourced_parliamentary_head_of_government` + `head_of_government`, matching the executive system the registry establishes, with capabilities equal to that basis (see `docs/executive-authority-capabilities.md`: the government agenda, never every capability and never the parliamentary suffrage) | yes |
| `unresolved` | Reconciled identity, but the basis is `institutional_authority_unresolved` (ceremonial head of state, semi-presidential president *and* prime minister, `other`, or an executive system the registry does not source), or the office has no reconciled provenance at all | **no** |
| `evidence_inconsistent` | Persisted evidence fails `persistedOfficeEvidenceErrors`, the persisted basis contradicts the registry's sourced executive system, or capabilities contradict the basis | **no** |
| `not_a_national_executive_office` | `legislator`, `minister` | no |
| `no_office` | No office recorded | no |

Consequences per documented system (verified against the real 2026-01-01 data):

| Sourced `executiveSystem` | Countries | Resolved national leader | Rule |
|---|---:|---|---|
| `presidential` | 46 | 46 | the head of state is the executive |
| `parliamentary` | 47 | 45 | the head of government is the executive; the head of state stays ceremonial |
| `monarchy_parliamentary` | 30 | 30 | the head of government is the executive; the monarch stays ceremonial |
| `semi_presidential` | 41 | **0** | neither office is asserted: the registry does not resolve which one leads the executive |
| `other` | 17 | 0 | not resolved |
| `unavailable` (system not sourced) | 71 | 0 | not resolved |

A semi-presidential Country therefore offers **no arbitrary pick** between president and prime
minister: both officeholders remain `institutional_authority_unresolved` with **zero** capabilities,
and neither is offered as a national leader. The same holds for ceremonial heads of state, which
never receive invented governmental powers to become playable.

## 3. Opposition: the status criterion

`resolvePartyGovernmentStatus(context, countryId, partyId)` resolves in this order, and **never**
infers opposition from missing data:

1. **canonical dynamic coalition** — `state.elections.countries[cid].government.coalitionPartyIds`
   (initialized from the sourced governing bloc, updated only by real elections/government
   formation): membership decides, basis `elections_coalition`;
2. **sourced governing bloc** — `institutions[cid].governingPartyIds` filtered to the Country's
   registered parties, basis `sourced_governing_bloc`;
3. **`unavailable`** — no bloc (`no_established_governing_bloc`), an ambiguous derivation
   (`ambiguous_governing_bloc`), a static party label contradicting the bloc
   (`contradictory_registry_evidence`), or a party not registered in the Country
   (`unregistered_party`).

`governmentStatus: 'unavailable'` (registry) never becomes opposition, and a governing party is
never listed on the opposition route. `state.politics.organizations` dynamic parties are resolved
through the same path (their status comes from the elections coalition only).

## 4. Start guard

`assertAuthorizedStartingPerson(state, personId)` (`selection.ts`) is called by `App.tsx::startAs`
before `setControlledPerson`. It is deliberately **scoped to the new-game entry point**:
`setControlledPerson` itself is unchanged, so succession, player handoff, migrations and historical
saves keep working for people who are not starting routes.

## 5. API exposed to the UI work

All in `src/simulation/governance/selection.ts`; pure functions over `SimulationState` +
`PoliticalRegistry`, deterministic by person id (never registry/insertion order):

- `selectableStartingCountryIds(state)` — Countries with at least one authorized route;
- `POLITICAL_START_PATHS`, `POLITICAL_START_PATH_DESCRIPTORS` — the two routes;
- `countryStartingOptions(state, countryId)` — per Country: `playable`, `parties[]`
  (`status`, `statusBasis`, `limitation`, `leaderPersonIds`), `paths[].candidates[]`
  (`personId`, `displayName`, `paths`, `partyId`, `office {role, title, authorityStatus,
  authorityBasis, executiveSystem, capabilities, limitations}`, provenance) and
  `paths[].unavailable[]` (person + reasons), plus country-level `unavailableReasons`;
- `startingPersonCandidates`, `startingPersonAssessments`, `startingPathsForPerson`,
  `resolvePartyGovernmentStatus`, `assertAuthorizedStartingPerson`;
- `nationalExecutiveAuthority` (office evidence) for the verified office/capabilities of the chosen
  person.

The existing `StartGame.tsx` screen is wired to this API only; no theme, globe or layout work.

## 6. Verified coverage after the correction

| | Countries |
|---|---:|
| Entities with any starting person (unchanged) | 199 |
| Playable — `national_leader` | 121 |
| Playable — `opposition_party_leader` | 54 |
| Playable — union | **134** |
| No authorized route | **65** |

The 65 Countries with no route: 32 `semi_presidential`, 18 executive system `unavailable`, 14
`other`, 1 `parliamentary` (its only reconciled office is a ceremonial head of state and it has no
established opposition party). They are shown disabled with explicit reasons; no office, authority,
party or opposition is invented to make them playable.

## 7. Remaining limitations (deliberate, not hidden)

- **Semi-presidential authority is not modelled.** Resolving whether the president or the prime
  minister leads the executive needs a sourced rule (constitutional text, appointment powers), not a
  heuristic. Until then both offices stay unresolved and unplayable as a national leader.
- **`other` and non-sourced executive systems** stay unresolved for the same reason.
- **Governments without a sourced governing bloc** (196 Countries in the registry, 62 with parties
  and no bloc) have no opposition route: the data does not establish who governs.
- **A gameplay-appointed office** (`assignPoliticalOffice`, no reconciled provenance) is not a
  national-leader start route; this cannot occur at a fresh start and does not affect succession.
- **Recording choice, not authority**: when one person holds both national offices,
  `initializeSourceOfficeholders` records the head-of-government role (documented in
  `runtime.ts`); this is identity recording only — the authority basis still comes from the sourced
  executive system, and the start route refuses it when unresolved.
- The route criterion reads the dated registry/save state; it does not re-derive coverage when data
  is regenerated. Regenerating `political-registry.json` or `political-offices.json` changes the
  numbers above, never the rules.

## 8. Tests

`src/simulation/__tests__/startSelection.test.ts` covers the 12 required cases: admissible
opposition leader, excluded governing-party leader, unavailable status (no invented opposition,
including a contradictory registry), presidential national leader, parliamentary national leader,
semi-presidential unresolved authority, ceremonial head of state, combined party leadership +
office, inactive/unreconciled person, refused start selection (with player control unchanged),
save/succession non-regression, and deterministic candidate lists.
`governance.test.ts` keeps the start-flow rendering coverage; `playableShell.test.ts` keeps the shell
rendering coverage.
