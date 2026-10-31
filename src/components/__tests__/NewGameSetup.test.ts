// @vitest-environment happy-dom
import { beforeAll,afterEach,describe,it,expect,vi } from 'vitest';
import { act,createElement } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { NewGameSetup,initialNewGameDraft,type NewGameDraft } from '../new-game/NewGameSetup';
import { initializeNewGame } from '../../simulation/initialization';
import { countryStartingOptions,selectableStartingCountryIds } from '../../simulation/governance/selection';
import { startingSelectionSnapshot,createConfirmedCampaign } from '../../app/newCampaign';
import { worldBase,worldRegions,worldCountryIds,worldInputs,worldPoliticalInputs } from '../../simulation/__tests__/worldScenario';
import type { SimulationState } from '../../types';
import registry from '../../data/entity-registry.json';
import type { LoadedCountryData } from '../../data/countryData';
vi.mock('../new-game/CountryGlobe',()=>({CountryGlobe:()=>createElement('div',{'aria-label':'Globe'})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let baseline:SimulationState;let root:Root|undefined;let el:HTMLDivElement;
beforeAll(()=>{baseline=initializeNewGame(worldBase(),worldRegions,worldCountryIds,worldInputs,worldPoliticalInputs);},60000);
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;el?.remove();});
const data={registry,factsByCountryId:new Map()} as unknown as LoadedCountryData;
function harness(){let draft=initialNewGameDraft(data.registry.countries);const confirm=vi.fn(),back=vi.fn();el=document.createElement('div');document.body.append(el);root=createRoot(el);const render=()=>act(()=>root!.render(createElement(NewGameSetup,{data,territories:[],selectionState:startingSelectionSnapshot(baseline),draft,onDraftChange:(d:NewGameDraft)=>{draft=d;render();},onConfirm:confirm,onBack:back,onLoad:vi.fn(),onSettings:vi.fn(),onCredits:vi.fn(),onExit:vi.fn()})));render();return {confirm,back,choose:(countryId:string)=>{draft={...initialNewGameDraft(data.registry.countries),countryId};render();},get draft(){return draft;}};}
function button(name:string){const b=[...el.querySelectorAll('button')].find(b=>b.textContent?.trim()===name || b.textContent?.trim().startsWith(name));if(!b)throw Error(name);return b;}
function click(b:HTMLElement){act(()=>b.click());}
describe('new game setup with canonical starting APIs',()=>{
 it('keeps every country inspectable, including unavailable starts; missing facts stay missing',()=>{harness();expect(el.querySelectorAll('select[aria-label="Catalogue complet des pays"] option')).toHaveLength(registry.countries.length);expect(el.textContent).toContain('Indisponible');expect(el.textContent).not.toContain('68 042 000');});
 it('shows France without granting unresolved national authority',()=>{const h=harness();const fr=registry.countries.find(c=>c.externalIds.isoAlpha2==='FR')!;h.choose(fr.id);click(button('Continuer'));const expected=countryStartingOptions(baseline,fr.id).paths.national_leader.candidates.length;expect(button('Dirigeant national').disabled).toBe(expected===0);expect(h.confirm).not.toHaveBeenCalled();});
 it('requires an admissible explicit person, preserves the selection on backward steps and confirms only at the end',()=>{const h=harness();const id=[...selectableStartingCountryIds(baseline)][0];h.choose(id);click(button('Continuer'));expect(button('Continuer').disabled).toBe(true);const path=([...el.querySelectorAll('.ng-paths button')] as HTMLButtonElement[]).find(b=>!b.disabled)!;click(path);click(el.querySelector('.ng-person')! as HTMLElement);click(button('Continuer'));expect(el.textContent).toContain('1er janvier 2026');click(button('Continuer'));click(button('← Précédent'));expect(h.confirm).not.toHaveBeenCalled();click(button('Continuer'));click(button('Lancer la campagne'));expect(h.confirm).toHaveBeenCalledExactlyOnceWith(id,h.draft.path,h.draft.personId);});
 it('returning to menu and inspecting a different country cannot mutate the active baseline',()=>{const before=JSON.stringify(baseline);const h=harness();h.choose(registry.countries[1].id);click(button('← Retour au menu'));expect(h.back).toHaveBeenCalledOnce();expect(h.confirm).not.toHaveBeenCalled();expect(JSON.stringify(baseline)).toBe(before);});
 it('rejects an unauthorized confirmation without changing its source state',()=>{const base=worldBase();const before=JSON.stringify(base);expect(()=>createConfirmedCampaign(base,{regions:worldRegions,countryIds:worldCountryIds,socioeconomicData:worldInputs,politicalData:worldPoliticalInputs},{countryId:registry.countries[0].id,path:'national_leader',personId:'unknown'})).toThrow();expect(JSON.stringify(base)).toBe(before);},60000);
});
