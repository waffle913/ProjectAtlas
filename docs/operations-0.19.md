# Military operations, war and territorial control — 0.19

**Status:** implemented for independent review, not accepted.
Parent: 0.18 candidate `1d5c553` (international tensions, crises and sanctions).

## Scope and architecture

0.19 adds the operations domain that 0.18 explicitly deferred: physical
deployments, movement, finite logistics, deterministic combat, strategic
capture, effective Region control, occupation and `take_region` war settlement.
Schema stays at 17 (the `operations-0.19-v1` model was already introduced in the
0.19 foundation commits).

The causal chain is:

represented capability -> deployment -> movement/access -> supply/logistics
-> deterministic combat -> strategic capture -> effective Region control
-> occupation -> war objective -> settlement

Sovereignty (`regionOwnership`), occupation (`occupationByRegion`) and effective
military control (`operations.regionControl`) stay three distinct layers. Control
never rewrites sovereignty; only `endWar` with `attacker_victory` transfers the
declared target Region.

## Physical force model

Deployments draw personnel and non-consumable equipment from the one canonical
military capability already validated in 0.16. There is no second force pool, no
`militaryReadiness().limitingBps` combat multiplier and no fabricated factual
army. Unavailable factual armies cannot deploy. A deployment records its
`allocated` basis (original personnel/equipment) separately from current
personnel/equipment and cumulative `losses`, so conservation and irreversible
casualties remain auditable.

## Deployment, movement and access

- `deploy` mobilizes personnel already assigned to a source Region; a new land
  deployment must start in its source Region.
- `orderMovement` records a prospective order that executes at the next daily
  boundary along represented land adjacency.
- `movementAccess` permits transit only through the deployment's own sovereign
  territory, territory it occupies, or a belligerent's Region during an active
  war. Neutral/hostile transit is denied.
- `withdrawDeployment` records a prospective withdrawal; a deployment reduced to
  zero personnel becomes `withdrawn` automatically.

## Static land adjacency

`src/data/land-adjacency.json` is a deterministic, immutable adjacency registry
derived once from the pinned, committed Admin-1 geometry. Edges are exact shared
boundary vertices: symmetric, sorted unique neighbours, no self-edges, keyed by
permanent Region IDs. Regions without mappable geometry are recorded as
explicitly `unavailable`, never as zero borders. The registry is a code asset,
never recomputed per tick and never serialized into every save. Synthetic tests
may inject override edges through `operations.adjacency`. Regenerate with
`npm run data:adjacency:generate`; audit with `npm run operations:audit`.
Known limitation: shared water boundaries (for example across lakes) are treated
as land adjacency because the Admin-1 geometry does not separate water bodies.

## Logistics throughput

Resupply is not free once a path exists. For distant deployments, throughput
derives causally from trucks, crews (personnel), path length (hops) and available
fuel: `cargo = drivable trucks * loadPerTruck / hops`, with transport fuel burned
per truck per hop. National stock -> transferred quantity -> deployment cache
conserve exactly; ammunition and fuel are never created. A deployment with no
accessible friendly/occupied path is cut off and receives nothing. Local
(same-Region) resupply is bounded only by national stock.

## Deterministic combat

Combat resolves per decisive component when both belligerents have non-withdrawn
deployments in the Region. Power is `offensivePersonnel (bounded by ammunition)
* training factor + usable equipment (mechanized equipment bounded by fuel)`.
The shared keyed RNG decides the winner; no `Math.random`. Losers take personnel
and equipment losses; both sides consume ammunition and fuel. Casualties are
applied exactly once to military assignments, Region population, cohorts and
labour force; destroyed equipment persists and is conserved
(`operational + unavailable + maintenance + reserve + destroyed === opening + delivered`).
Engagement evidence accumulates per war/component and is bounded (resolved
engagements are pruned to a documented limit).

## Strategic components and capture

A Region's decisive components represent the control-relevant geography (major
cities, installations, principal positions). Decisive combat wins accumulate
bidirectional `captureProgress` (threshold 5000 bps, step 2500 bps) on the war
objective's decisive component; minor wins do not move control, and control never
flips from a single roll. The attacker and defender can each capture/recapture.
Secondary components may exist but never determine Region control.

## Effective Region control

One authoritative derivation (`deriveRegionControlFor`) reads only decisive
components:

- all decisive controlled by the sovereign owner -> `sovereign_controlled`;
- decisive components split between controllers or actively contested ->
  `contested`;
- all decisive controlled by the same foreign belligerent -> `foreign_controlled`.

Sovereignty remains in `regionOwnership`; control derivation never writes it.

## Occupation vs sovereignty

`recomputeControl` keeps occupations coherent with effective control: foreign
full control creates a matching occupation under the active war; sovereign or
contested control removes it, so a sovereign recapture clears the occupation.
`occupyRegion` remains a legacy structural record only — it does not grant
control, and `isWarGoalSatisfied` requires genuine `foreign_controlled` control,
so a forged occupation cannot satisfy a modern war objective. Legacy occupations
loaded at the 0.19 migration boundary are treated as established historical
control with explicit provenance.

## War objective and settlement

`take_region` attacker victory requires the target Region to remain the declared
objective, genuine `foreign_controlled` effective control, and a matching attacker
occupation under the same active war. On attacker victory `endWar` transfers
sovereignty for only the declared target Region, clears the war's occupations and
reconciles the affected Regions' components/control to the new sovereign.
Defender victory and white peace transfer nothing and clear occupations coherently.
Physical wartime losses and destroyed equipment remain permanent in all outcomes.

## Operational AI

`operations.ai` is a bounded, deterministic V1 AI that acts only for non-player
belligerents inside already-active wars. It mobilizes and moves represented
forces toward objectives, resupplies with finite throughput and withdraws stale
deployments. It never declares war, never creates personnel/equipment/supplies,
never teleports, never overrides player orders and never reads hidden enemy
canonical state.

## Government Information / fog of war

`operations.reports` produces sparse monthly government reports for belligerent
Countries only. Friendly forces are known precisely where justified; enemy
strength is always `unavailable`, and the report exposes only observable Region
control plus the observer's own combat contact evidence (recorded enemy
casualties and confidence), never live enemy personnel/equipment/supply/orders.
Reports carry timestamps, confidence, provenance and fingerprints and are
government-gated and stale-safe.

## Minimal UI

An Operations page shows friendly deployments, Region effective control, active
engagements, the enemy fog-of-war report and deploy/move/supply/withdraw commands
gated by resolved executive authority. Pause-requesting urgent notifications are
not yet wired into the briefing system (see limitations).

## Known V1 limitations

- No naval/air movement or trans-oceanic logistics; land adjacency only.
- Shared water boundaries are treated as land adjacency (geometry limitation).
- Movement pathfinding is single-step; the V1 AI does not route multi-hop paths.
- No reinforcement, counterinsurgency, attrition, siege, encirclement or
  multi-front theatres beyond the decisive-component model.
- Operational AI is deliberately minimal and does not play strategically.
- No public operational notifications beyond the government report/panel.
- Secondary components exist but have no material effects yet.

## Provenance and factual-data limitations

No factual 2026 army, deployment, engagement or control baseline is fabricated.
The real-world military source reference remains the 0.16 partial/rounded UK
historical record; all operational fixtures are explicitly synthetic/modelled.
Adjacency derives from the pinned Natural Earth Admin-1 geometry and inherits its
licence and limitations. Enemy force strength is modelled `unavailable`, not an
observed zero.

## Validation

Run `npm run operations:audit`, `npm run military:audit`, `npm run operations:benchmark`
and the full `npm run verify` (serially with `--maxWorkers=1` when parallel
execution causes unrelated resource-contention timeouts).
