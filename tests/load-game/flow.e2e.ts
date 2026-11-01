import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
async function storage(page:import('@playwright/test').Page){
 const entries=JSON.parse(await fs.readFile('artifacts/load-game/fixtures.json','utf8'));
 await page.addInitScript((entries)=>{
  if(localStorage.getItem('load-ui-fixture-installed'))return;
  localStorage.setItem('load-ui-fixture-installed','yes');
  const index:Record<string,unknown>={};
  for(const entry of entries){localStorage.setItem('projectatlas.save.'+entry.id,entry.raw);index[entry.id]=entry.metadata;}
  index['synthetic.corrupt']={...entries[0].metadata,name:'TEST SYNTHÉTIQUE — corrompue'};
  index['synthetic.incompatible']={...entries[0].metadata,name:'TEST SYNTHÉTIQUE — incompatible'};
  index['synthetic.missing']={...entries[0].metadata,name:'TEST SYNTHÉTIQUE — introuvable'};
  localStorage.setItem('projectatlas.save.synthetic.corrupt','{broken');
  localStorage.setItem('projectatlas.save.synthetic.incompatible',JSON.stringify({...JSON.parse(entries[0].raw),schemaVersion:999}));
  localStorage.setItem('projectatlas.save.__index__',JSON.stringify(index));
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
 const original=await page.evaluate(()=>localStorage.getItem('projectatlas.save.synthetic.occupied'));
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· ceded'}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'artifacts/load-game/ceded-1920x1080.png'});
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· opposition'}).click();await expect(page.locator('.lg-campaign-panel')).toContainText('Aucun rapport militaire accessible');
 await page.screenshot({path:'artifacts/load-game/opposition-1920x1080.png'});
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('projectatlas.save.synthetic.occupied'))).toBe(original);
 await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();await expect(page.locator('.clock strong')).toContainText('2031');
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Load Game',exact:true}).click();
 await page.locator('.lg-save-name').filter({hasText:'· ceded'}).click();await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.getByRole('button',{name:'Retour au menu',exact:false}).click();await expect(page.locator('.clock strong')).toContainText('2031');
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
