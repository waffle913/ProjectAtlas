# Treaties and multilateral framework V1 — 0.20

**Status:** implemented for independent review, not accepted.
Parent: 0.19 candidate `b4f260146d149f5327f2a81f9704554bd6ff25b9`, save schema 18.

## Scope and architecture

0.20 adds a persistent, typed treaty and international-organization framework.
A treaty is not an abstract relation modifier: it carries explicit parties,
typed clauses, legal activation, obligations/rights, trigger conditions,
compliance/violation events, and consequences that flow through the existing
0.17 trade, 0.18 international and 0.19 war/operations engines. Save schema is
bumped from 17 to 18; the schema-17 -> schema-18 migration initializes an empty
`multilateral-0.20-v1` domain and never fabricates treaties, organizations or
memberships.

## Treaty model

A treaty records stable opaque identity, title, sorted unique parties,
proposal date, signatories, ratifications, withdrawals, entry-into-force rule,
withdrawal notice, status (`proposed`/`signed`/`active`/`suspended`/
`terminated`/`expired`), typed clauses, provenance and bounded dated history.
`parties`, `clauses`, `entryIntoForce` and `withdrawal` are immutable once
proposed, so a submitted payload cannot be silently altered after signature.

## Lifecycle and authority

Treaty actions reuse the existing person/office/governance authority
(`hasInternationalAuthority`): the controlled active person must hold a resolved
head-of-government/head-of-state office with government-information access in
the acting Country. Country selection alone grants nothing. The lifecycle is
`propose -> sign -> ratify -> activate -> withdraw/terminate`; signing is kept
separate from legal activation when the treaty requires ratification
(`on_ratification`), while `on_signature` treaties enter into force when all
parties sign. Submitted payloads are stable and fingerprinted by construction.

## Clauses and obligations

Clauses are a typed causal union:

- `defensive_guarantee` (protected/obligated Country);
- `non_aggression` (party A/B);
- `trade_commitment` (importer/exporter, categories, tariff);
- `sanctions_commitment` (actor/target, categories);
- `recognition`.

The monthly trigger evaluation records, exactly once per qualifying war:

- a pending `defensive_guarantee` obligation when the protected Country is
  attacked in a qualifying war; the obligated guarantor honors (gaining a
  retaliation casus belli through the 0.19 war system) or violates;
- a `non_aggression` violation when a party declares war on another party.

Inactive/terminated treaties have no operative effect. A violation is an
explicit factual event; consequences flow through existing bilateral/international
pressure, relations, crises and Government Information, never an invented
reputation score.

## Organizations and decisions

Organizations record identity, member/observer membership, accession,
withdrawal, a configurable voting rule (`majority`/`supermajority`/
`unanimity`, with optional threshold and quorum) and bounded history.
Membership grants no unexplained bonus; rights and obligations come from
decisions. Decisions carry a proposer, a typed payload, a voting window,
per-member votes (`UNKNOWN` is never auto-`ABSTAIN`), a result and
`appliedEffectIds` for exactly-once effect application. Adopted effects reuse
the 0.18 international action engine (condemnation / coordinated restrictions),
the 0.17 route model (trade commitments) or the organization membership state.
Observers cannot vote and do not count toward quorum.

## AI and Government Information

`multilateral.ai` is a bounded deterministic V1 diplomatic AI for non-player
Countries: it signs/ratifies, votes and resolves obligations from represented
relations and clause/payload context, never fabricated factual knowledge and
never a global omniscience. `multilateral.reports` persists sparse monthly
government reports: treaty texts and publicly adopted resolutions are exact
when public; foreign votes, intentions and hidden decision logic never leak.
Reports are government-gated, stale-safe and fingerprinted.

## Performance and bounds

The monthly tasks scale with active treaties, organizations, decisions and
obligations, not a 252 x 252 worldwide scan. Treaty/organization history is
bounded, resolved decisions are pruned to a documented global limit, and reports
retain only the latest per Country. Static/factual coverage remains empty until
licensed, dated, reviewable provenance is committed.

## Provenance and data coverage

No factual 2026 treaty, organization, membership, guarantee or voting position
is fabricated. All gameplay records are synthetic/modelled with explicit
`unavailable` factual coverage; the UN-member classification in the entity
registry is reused only for facts it actually supports, and NATO/EU memberships
are never inferred.

## Validation

Run `npm run multilateral:audit`, `npm run multilateral:benchmark`, `npm run
international:audit`, `npm run trade:audit`, relevant war/save/information
tests, `npm run build` and the full `npm run verify` (serially with
`--maxWorkers=1` when parallel execution causes resource-contention timeouts).

## Known V1 limitations

- No deferred withdrawal notice periods (withdrawal is immediate and recorded);
  the notice field is retained for future mechanics.
- No multi-hop negotiation, no secret/classified treaty tiers beyond public
  text and non-leaked votes.
- Trade commitments set route tariffs but do not auto-revert on termination.
- The AI uses a simplified represented-relations + clause/payload heuristic.
