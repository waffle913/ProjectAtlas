import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
async function storage(page:import('@playwright/test').Page){
 const entries=JSON.parse(await fs.readFile('artifacts/load-game/fixtures.json','utf8'));
 // Exercise the production native adapter through a synthetic IPC boundary. Full-world saves
 // exceed browser localStorage quotas; do not change production storage to fit the test.
 await page.addInitScript((entries)=>{
  const index:Record<string,unknown>={};const writes=new Map<string,string>();const removed=new Set<string>();
  for(const entry of entries)index[entry.id]=entry.metadata;
  for(const kind of ['corrupt','incompatible','missing'])index['synthetic.'+kind]={...entries[0].metadata,name:'TEST SYNTHÉTIQUE — '+({corrupt:'corrompue',incompatible:'incompatible',missing:'introuvable'})[kind as 'corrupt'|'incompatible'|'missing']};
  let settings:string|null=null;
  (window as unknown as {__syntheticWrites:number}).__syntheticWrites=0;
  (window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__={invoke:async(command:string,args:Record<string,unknown>={})=>{
   const id=String(args.id);
   if(command==='settings_read')return settings;
   if(command==='settings_write'){settings=String(args.json);return;}
   if(command==='set_display_mode')return;
   if(command==='save_file_list')return [...entries.map(e=>e.id),'synthetic.corrupt','synthetic.incompatible','__index__'];
   if(command==='save_file_read'){
    if(removed.has(id))return null;if(writes.has(id))return writes.get(id);
    if(id==='__index__')return JSON.stringify(index);
    if(id==='synthetic.corrupt')return '{broken';
    if(id==='synthetic.incompatible')return JSON.stringify({schemaVersion:999});
    const response=await fetch('/__synthetic_saves__/'+id+'.json');return response.ok?await response.text():null;
   }
   if(command==='save_file_write'){if(id!=='__index__')(window as unknown as {__syntheticLastSave:string}).__syntheticLastSave=String(args.data);(window as unknown as {__syntheticWrites:number}).__syntheticWrites++;writes.set(id,String(args.data));return;}
   if(command==='save_file_delete'){(window as unknown as {__syntheticWrites:number}).__syntheticWrites++;removed.add(id);return;}
   throw new Error('Unexpected synthetic IPC command '+command);
  }};
 },entries);
}
test('real load list, saved world, explicit restore and independent history',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await storage(page);await page.goto('/');await page.getByRole('button',{name:'Charger une partie',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Charger une partie',exact:true})).toBeVisible();
 await expect(page.locator('.ng-steps')).toHaveCount(0);
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/list-${viewport.width}x${viewport.height}.png`});
 }
 for(const name of ['corrompue','incompatible','introuvable']){
  await page.locator('.lg-save-name').filter({hasText:name}).click();await expect(page.getByRole('alert')).toContainText('inaccessible ou incompatible');
 }
 await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();
 await expect(page.locator('[data-globe-status]')).toHaveAttribute('data-globe-status','ready');
 await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');
 await expect(page.locator('.lg-campaign-panel')).toContainText('18 juin 2031');await expect(page.locator('.lg-campaign-panel')).toContainText('contrôle étranger');
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/occupied-${viewport.width}x${viewport.height}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 }
 const original=await page.evaluate(()=>(window as unknown as {__syntheticWrites:number}).__syntheticWrites);
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· ceded'}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'artifacts/load-game/ceded-1920x1080.png'});await expect(page.locator('.lg-campaign-panel')).toContainText('guerre terminée, évaluation archivée');
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· opposition'}).click();await expect(page.locator('.lg-campaign-panel')).toContainText('Aucun rapport militaire accessible');
 await page.screenshot({path:'artifacts/load-game/opposition-1920x1080.png'});
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();
 expect(await page.evaluate(()=>(window as unknown as {__syntheticWrites:number}).__syntheticWrites)).toBe(original);
 await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();await expect(page.locator('.clock strong')).toContainText('2031');
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Load Game',exact:true}).click();
 await page.locator('.lg-save-name').filter({hasText:'· ceded'}).click();await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.getByRole('button',{name:'Retour au menu',exact:false}).click();await expect(page.locator('.clock strong')).toContainText('2031');
 // Verify the active snapshot after previewing B by saving through the actual game UI/backend.
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Save As',exact:true}).click();
 await page.getByPlaceholder('Save name').fill('TEST SYNTHÉTIQUE — contrôle de continuité');
 await page.getByRole('dialog',{name:'Save game',exact:true}).getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Save game',exact:true})).toHaveCount(0);
 const expected=JSON.parse(await fs.readFile('artifacts/load-game/storage/synthetic.occupied.json','utf8'));
 const maine=Object.keys(expected.occupationByRegion)[0];
 const active=await page.evaluate((maine)=>{const s=JSON.parse((window as unknown as {__syntheticLastSave:string}).__syntheticLastSave);return {date:s.date,tick:s.engine.tick,seed:s.engine.seed,paused:s.paused,person:s.governance.player.controlledPersonId,owner:s.regionOwnership[maine],occupation:s.occupationByRegion[maine]};},maine);
 expect(active).toEqual({date:expected.date,tick:expected.engine.tick,seed:expected.engine.seed,paused:expected.paused,person:expected.governance.player.controlledPersonId,owner:expected.regionOwnership[maine],occupation:expected.occupationByRegion[maine]});
 // Existing pause menu remains authoritative; returning from settings/load never restores a preview.
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.locator('.settings-pane label').filter({hasText:'UI scale'}).locator('select').selectOption('1.5');await page.getByRole('button',{name:/Back/}).click();
 await page.getByRole('button',{name:'Charger une partie',exact:true}).click();
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/list-ui150-${viewport.width}x${viewport.height}.png`,fullPage:true});}
 await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/occupied-ui150-${viewport.width}x${viewport.height}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
 expect(errors).toEqual([]);
});
test('real preview without WebGL remains loadable; deletion needs confirmation',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await storage(page);
 await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return Reflect.apply(old,this,[type,...args]);} as typeof old;});
 await page.goto('/');await page.getByRole('button',{name:'Charger une partie',exact:true}).click();await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();
 await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/load-game/no-webgl-1366x768.png'});
 await page.getByRole('button',{name:'Supprimer',exact:false}).click();await page.getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.locator('.lg-campaign-panel')).toBeVisible();
 await page.getByRole('button',{name:'Supprimer',exact:false}).click();await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
 await expect(page.locator('.lg-list-panel')).toBeVisible();await expect(page.locator('.lg-save-name').filter({hasText:'· occupied'})).toHaveCount(0);
 await context.close();
});
