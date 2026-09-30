# National institutions and political opinion 0.13

## Contract

Schema 11 adds `SimulationState.politics`, version `politics-0.13-v1`. The domain is national: each permanent Country has one institution record, three explicitly fictional parties and two explicitly fictional organized-interest archetypes. It does not create regional governments. Regional records describe opinion among the existing socioeconomic cohorts and retain their existing population counts.

The only admissible real political input applicable on the scenario date is `political-offices.json`, reference date 2026-01-01. It establishes head-of-state and head-of-government office structure for 199 entities. It does not establish an executive-system classification, legislature, electoral rule, seat allocation or coalition. Those fields therefore remain `unavailable`. The government-form snapshot dated 2026-09-26 is not backdated into the scenario. No real party, logo, slogan, vote share or organization membership is inferred.

Parties are the fictional analytical identities Social Compact, Civic Centre and National Stewardship. Each carries nine ideology dimensions and six issue positions. Workers Federation and Civic Services Association are fictional union/association archetypes. Their membership is unavailable. Repeated names across Countries describe model roles, not transnational organizations or real political actors.

## Opinion model

Every nonempty one of the nine existing income/orientation cohorts receives preferences and salience for fiscal distribution, public services, labour protection, income security, infrastructure and public order. Party support plus undecided sums to exactly 10,000 basis points for every cohort, Region and Country. Aggregation is population weighted and uses deterministic largest remainder allocation.

The shared scheduler runs `politics.opinion-weekly` at priority 400, after economy (100), fiscal/services (150), administration (200) and crises (300). Updates read current disposable income, unemployment, basic-needs coverage, tax burden, transfers and service/infrastructure coverage. They use inertia for preferences, salience, sentiment and party support, so deterioration and recovery are progressive. Crisis phase and pressure are not inputs: political opinion reacts to the underlying material condition, avoiding a duplicate crisis bonus.

The model uses no random draw. Iteration order, allocation and IDs are deterministic. It applies no effects to socioeconomic, fiscal, crisis, diplomatic or military state. Country fidelity changes conserve the complete politics branch.

## Provenance and assumptions

All fictional identities, ideology values, initial preferences, support values, engagement, sensitivities and inertia constants are `modelled`. Initial opinion has no polling or electoral anchor. This is stated in each cohort and party provenance. Unknown institutions and real-world quantities remain unavailable rather than zero.

The committed `politics-coverage-report.json` records each Country's coverage. Current totals are 199 partial office structures and 53 unavailable institution records; all 252 legislatures, electoral systems, seat allocations and coalitions are unavailable. The runtime contains 756 fictional parties and 504 fictional organizations.

## Saves, snapshots and limits

Migration 10→11 preserves all earlier state and initializes politics at the saved logical date. It creates no prior weekly evaluation or opinion history. Schema-11 saves retain all political state. The politics branch is copy-on-write: ordinary days reuse it; weekly evaluation replaces only political structures while retaining economy, fiscal and crisis branches. Debug inspection is available through `inspectPolitics()` and the Country panel.

This milestone has no election simulation, candidacies, voting, legislation, player political actions, ministers, cabinets, subnational governments, protests, unrest, coups, lobbying operations, media, campaigning, international party links or political AI. It provides the deterministic state and causal opinion foundation for later milestones.

Run `npm run politics:audit` for coverage and behavioral tests, `npm run politics:benchmark` for the three-year full-world workload, and `npm run benchmark:world` for the shared engine baselines.
