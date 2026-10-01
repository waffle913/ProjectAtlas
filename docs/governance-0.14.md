# Governance 0.14

## Boundary

The player controls a persistent fictional `PoliticalPersonState`, never a Country. `GovernanceState.player.controlledPersonId` is only an identity reference. Party membership, party leadership and public office are separate facts. Losing office removes capabilities while preserving the person and player control.

`governance-0.14-v1` is canonical dynamic state. It stores persons and event-driven political proposals; it does not copy the static 0.13 political registry or the 0.11 fiscal state. Fresh games contain zero persons and zero proposals until an explicit command creates them.

## Authority

The V1 office roles are `head_of_government`, `head_of_state` and `legislator`. Their authority profile is explicitly `modelled_constitutional_abstraction`. The default head-of-government profile can sponsor legislation, fiscal reform and budget reform and can resolve a legislative vote. A legislator can sponsor and vote on legislation but cannot use the state fiscal powers. The head-of-state default grants no capability. Callers may supply an explicit capability set for future country-specific constitutional rules.

Party leadership never grants state authority. Submission and vote resolution require the proposer to be the currently controlled person, to hold an office in the proposal Country and to have each required capability.

## Proposal lifecycle

Fiscal proposals use the existing complete `Policy` and `Budget` types. Their lifecycle is:

`draft -> submitted -> enacted | rejected | unavailable`

A draft may also be withdrawn, and a submitted proposal may be withdrawn before resolution. Submission defensively clones the logical payload, records a deterministic fingerprint and makes all later changes go through a rejected draft-only command. Invariants detect direct or saved-state payload alteration. A new content choice requires a new draft or withdrawal and replacement.

Dates are explicit. The effective date cannot precede the current simulation date. Fiscal validation is shared with `scheduleFiscalReform()`, including the rule that an edited sourced legal rule must become explicitly `modelled`.

## Support and vote

`classifyProposalImpact()` derives political direction only from the difference between current fiscal state and the proposed values. Personal and corporate tax deltas inform `fiscal_distribution`; health and education appropriations inform `public_services`; pensions and income support inform `income_security`; and infrastructure appropriations inform `infrastructure`. The result is a direction explanation, not an economic forecast.

Public support is computed on demand from cohort issue preferences, salience, engagement and population. It returns support, opposition and neutral shares summing to 10,000. It does not mutate opinion and applies no government, popularity or crisis bonus.

Parliamentary support uses chamber seats and fictional party issue positions. Parties vote as deterministic blocks. Neutral low-confidence fallback profiles abstain rather than receiving invented views. Independent or unreconciled seats remain unavailable. The V1 procedure is explicitly `modelled_procedure_v1`: a simple majority of votes cast in every applicable chamber. Every chamber must have complete seat allocation to enact; missing data never implies approval.

The static registry currently has 57 Countries whose chamber seat allocations meet the procedural completeness rule. None of those 57 also has sufficiently differentiated sourced ideological party profiles, so the default 2026 data yields abstentions rather than fabricated support. The pure estimate and resolution APIs accept an explicit registry argument so the same mechanism can consume better admissible party evidence later and can be contract-tested without changing production data.

## Enactment and causality

An adopted proposal calls `scheduleFiscalReform()` exactly once and records the assigned fiscal sequence. It never writes fiscal Countries directly and never modifies socioeconomy, services, opinion or crises. The existing daily fiscal reform task applies the change on its effective date. Existing monthly fiscal/economic tasks, weekly political opinion and monthly crisis evaluation then carry any material consequences.

Support inspection is marked `engine_debug_reality`; it is not the player information/perception interface planned for 0.15.

## Persistence and performance

Schema 12 adds only the governance branch. Migration from schema 11 initializes it on the saved date with no player, persons, proposals or invented history. Governance is conserved across fidelity levels. It has no scheduler task or polling loop, so ordinary ticks preserve its object identity. Defensive snapshots and saves include it through the existing canonical mechanisms.

## Limitations

- No elections, campaigns, ministers, coalition negotiation, political AI or final UI exist in 0.14.
- The procedure is a generic model, not a claim about any Country's constitution.
- Independent legislators have no inferred positions and therefore prevent complete resolution where their votes are necessary.
- Political impact is directional and does not forecast GDP, revenue or popularity.
- Current ideological and seat evidence do not overlap enough to produce a sourced real-world enactment path; additional admissible evidence is required rather than invented.
