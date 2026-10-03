# Governance 0.14

## Boundary

The player controls a persistent fictional `PoliticalPersonState`, never a Country. `GovernanceState.player.controlledPersonId` is only an identity reference. Party membership, party leadership and public office are separate facts. Losing office removes capabilities while preserving the person and player control.

`governance-0.14-v1` is canonical dynamic state. It stores persons and event-driven political proposals; it does not copy the static 0.13 political registry or the 0.11 fiscal state. Fresh games contain zero persons and zero proposals until an explicit command creates them.

## Authority

The [0.16 candidate](military-0.16.md) conservatively derives peacetime administrative-defense management from the controlled active executive office, resolved institutional evidence, government information access and existing budget sponsorship. A legislator with both flags still cannot manage forces; party/Country selection grants none. Defense-only proposals record the legal authorization delta, keep future capability unsupported and constrain fiscal pressure by dated actual obligations, not an assumed budget-to-power effect. Existing proposals/votes are not replayed or reinterpreted.

The V1 office roles are `head_of_government`, `head_of_state` and `legislator`. Their authority profile is explicitly `modelled_constitutional_abstraction`. The default head-of-government profile can sponsor legislation, fiscal reform and budget reform and can resolve a legislative vote. A legislator can sponsor and vote on legislation but cannot use the state fiscal powers. The head-of-state default grants no capability. Callers may supply an explicit capability set for future country-specific constitutional rules.

Party leadership never grants state authority. Submission and vote resolution require the proposer to be the currently controlled person, to hold an office in the proposal Country and to have each required capability.

## Proposal lifecycle

Fiscal proposals use the existing complete `Policy` and `Budget` types. Their lifecycle is:

`draft -> submitted -> enacted | rejected | unavailable`

A draft may also be withdrawn, and a submitted proposal may be withdrawn before resolution. Submission defensively clones the logical payload, records a deterministic fingerprint and makes all later changes go through a rejected draft-only command. Invariants detect direct or saved-state payload alteration. A new content choice requires a new draft or withdrawal and replacement.

Dates are explicit. People and proposals cannot predate governance initialization; an appointment cannot predate either initialization or the person. The effective date cannot precede proposal creation. Fiscal validation is shared with `scheduleFiscalReform()`, including the rule that an edited sourced legal rule must become explicitly `modelled`. A submitted proposal resolved after its effective date terminates as `unavailable/effective_date_expired`; it is never applied retroactively or silently redated.

## Situational political evaluation

Ideology describes goals, priorities and preferred outcomes, not preferred buttons. The on-demand `ProposalAnalysis` follows the chain material situation -> structural proposal delta -> consequences supported by existing fiscal calculations -> goal distance -> compromise cost -> continuous agreement. It records direct policy changes, current material context, expected consequences, issue effects, unsupported changes, limitations and coverage. This keeps a genuinely neutral proposal distinct from one the engine cannot evaluate.

The current material view aggregates present employment, basic-needs coverage, disposable-income distribution, fiscal revenue and spending, debt, arrears, service coverage and infrastructure backlog. A crisis flag itself adds no support. Material severity matters only through these underlying quantities.

Budget effects compare appropriations with current need, coverage, backlog and fiscal pressure. Tax effects use a pure immediate counterfactual over the current 0.11 regional bases. It holds transfers, public orders and other non-tax flows constant; proposed disposable income differs only by personal and employee tax incidence. Personal allowances and brackets, consumption tax, employee/employer payroll and corporate rates are structurally diffed. VAT changes affect the explicit consumption-tax purchasing-power burden rather than pretending to change disposable cash income. Household incidence and known-tax revenue are evaluated when their existing bases are available. Future employment response to employer payroll tax and corporate ownership incidence stay explicitly partial. Excise, property and other reserved taxes remain unsupported until their economic bases exist. A `null` tax rule is an unavailable legal baseline, never a zero rate.

No hidden future simulation is run. The analysis does not predict GDP, growth, inflation or unemployment. Effects that require future dynamics remain partial or unavailable and lower confidence.

## Compromise tolerance

Every party goal has an issue-specific ideal point, importance, compromise tolerance and confidence. The default tolerance is derived deterministically from the existing 0.13 issue position, intensity and evidence confidence; it never uses the party name. A high-intensity core issue therefore has a narrower ordinary compromise zone than a secondary issue, while every tolerance remains above zero.

For each measurable consequence the evaluator compares distance to the ideal before and after the proposal. Movement toward the ideal raises agreement; movement away lowers it. Movement beyond the issue's compromise zone adds a compromise cost. A severe, materially demonstrated improvement on another goal may reduce that relative cost by at most 70%, so exceptional conditions can make a difficult compromise less bad without changing the party's ideal, importance or normal tolerance. The same mechanism is symmetric across political directions.

Consequences are weighted continuously by issue importance and actual magnitude. This allows a small change, a useful change and an overshoot in the same direction to receive different scores. Positive and negative drivers and cross-issue trade-offs are retained in `PartyProposalEvaluation`.

The centralized V1 thresholds are: agreement at least 6,000 and confidence at least 3,000 for `YES`; agreement at most 4,000 and sufficient confidence for `NO`; a sufficiently known middle-range position produces `ABSTAIN`; insufficient confidence or unavailable evaluation produces `UNKNOWN`. Neutral low-confidence fallback profiles cannot acquire strong conviction from a clear material context.

## Public and parliamentary estimates

Public support is computed on demand from cohort issue preferences, salience, engagement and population. It returns support, opposition, genuine neutral and unknown shares summing to 10,000, plus known and unknown represented-person counts. Missing evidence is never converted into neutral opinion. It does not mutate opinion and applies no government, popularity or crisis bonus.

Parliamentary support uses chamber seats and fictional party goal profiles. Parties vote as deterministic blocks only after continuous evaluation. Each party result exposes agreement, confidence, compromise cost, coverage, decision, drivers and trade-offs. `UNKNOWN` party seats join independent or unreconciled seats in the unavailable bucket and prevent complete chamber coverage. The V1 procedure is explicitly `modelled_procedure_v1`: a simple majority of votes cast in every applicable chamber. Every chamber must have complete seat allocation and known voting behavior to enact or reject; missing data never becomes an abstention or an implied rejection.

The static registry currently has 57 Countries whose chamber seat allocations meet the procedural completeness rule. None of those 57 also has sufficiently differentiated sourced ideological party profiles, so the default 2026 data yields unknown voting behavior rather than fabricated support or abstention. The pure estimate and resolution APIs accept an explicit registry argument so the same mechanism can consume better admissible party evidence later and can be contract-tested without changing production data.

## Enactment and causality

An adopted proposal calls `scheduleFiscalReform()` exactly once and records the assigned fiscal sequence plus a deterministic payload fingerprint. The queued reform carries proposal-origin metadata. Once applied, a compact fiscal receipt retains the same sequence, country, date, fingerprint and origin, so invariants can prove ownership without a second history engine. It never writes fiscal Countries directly and never modifies socioeconomy, services, opinion or crises. The existing daily fiscal reform task applies the change on its effective date. Existing monthly fiscal/economic tasks, weekly political opinion and monthly crisis evaluation then carry any material consequences.

Support inspection is marked `engine_debug_reality`; it is not the player information/perception interface planned for 0.15.

## Persistence and performance

Schema 12 and the subsystem version strings remain unchanged. Migration from schema 11 initializes governance on the saved date with no player, persons, proposals or invented history. The in-schema schema-12 upgrade accepts the actual aggregate-only chamber shape persisted by the first 0.14 release. It labels those resolved proposals `legacy-0.14-v1`, preserves meaningful aggregate historical votes without inventing party evaluations, and adds deterministic enactment references and receipts where required. A historical enactment remains enacted exactly once. An aggregate rejection containing no yes/no evidence and only legacy abstentions becomes unavailable because the old format cannot distinguish genuine abstention from unknown behavior. Current `situational-0.14-v2` proposals still require per-party evaluations and full threshold/seat reconciliation. The upgrade also introduces public unknown coverage. Governance is conserved across fidelity levels. It has no scheduler task or polling loop, so ordinary ticks preserve its object identity. Analysis runs only for inspection or resolution. Defensive snapshots and saves include it through the existing canonical mechanisms.

## Limitations

The final 0.15 foundation hardening binds structured `situational-0.14-v2`
and `plurality-0.15-v1` parliamentary records to the pinned political registry;
candidate `situational-plurality-0.15-v2` records retain the same reconciliation:
the applicable chamber set, Country/party identities, per-party seats, totals
and independent/unknown residual must reconcile. Aggregate-only
`legacy-0.14-v1` records retain their historical compatibility path without
invented party evidence. Persisted analysis is checked internally (signed
magnitude, numeric before/after/delta, supported consequence aggregation and
neutrality), not recomputed from today's sources or material state.
The candidate [0.15 institutional evaluation](information-0.15.md#situational-institutional-interest-candidate-pending-independent-review)
adds versioned evidence, not a new fiscal model or a historical-vote migration.

- No elections, campaigns, ministers, coalition negotiation, political AI or final UI exist in 0.14.
- The procedure is a generic model, not a claim about any Country's constitution.
- Independent legislators have no inferred positions and therefore prevent complete resolution where their votes are necessary.
- Immediate fiscal counterfactuals reuse current bases; employment response, corporate ownership incidence and future macroeconomic effects remain unavailable.
- Temporary, targeted and universal policy scope is a future extension point. The evaluator is path/consequence based, but 0.14 does not invent fiscal instruments absent from 0.11.
- Current ideological and seat evidence do not overlap enough to produce a sourced real-world enactment path; additional admissible evidence is required rather than invented.
