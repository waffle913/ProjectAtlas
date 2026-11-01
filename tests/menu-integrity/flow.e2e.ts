import {test,expect,type Page} from '@playwright/test';
import {storage} from '../helpers/nativeFixtures';
import fs from 'node:fs/promises';
const back=(p:Page)=>p.getByRole('button',{name:/Back/}).click();
const guard=(p:Page)=>p.getByRole('dialog',{name:'Confirmer l’abandon de progression'});
async function setup(p:Page){await storage(p);await p.goto('/');await expect(p.getByRole('button',{name:'Nouvelle partie',exact:true})).toBeEnabled();}
async function selectSave(p:Page,name='occupied'){await p.getByRole('button',{name:'Charger une partie',exact:true}).click();await p.locator('.lg-save-name').filter({hasText:'· '+name}).click();await expect(p.locator('.lg-campaign-panel')).toBeVisible();}
async function choose(p:Page,name:string){await p.getByLabel('Rechercher un pays',{exact:true}).fill(name);await p.locator('.ng-search-results button').filter({hasText:name}).first().click();}
async function shot(p:Page,name:string){await fs.mkdir('artifacts/menu-integrity',{recursive:true});await p.screenshot({path:`artifacts/menu-integrity/${name}.png`,fullPage:true});expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}

test('active session continuation, replacement guards, explicit exit and native close',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
 await expect(page.getByRole('button',{name:'Continuer',exact:false}).first()).toBeDisabled();
 await selectSave(page);await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();
 await expect(page.locator('.clock strong')).toContainText('2031');await page.getByRole('button',{name:'×2',exact:true}).click();
 const date=await page.locator('.clock strong').textContent();
 await page.getByRole('button',{name:'Menu',exact:true}).click();await shot(page,'pause-1920x1080');await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();
 await expect(page.locator('.atlas-continue')).toContainText('non sauvegardée');
 const counts=await page.evaluate(()=>({writes:(window as any).__syntheticWrites,reads:(window as any).__syntheticReads}));
 await page.getByRole('button',{name:'Continuer',exact:false}).first().click();await expect(page.locator('.clock strong')).toHaveText(date!);await expect(page.getByRole('button',{name:'×2',exact:true})).toHaveClass('active');
 expect(await page.evaluate(()=>({writes:(window as any).__syntheticWrites,reads:(window as any).__syntheticReads}))).toEqual(counts);
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();
 await selectSave(page,'ceded');await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();await expect(guard(page)).toBeVisible();await shot(page,'discard-guard-1920x1080');
 await guard(page).getByRole('button',{name:'Annuler et conserver la session'}).click();await expect(page.locator('.lg-campaign-panel')).toContainText('ceded');
 await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();await guard(page).getByRole('button',{name:'Abandonner la progression et continuer'}).click();await expect(guard(page)).toHaveCount(0);await expect(page.locator('.clock strong')).toBeVisible();
 // Save the actual installed B through the production adapter, proving identity/history and no A retention.
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Save As',exact:true}).click();await page.getByPlaceholder('Save name').fill('TEST SYNTHÉTIQUE — B active');await page.getByRole('dialog',{name:'Save game',exact:true}).getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog',{name:'Save game',exact:true})).toHaveCount(0);
 const expected=JSON.parse(await fs.readFile('artifacts/load-game/storage/synthetic.ceded.json','utf8'));
 const actual=await page.evaluate(()=>{const s=JSON.parse((window as any).__syntheticLastSave);return {date:s.date,tick:s.engine.tick,person:s.governance.player.controlledPersonId,ownership:s.regionOwnership,wars:s.wars};});
 expect(actual).toEqual({date:expected.date,tick:expected.engine.tick,person:expected.governance.player.controlledPersonId,ownership:expected.regionOwnership,wars:expected.wars});
 await page.getByRole('button',{name:'×5',exact:true}).click();await page.evaluate(async()=>{await (window as any).__syntheticClose();});await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:'Annuler et conserver la session'}).click();expect(await page.evaluate(()=>(window as any).__syntheticExit)).toBe(0);
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Exit Game',exact:true}).click();await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:'Abandonner la progression et continuer'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__syntheticExit)).toBe(1);expect(errors).toEqual([]);
});

test('all menu viewports/scales, read-only preview continuity and honest unavailable settings',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
 const writes=await page.evaluate(()=>(window as any).__syntheticWrites);
 for(const scale of ['1','1.5']){
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.locator('.settings-pane label').filter({hasText:'UI scale'}).locator('select').selectOption(scale);await back(page);
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
   await page.setViewportSize(viewport);const suffix=`${viewport.width}x${viewport.height}-ui${Number(scale)*100}`;
   await shot(page,'home-'+suffix);await page.getByRole('button',{name:'Paramètres',exact:true}).click();await shot(page,'settings-'+suffix);
   for(const category of ['Audio','Interface','Gameplay','Accessibility']){await page.getByRole('button',{name:category,exact:true}).click();await shot(page,category.toLowerCase()+'-'+suffix);}
   await page.getByRole('button',{name:'Audio',exact:true}).click();await expect(page.locator('.settings-pane fieldset')).toBeDisabled();
   await page.getByRole('button',{name:'Interface',exact:true}).click();await expect(page.getByLabel('Confirm high-impact actions')).toBeDisabled();await expect(page.getByLabel('Map label density')).toBeDisabled();await back(page);
   await page.getByRole('button',{name:'Crédits',exact:true}).click();await shot(page,'credits-'+suffix);await back(page);
   await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');await shot(page,'new-'+suffix);
   await choose(page,'Canada');await page.getByRole('button',{name:'Paramètres',exact:true}).click();await back(page);await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');await page.getByRole('button',{name:'Retour au menu',exact:false}).click();
   await selectSave(page);await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');await shot(page,'load-'+suffix);
   const reads=await page.evaluate(()=>(window as any).__syntheticReads);
   for(const target of ['Paramètres','Crédits']){await page.getByRole('button',{name:target,exact:true}).click();await back(page);await expect(page.locator('.lg-campaign-panel')).toContainText('occupied');}
   expect(await page.evaluate(()=>(window as any).__syntheticReads)).toBe(reads);await page.getByRole('button',{name:'Retour au menu',exact:false}).click();
  }
 }
 expect(await page.evaluate(()=>(window as any).__syntheticWrites)).toBe(writes);
});

test('free idle, manual interruption, cancellable country focus and reduced motion',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();
 const canvas=page.locator('.ng-globe canvas');await expect(canvas).toHaveAttribute('data-motion','animated');await expect(canvas).toHaveAttribute('data-camera-mode','free');await expect(page.locator('.ng-country-title h1')).toHaveText('France');
 const lon=await canvas.getAttribute('data-camera-longitude');await expect.poll(()=>canvas.getAttribute('data-camera-longitude')).not.toBe(lon);
 const b=(await canvas.boundingBox())!;const x=b.x+b.width*.5,y=b.y+b.height*.5;await page.mouse.move(x,y);await page.mouse.down();const downLon=Number(await canvas.getAttribute('data-camera-longitude'));await page.waitForTimeout(350);expect(Number(await canvas.getAttribute('data-camera-longitude'))).toBeCloseTo(downLon,2);await page.mouse.move(x+100,y+30,{steps:12});await page.mouse.up();await expect(canvas).toHaveAttribute('data-camera-mode','free');
 await choose(page,'Canada');await expect(canvas).toHaveAttribute('data-camera-mode','transition');await choose(page,'France');await expect(canvas).toHaveAttribute('data-camera-mode','focused');await expect(page.locator('.ng-country-title h1')).toHaveText('France');
 const centered=async()=>{const c=(await canvas.boundingBox())!;const point=(await page.locator('.ng-hover').getAttribute('data-point'))!.split(',').map(Number);expect(Math.abs(point[0]-(c.x+c.width/2))).toBeLessThan(3);expect(Math.abs(point[1]-(c.y+c.height/2))).toBeLessThan(3);};await centered();
 await page.getByRole('button',{name:'Zoom avant',exact:true}).click();await centered();const hold=await canvas.getAttribute('data-camera-longitude');await page.waitForTimeout(900);expect(await canvas.getAttribute('data-camera-longitude')).toBe(hold);await shot(page,'focused-france-1920x1080');
 await page.getByRole('button',{name:'Retour à la vue libre'}).click();await expect(canvas).toHaveAttribute('data-camera-mode','free');const free=await canvas.getAttribute('data-camera-longitude');await expect.poll(()=>canvas.getAttribute('data-camera-longitude')).not.toBe(free);
 await choose(page,'Canada');await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('Reduced motion',{exact:true}).check();await back(page);await expect(canvas).toHaveAttribute('data-motion','reduced');await expect(canvas).toHaveAttribute('data-camera-mode','focused');
 await page.getByRole('button',{name:'Retour à la vue libre'}).click();const still=await canvas.getAttribute('data-camera-longitude');await page.waitForTimeout(900);expect(await canvas.getAttribute('data-camera-longitude')).toBe(still);
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('Reduced motion',{exact:true}).uncheck();await page.emulateMedia({reducedMotion:'reduce'});await back(page);await expect(canvas).toHaveAttribute('data-motion','reduced');await expect(page.locator('html')).toHaveClass(/reduced-motion/);expect(errors).toEqual([]);
});

test('settings persist through restart, display failure is visible and retryable',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.evaluate(()=>{(window as any).__syntheticFailDisplay=true;});await page.getByLabel('Display mode',{exact:true}).selectOption('fullscreen');await expect(page.getByRole('alert')).toContainText('Mode d’affichage non appliqué');await page.evaluate(()=>{(window as any).__syntheticFailDisplay=false;});await page.getByRole('button',{name:'Réessayer le mode d’affichage'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByLabel('UI scale',{exact:true}).selectOption('1.5');await page.getByRole('button',{name:'Gameplay',exact:true}).click();await page.getByLabel('Default simulation speed').selectOption('5');await page.getByLabel('Autosave',{exact:true}).uncheck();await page.getByLabel('Pause on urgent events').uncheck();await page.getByLabel('Autosave interval',{exact:true}).selectOption('30');await page.getByRole('button',{name:'Interface',exact:true}).click();await page.getByLabel('Show provenance details').check();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('High contrast').check();await page.getByLabel('Reduced motion',{exact:true}).check();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('synthetic-native-settings')??'{}')['projectatlas.settings.v1'])).toContain('"reducedMotion":true');
 await page.reload();await expect(page.locator('html')).toHaveClass(/high-contrast/);await expect(page.locator('html')).toHaveClass(/reduced-motion/);await page.getByRole('button',{name:'Paramètres',exact:true}).click();await expect(page.getByLabel('UI scale',{exact:true})).toHaveValue('1.5');await expect(page.getByLabel('Display mode',{exact:true})).toHaveValue('fullscreen');await page.getByRole('button',{name:'Gameplay',exact:true}).click();await expect(page.getByLabel('Default simulation speed')).toHaveValue('5');await expect(page.getByLabel('Autosave',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Pause on urgent events')).not.toBeChecked();await expect(page.getByLabel('Autosave interval',{exact:true})).toHaveValue('30');await page.getByRole('button',{name:'Interface',exact:true}).click();await expect(page.getByLabel('Show provenance details')).toBeChecked();await back(page);
 await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.locator('.ng-paths button:not([disabled])').first().click();await page.locator('.ng-person').first().click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.getByRole('button',{name:'Lancer la campagne',exact:false}).click();await expect(page.getByRole('button',{name:'×5',exact:true})).toHaveClass('active');
 // Preparing another campaign is reversible; installation is the destructive boundary.
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.locator('.ng-paths button:not([disabled])').first().click();await page.locator('.ng-person').first().click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.getByRole('button',{name:'Lancer la campagne',exact:false}).click();await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:'Annuler et conserver la session'}).click();await expect(page.locator('.ng-recap')).toBeVisible();
});

test('no WebGL keeps navigation and saved preview available at both sizes and scales',async({page})=>{
 await storage(page);await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return Reflect.apply(old,this,[type,...args]);} as typeof old;});await page.goto('/');
 for(const scale of ['1','1.5']){await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByLabel('UI scale',{exact:true}).selectOption(scale);await back(page);for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){await page.setViewportSize(viewport);await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await shot(page,`no-webgl-new-${viewport.width}-ui${scale}`);await page.getByRole('button',{name:'Retour au menu',exact:false}).click();await selectSave(page);await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await shot(page,`no-webgl-load-${viewport.width}-ui${scale}`);await expect(page.getByRole('button',{name:'Charger la campagne',exact:false})).toBeEnabled();await page.getByRole('button',{name:'Retour au menu',exact:false}).click();}}
});
