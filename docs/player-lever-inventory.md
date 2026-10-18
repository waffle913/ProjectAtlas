# Player-Lever Inventory

Consolidated reconciliation of every intended player lever against its true
implementation state. A lever is **not** "complete" merely because its function
exists, "integrated" merely because unit tests pass, or "functional" merely
because it renders HTML. Dispositions:

- **Complete** — engine command + authority + a UI/command/scheduler consumer + tests + save/load.
- **Wire existing** — engine command + authority implemented, but no player-facing consumer.
- **Complete integration** — implemented + tested library mechanism with no canonical scheduler/command consumer.
- **Design-blocked** — a named unresolved design decision gates implementation.
- **Deferred** — recorded, not implemented (missing data, downstream milestone, or reserved action).

Legend for `Engine`: ✓ implemented · ◐ partial · ✗ missing. `Runtime consumer`:
UI / command / scheduler / none.

## 1. Government, ministers and constitutional authority

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Control a persistent person (setControlledPerson) | ✓ governance/runtime | StartGame + player handoff | synthetic/registry | controlled person | Wired | ✓ | Complete |
| Resolve leadership handoff (resolvePlayerHandoff) | ✓ | BriefingTablet | succession state | successor exists | Wired | ✓ | Complete |
| Appoint/remove minister | ✓ appointMinister/removeMinister | none | cabinet registry | executive head | absent | ✓ | Wire existing |
| Replace party leader | ✓ replacePartyLeader | none | modelled successor | party rules | absent | ✓ | Wire existing |
| Assign/transfer/revoke office | ✓ | initialization | offices registry | governance | initialization | ✓ | Complete (init) |
| Declare/end state of emergency | ✓ constitution/runtime | SecurityPanel (A1.6) | constitution | executive + active crisis | Wired | ✓ | Complete |
| Judicial review of amendments | ◐ refer/decide | none | constitution | court | absent | ✓ | Complete integration |
| Constitutional amendment adoption | ◐ schedule/apply | constitution.daily scheduler | amendment payload | enacted instrument | absent | ✓ | Complete integration |
| Mutable constitution / full amendment procedure | ✗ | — | — | — | absent | — | Design-blocked (0.23) |

## 2. Parties, Parliament, proposals, voting and elections

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Draft/submit/withdraw fiscal proposal | ✓ createFiscalProposal, submit/withdrawProposal | FiscalPolicy | fiscal rules | proposer | Wired | ✓ | Complete |
| Resolve parliamentary vote | ✓ resolveProposalVote/ForActor | FiscalPolicy (resolve) | aggregate seats | chambers | Wired | ✓ | Complete |
| Pre-vote negotiation | ✓ holdPreVoteNegotiation | none | situational plurality | party actor | absent | ✓ | Wire existing |
| Issue party whip | ✓ issuePartyWhip | none | party | party leader | absent | ✓ | Wire existing |
| Censure government | ✓ censureGovernment | none | chamber | chamber | absent | ✓ | Wire existing |
| Hold referendum | ✓ holdReferendum | none | constitution | executive | absent | ✓ | Wire existing (amend procedure design-blocked) |
| Dissolve parliament | ✓ dissolveParliament | none | elections registry | executive/parliament | absent | ✓ | Wire existing |
| Run election | ✓ runElection / runElectionCycle | elections.daily scheduler | support→seats | election rules | absent (scheduled) | ✓ | Complete integration (no manual trigger) |
| Make campaign promise | ✓ makeCampaignPromise | none | typed promise | party | absent | ✓ | Wire existing |

## 3. Taxes, fiscal budgets, public debt and borrowing

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Fiscal reform (tax + budget) | ✓ scheduleFiscalReform / applyReforms | fiscal.reforms daily + FiscalPolicy | sourced tax rules, aggregates | proposer + enactment | Wired | ✓ | Complete |
| Monthly budget execution | ✓ runFiscalMonth | fiscal.monthly (150) | fiscal ledgers | — (scheduler) | EconomyPanel/services read | ✓ | Complete |
| Borrowing / solvency / credit ceiling | ✓ assessSolvency + creditCeiling | fiscal.monthly | fiscal surfaces | — | read via assessFiscalSolvency (no UI) | ✓ | Complete (engine) |
| Debt service / arrears | ✓ | fiscal.monthly | debt stock | — | partial read | ✓ | Complete |
| National currency / FX / bank money | ✗ | — | — | — | — | — | Design-blocked (0.26) |

## 4. Households, businesses, prices and employment

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Economy month (employment/income/consumption) | ✓ socioeconomy | monthly (100) | population+baselines | — | EconomyPanel read | ✓ | Complete |
| Firm accounts / retained surplus | ✓ economy/firms | derivation view | fiscal | — | EconomyPanel | ✓ | Complete integration (derivation) |
| Prices / domestic markets | ◐ | trade derivation | — | — | TradeInspection read | ✓ | Complete integration |
| Direct player economic levers | ✗ | — | — | — | — | — | Deferred (no magic modifiers) |

## 5. Health, education, pensions, assistance and infrastructure

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Service budget allocation | ✓ fiscal annualBudget | fiscal.monthly evolveService | budget | budget law | services panel read | ✓ | Complete |
| Service delivery (coverage/backlog) | ✓ evolveService + serviceSupplyFactorBps | fiscal.monthly | TradeStock supply | — | services panel | ✓ | Complete |
| Establishments / beds / personnel | ◐ services V2 library | none | no service↔asset mapping | — | absent | ✓ | Complete integration (no data) |
| Rent rules | ✗ | — | — | — | — | — | Design-blocked (0.29) |

## 6. Natural resources, energy, extraction and regional assets

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Stock reconciliation (TradeStock↔ledger) | ✓ reconcileTradeStock | trade.prepare-monthly | TradeStock | — | TradeInspection | ✓ | Complete |
| Extraction/energy/network installations | ✗ (registries empty) | — | no admitted data | — | absent | — | Complete integration (no data) |
| Intra-region spatial grid | ✗ | — | — | — | — | — | Design-blocked (0.27) |
| Construction/maintenance assets | ✓ assets | construction.* + fiscal | assets | budget | none (indirect) | ✓ | Complete |

## 7. Production, technology, research and industrial capacity

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Military factory capacity effect | ✓ applyCapacityEffect | military funding | technology registry (empty) | — | MilitaryCapabilities read | ✓ | Complete |
| Research / adoption / process chains | ✗ (no registry) | — | no canonical registry | — | absent | — | Complete integration (no data) |
| Competition / market structures | ✗ | — | — | — | — | — | Design-blocked (0.28) |

## 8. Population, migration and demographics

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Population transitions (birth/death/migration) | ✓ applyDemographicTransition / applyInternationalMigration | none | no observed rates | — | absent | ✓ | Complete integration (no consumer) |
| Automatic demographic rates | ✗ | — | no observed rates | — | — | — | Deferred (no data) |
| Cohort distribution | ◐ fixed split | socioeconomy | 0.10 model | — | — | ✓ | Complete |

## 9. Police, security, crises, justice and intelligence

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Crisis lifecycle (tripwires/severity/pressure) | ✓ crisis | crisis.monthly | real variables | — | SecurityPanel read (gated) | ✓ | Complete |
| State of emergency | ✓ | SecurityPanel | constitution | executive | Wired | ✓ | Complete |
| Police deployment | ◐ deployPolice | none | personnel/budget | police authority | absent | ✓ | Complete integration (no consumer) |
| Justice / rights violations | ✗ | — | — | — | — | — | Design-blocked (0.30.6) |
| Intelligence | ✗ | — | — | — | — | — | Design-blocked (0.30.7) |
| Security events / repression | ✗ | — | — | — | — | — | Deferred (depends on justice) |

## 10. Military organization, procurement, deployment, combat and occupation

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Personnel authorization / recruitment | ✓ setMilitaryAuthorization | military monthly | admitted capability | military mgmt authority | MilitaryCapabilities | ✓ | Complete |
| Equipment orders / procurement | ✓ placeMilitaryOrder | military funding | orders | military mgmt authority | MilitaryCapabilities | ✓ | Complete |
| Deploy / move / resupply / withdraw | ✓ operations | operations.daily | deployments | ops authority | OperationsPanel | ✓ | Complete |
| Combat / occupation / territorial control | ✓ war + operations | operations.daily | wars | war declaration | OperationsPanel read | ✓ | Complete |
| War declaration | ◐ (via crises→force) | none (no explicit UI) | casus belli | executive | absent | ✓ | Wire existing |

## 11. Diplomacy, relations, sanctions, negotiations and treaties

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Condemn / import-export restriction / lift | ✓ international + applyCoercionMeasure | DiplomacyPanel (A1.6) | 0.18 actions | executive (GI access) | Wired | ✓ | Complete |
| Concession (relation/tariff) | ✓ applyConcession | DiplomacyPanel | bilateral/route | executive | Wired | ✓ | Complete |
| Negotiation resolution | ✓ resolveNegotiation (vocab) | none | proposal | — | absent | ✓ | Complete integration |
| Treaties (sign/ratify/activate/withdraw/terminate) | ✓ multilateral | MultilateralPanel | 0.20 clauses | executive | Wired | ✓ | Complete |
| Mediation | ✗ (0.20 decision kind absent) | — | — | — | — | — | Deferred |

## 12. Foreign trade, tariffs and strategic dependencies

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Trade prepare/settle month | ✓ trade | prepare(95)/settle(110) | TradeStock/routes | — | TradeInspection | ✓ | Complete |
| Stock target (replenishment) | ✓ setTradeStockTarget | TradeInspection | markets | military mgmt | Wired | ✓ | Complete |
| Tariff changes | ◐ via concession/route | DiplomacyPanel | routes | executive | Wired | ✓ | Complete |
| Strategic dependency | ◐ deriveDependency | trade reports | flows | — | read | ✓ | Complete integration |

## 13. Media, government information and public opinion

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Government briefings / reports | ✓ information | information tasks | GI layer | office GI access | BriefingTablet + panels | ✓ | Complete |
| Opinion shifts (media→politics) | ✓ applyOpinionShiftToPolitics | none | politics sentiment | — | absent | ✓ | Complete integration (no consumer) |
| Channel diffusion / statement reach | ✗ (vocabulary) | — | — | — | — | — | Deferred |
| Disinformation / censorship | ✗ | — | — | — | — | — | Design-blocked (0.32) |

## 14. Time, notifications, briefings, map layers and save/load

| Lever | Engine | Runtime consumer | Data | Authority | UI | Persistence | Disposition |
|---|---|---|---|---|---|---|---|
| Pause / speed / advance | ✓ clock | Clock | — | — | Wired | ✓ | Complete |
| Map layers (ownership/population/economy/occupation) | ✓ mapLayers | App | canonical | — | Wired (A1.1/F1) | ✓ | Complete |
| Save / load / autosave | ✓ saveStorage + save | SaveManager + App | full state | — | Wired (A1.4) | ✓ | Complete |
| Urgent briefing pause | ✓ urgency | App | briefings | pauseOnUrgent | Wired | ✓ | Complete |

## Totals by disposition

| Disposition | Count (distinct levers) |
|---|---|
| Complete | 32 |
| Wire existing | 9 |
| Complete integration | 11 |
| Design-blocked | 8 |
| Deferred | 5 |
| **Total** | **65** |

## Totals by domain

Government 7 · Parties/Parliament 6 · Elections 3 · Fiscal 4 · Economy 3 ·
Services 4 · Resources 4 · Industry 3 · Demography 3 · Security 6 · Military 5 ·
Diplomacy 5 · Trade 4 · Media/Info 4 · Time/UI 4.
