// Synthetic UI regression snapshots ONLY. Not scenario/catalogue data and never bundled by App.
import { initializeNewGame } from '../../src/simulation/initialization';
import { setControlledPerson } from '../../src/simulation/governance/runtime';
import { countryStartingOptions } from '../../src/simulation/governance/selection';
import { worldBase,worldRegions,worldCountryIds,worldInputs,worldPoliticalInputs,worldContext } from '../../src/simulation/__tests__/worldScenario';
import countries from '../../src/data/entity-registry.json';
import { createClaim } from '../../src/simulation/diplomacy';
import { declareLimitedWar,endWar } from '../../src/simulation/war';
import { recomputeControl } from '../../src/simulation/operations/runtime';
import { runOperationsReports } from '../../src/simulation/operations/reports';
export const canada=countries.countries.find(c=>c.externalIds.isoAlpha2==='CA')!.id;
export const usa=countries.countries.find(c=>c.externalIds.isoAlpha2==='US')!.id;
export const maine=worldRegions.find(r=>r.iso31662==='US-ME')!;
export function loadFixtures(){
 let state=initializeNewGame(worldBase(),worldRegions,worldCountryIds,worldInputs,worldPoliticalInputs);
 const candidate=countryStartingOptions(state,canada).paths.national_leader.candidates[0];
 if(!candidate)throw new Error('Canonical Canadian national starting person unavailable');
 state=setControlledPerson(state,candidate.personId);
 // Deliberately staged future snapshot, not simulated history. Same seed/tick retained.
 state={...state,date:'2031-06-18',paused:true};
 state=createClaim(state,{id:'claim.synthetic.load-ui',claimantCountryId:canada,regionId:maine.id,type:'territorial',creationDate:state.date,reason:'Synthetic UI regression only.'},worldContext);
 state=declareLimitedWar(state,{warId:'war.synthetic.load-ui',attackerCountryId:canada,defenderCountryId:usa,targetRegionId:maine.id,casusBelliId:`claim-derived:claim.synthetic.load-ui:${usa}`},worldContext);
 const components=Object.fromEntries(Object.entries(state.operations.components).map(([id,c])=>[id,c.regionId===maine.id && c.kind==='decisive'?{...c,controllingCountryId:canada,contested:false,captureProgress:0}:c]));
 const occupied=runOperationsReports(recomputeControl({...state,operations:{...state.operations,components}},[maine.id]));
 const ceded=endWar(occupied,'war.synthetic.load-ui','attacker_victory',worldContext);
 const oppositionCandidate=countryStartingOptions(state,canada).paths.opposition_party_leader.candidates[0];
 const opposition=oppositionCandidate?setControlledPerson(occupied,oppositionCandidate.personId):undefined;
 return {occupied,ceded,opposition};
}
