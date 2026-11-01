// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {SettingsMenu} from '../SettingsMenu';
import {DEFAULT_SETTINGS} from '../../app/preferences';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;let host:HTMLDivElement;
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();root=undefined;});
it('synchronizes both scale fields without reactivating unavailable controls',()=>{
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);const onChange=vi.fn();
 act(()=>root!.render(createElement(SettingsMenu,{settings:DEFAULT_SETTINGS,onChange,onBack:()=>{}})));
 const select=host.querySelectorAll('select')[1];act(()=>{select.value='1.5';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(onChange.mock.calls[0][0]).toMatchObject({graphics:{uiScale:1.5},accessibility:{uiScale:1.5}});
 const click=(name:string)=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!.click());
 expect(host.querySelector('select')!.disabled).toBe(true);
 click('Audio');expect(host.querySelector('fieldset')!.disabled).toBe(true);expect(host.textContent).toContain('Aucun système ou contenu audio');
 click('Interface');expect(host.querySelector<HTMLInputElement>('input[type=number]')!.disabled).toBe(true);expect(host.querySelector('select')!.disabled).toBe(true);expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
 click('Accessibility');expect(host.querySelectorAll('select')[1].disabled).toBe(true);
});
