import type { SimulationState, RegionEntity } from '../types';
import type { InitializationData } from '../simulation/socioeconomy/initialization';
import type { PoliticalInitializationData } from '../simulation/politics/initialization';
import { initializeNewGame } from '../simulation/initialization';
import { assertAuthorizedStartingPerson, type PoliticalStartPath } from '../simulation/governance/selection';
import { setControlledPerson } from '../simulation/governance/runtime';
export interface NewCampaignSeed { regions: RegionEntity[]; countryIds: string[]; socioeconomicData: InitializationData; politicalData: PoliticalInitializationData }
export interface CampaignChoice { countryId:string;path:PoliticalStartPath;personId:string }
/** A presentation-only snapshot of precisely the fields read by the canonical selection API.
 * No second world, clock, economy or RNG is kept for the wizard. References are immutable
 * baseline records, independent of the active campaign's later player/office changes.
 */
export function startingSelectionSnapshot(state:SimulationState):SimulationState {
  return {date:state.date,governance:state.governance,elections:state.elections,politics:state.politics} as SimulationState;
}
/** Build and validate privately; the application installs the result atomically only on success. */
export function createConfirmedCampaign(base:SimulationState,seed:NewCampaignSeed,choice:CampaignChoice):SimulationState {
  const fresh=initializeNewGame(structuredClone(base),seed.regions,seed.countryIds,seed.socioeconomicData,seed.politicalData);
  const person=fresh.governance.persons[choice.personId];
  if(!person || person.countryId!==choice.countryId)throw new Error('Le personnage choisi ne correspond pas au pays sélectionné.');
  const paths=assertAuthorizedStartingPerson(fresh,choice.personId);
  if(!paths.includes(choice.path))throw new Error('Ce personnage n’est pas admissible pour le parcours sélectionné.');
  return setControlledPerson(fresh,choice.personId);
}
