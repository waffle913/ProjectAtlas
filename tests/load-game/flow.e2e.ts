import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
import {storage} from '../helpers/nativeFixtures';
async function captureNews(page:import('@playwright/test').Page,prefix:string){
 for(const [name,title] of [['national','Actualités nationales'],['international','Actualités internationales']]){
  const section=page.locator('.lg-panel-scroll > section').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await section.evaluate(el=>{const panel=el.parentElement!;panel.scrollTop+=el.getBoundingClientRect().top-panel.getBoundingClientRect().top;});
  await expect(section.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect(section.locator('li').first()).toBeVisible();
  await page.screenshot({path:'artifacts/load-game/'+prefix+'-'+name+'.png',fullPage:true});
 }
 await page.locator('.lg-panel-scroll').evaluate(el=>{el.scrollTop=0;});
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
 await expect(page.locator('.lg-campaign-panel')).toContainText('Déclaration de guerre');
 await expect(page.locator('.lg-campaign-panel')).toContainText('occupe');
 await expect(page.locator('.lg-panel-scroll > section').filter({has:page.getByRole('heading',{name:'Actualités internationales',exact:true})})).toContainText('Déclaration de guerre');
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/occupied-${viewport.width}x${viewport.height}.png`});
  await captureNews(page,`occupied-news-${viewport.width}x${viewport.height}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('.lg-panel-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.screenshot({path:'artifacts/load-game/campaign-context-1920x1080.png'});
 await expect(page.getByRole('heading',{name:'Actualités internationales',exact:true})).toBeVisible();
 await page.locator('.lg-panel-scroll').evaluate(el=>{el.scrollTop=0;});
 const original=await page.evaluate(()=>(window as unknown as {__syntheticWrites:number}).__syntheticWrites);
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· ceded'}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'artifacts/load-game/ceded-1920x1080.png'});await expect(page.locator('.lg-campaign-panel')).toContainText('guerre terminée, évaluation archivée');
 await expect(page.locator('.lg-campaign-panel')).toContainText('Fin de la guerre');
 await expect(page.locator('.lg-campaign-panel')).toContainText('aucun traité distinct');
 await captureNews(page,'ceded-news-1920x1080');
 await page.getByRole('button',{name:'Retour à la liste',exact:false}).click();
 await page.locator('.lg-save-name').filter({hasText:'· opposition'}).click();await expect(page.locator('.lg-campaign-panel')).toContainText('Aucun rapport militaire détaillé accessible');
 await expect(page.locator('.lg-campaign-panel')).toContainText('Déclaration de guerre');
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
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/load-game/occupied-ui150-${viewport.width}x${viewport.height}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);const notice=await page.locator('.lg-map-notice').boundingBox(),help=await page.locator('.ng-globe-help').boundingBox();expect(notice!.y+notice!.height).toBeLessThanOrEqual(help!.y);await captureNews(page,`occupied-news-ui150-${viewport.width}x${viewport.height}`);}
 expect(errors).toEqual([]);
});
test('real preview without WebGL remains loadable; deletion needs confirmation',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await storage(page);
 await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return Reflect.apply(old,this,[type,...args]);} as typeof old;});
 await page.goto('/');await page.getByRole('button',{name:'Charger une partie',exact:true}).click();await page.locator('.lg-save-name').filter({hasText:'· occupied'}).click();
 await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/load-game/no-webgl-1366x768.png'});await captureNews(page,'no-webgl-news-1366x768');
 await page.getByRole('button',{name:'Supprimer',exact:false}).click();await page.getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.locator('.lg-campaign-panel')).toBeVisible();
 await page.getByRole('button',{name:'Supprimer',exact:false}).click();await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
 await expect(page.locator('.lg-list-panel')).toBeVisible();await expect(page.locator('.lg-save-name').filter({hasText:'· occupied'})).toHaveCount(0);
 await context.close();
});
