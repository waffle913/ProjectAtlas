// @vitest-environment happy-dom
import { act,createElement } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { SaveManager } from '../SaveManager';
import { listSaves, setSaveBackend } from '../../app/saveStorage';
import { worldBase } from '../../simulation/__tests__/worldScenario';
vi.mock('../new-game/CountryGlobe',()=>({CountryGlobe:()=>createElement('div')}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;let el:HTMLDivElement;let store:Map<string,string>;
function mount(){
 store=new Map([['a','{}'],['broken','not json'],['__index__',JSON.stringify(Object.fromEntries(['a','broken'].map(id=>[id,{name:id,modifiedAt:'2026-01-01'}]))) ]]);
 setSaveBackend({list:()=>[...store.keys()],read:id=>store.get(id)??null,write:async(id,v)=>{store.set(id,v);},remove:async id=>{store.delete(id);}});
 const state=worldBase();const before=JSON.stringify(state);
 const props={onPreview:vi.fn((id:string)=>{if(id==='broken')throw new Error('corrupt');return state;}),onLoad:vi.fn(),onBack:vi.fn(),onNewGame:vi.fn(),onSettings:vi.fn(),onCredits:vi.fn(),onExit:vi.fn()};
 el=document.createElement('div');document.body.append(el);root=createRoot(el);act(()=>root!.render(createElement(SaveManager,props)));
 return {props,state,before};
}
const click=(text:string)=>act(()=>{const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);if(!button)throw new Error(text);button.click();});
afterEach(()=>{if(root)act(()=>root!.unmount());el?.remove();root=undefined;});
describe('load screen actions are explicit',()=>{
 it('remounts a controlled detached preview without restoring or installing it again',()=>{
  const {props,state,before}=mount();const selectedPreview={entry:listSaves()[0],state};const onSelectionChange=vi.fn();
  act(()=>root!.render(createElement(SaveManager,{...props,selectedPreview,onSelectionChange})));
  expect(el.querySelector('[aria-label="Aperçu de campagne"]')).not.toBeNull();expect(props.onPreview).not.toHaveBeenCalled();expect(props.onLoad).not.toHaveBeenCalled();
  act(()=>root!.unmount());root=createRoot(el);act(()=>root!.render(createElement(SaveManager,{...props,selectedPreview,onSelectionChange})));
  expect(el.querySelector('[aria-label="Aperçu de campagne"]')).not.toBeNull();expect(props.onPreview).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
 });
 it('selection previews only; return preserves active state; final load is distinct',()=>{
  const {props,state,before}=mount();act(()=>el.querySelector<HTMLButtonElement>('.lg-save-name')!.click());
  expect(props.onPreview).toHaveBeenCalledWith('a');expect(props.onLoad).not.toHaveBeenCalled();
  expect(el.querySelector('[aria-label="Aperçu de campagne"]')).not.toBeNull();
  click('← Retour à la liste');expect(JSON.stringify(state)).toBe(before);
  act(()=>el.querySelector<HTMLButtonElement>('.lg-save-name')!.click());click('Charger la campagne →');expect(props.onLoad).toHaveBeenCalledWith('a');
 });
 it('keeps other entries after a corrupt selection and requires deletion confirmation',async()=>{
  const {props}=mount();act(()=>el.querySelectorAll<HTMLButtonElement>('.lg-save-name')[1].click());
  expect(el.textContent).toContain('inaccessible ou incompatible');expect(el.querySelectorAll('.lg-save-name')).toHaveLength(2);expect(props.onLoad).not.toHaveBeenCalled();
  act(()=>el.querySelector<HTMLButtonElement>('.lg-delete')!.click());expect(store.has('a')).toBe(true);
  click('Annuler');expect(store.has('a')).toBe(true);
  act(()=>el.querySelector<HTMLButtonElement>('.lg-delete')!.click());
  await act(async()=>{[...el.querySelectorAll('button')].find(b=>b.textContent==='Confirmer la suppression')!.click();});
  expect(store.has('a')).toBe(false);expect(el.querySelectorAll('.lg-save-name')).toHaveLength(1);
 });
});
