import {test,expect,type Page,type Request,type Response,type ConsoleMessage} from '@playwright/test';
import {storage} from '../helpers/nativeFixtures';
import fs from 'node:fs/promises';
const back=(p:Page)=>p.getByRole('button',{name:/Back/}).click();
const guard=(p:Page)=>p.getByRole('dialog',{name:'Confirmer l’abandon de progression'});
// A separate, finite startup budget; ordinary assertions and the 240 s scenario budget stay unchanged.
const INITIALIZATION_TIMEOUT_MS=60_000;
async function setup(p:Page){
 const started=performance.now();
 const requests=new Map<Request,{url:string;startedMs:number;status?:number;finishedMs?:number;failure?:string}>();
 const consoleErrors:string[]=[],pageErrors:string[]=[];
 const onRequest=(r:Request)=>requests.set(r,{url:r.url(),startedMs:performance.now()-started});
 const onResponse=(r:Response)=>{const entry=requests.get(r.request());if(entry)entry.status=r.status();};
 const onFinished=(r:Request)=>{const entry=requests.get(r);if(entry)entry.finishedMs=performance.now()-started;};
 const onFailed=(r:Request)=>{const entry=requests.get(r);if(entry){entry.finishedMs=performance.now()-started;entry.failure=r.failure()?.errorText??'requestfailed';}};
 const onConsole=(m:ConsoleMessage)=>{if(m.type()==='error')consoleErrors.push(m.text());};
 const onError=(e:Error)=>pageErrors.push(e.message);
 p.on('request',onRequest);p.on('response',onResponse);p.on('requestfinished',onFinished);p.on('requestfailed',onFailed);p.on('console',onConsole);p.on('pageerror',onError);
 let ready=false,failure:unknown;
 try{
  await storage(p);
  const remaining=()=>Math.max(1,INITIALIZATION_TIMEOUT_MS-(performance.now()-started));
  await p.goto('/',{timeout:remaining()});
  // This real control is gated by dataReady && storageReady in production.
  await expect(p.getByRole('button',{name:'Nouvelle partie',exact:true})).toBeEnabled({timeout:remaining()});
  ready=true;
 }catch(error){failure=error;}
 const elapsedMs=Math.round(performance.now()-started);
 try{
  const network=[...requests.values()].map(r=>({...r,durationMs:r.finishedMs===undefined?null:Math.round(r.finishedMs-r.startedMs)}));
  // Reading the DOM is diagnostic only; no state is forced or reconstructed.
  // Bound diagnostics as well if the renderer has stopped responding.
  let diagnosticTimer:ReturnType<typeof setTimeout>|undefined;
  let observed:unknown;
  try{observed=await Promise.race([
   p.evaluate(()=>({
    title:document.title,
    newGame:[...document.querySelectorAll('button')].filter(b=>b.textContent?.trim()==='Nouvelle partie').map(b=>({disabled:b.disabled,title:b.title})),
    alerts:[...document.querySelectorAll('[role="alert"]')].map(n=>n.textContent),
    statuses:[...document.querySelectorAll('[role="status"],.load-state,.atlas-empty,.atlas-menu-error')].map(n=>n.textContent),
    visibleText:document.body.innerText,
    storage:{notice:document.querySelector('.atlas-empty')?.textContent??null,
     syntheticReads:(window as any).__syntheticReads??null,syntheticWrites:(window as any).__syntheticWrites??null,
     persistedSettingsPresent:localStorage.getItem('synthetic-native-settings')!==null},
   })).catch(error=>({diagnosticError:String(error)})),
   new Promise(resolve=>{diagnosticTimer=setTimeout(()=>resolve({diagnosticError:'DOM non accessible sous 3 s ; consulter trace/capture et requêtes ci-dessous.'}),3000);}),
  ]);}finally{if(diagnosticTimer)clearTimeout(diagnosticTimer);}
  const pending=network.filter(r=>r.finishedMs===undefined);
  const report={ready,elapsedMs,budgetMs:INITIALIZATION_TIMEOUT_MS,observed,
   loadingStage:ready?'dataReady && storageReady confirmés par le bouton activé':pending.length?{pendingResources:pending.map(r=>r.url)}:'Aucune requête en cours : traitement des données ou stockage non prêt ; étape interne non exposée par le menu.',
   network,failedRequests:network.filter(r=>r.failure || (r.status??0)>=400),consoleErrors,pageErrors,
   failure:failure instanceof Error?failure.message:failure===undefined?null:String(failure)};
  const path=test.info().outputPath('initialization.json');await fs.writeFile(path,JSON.stringify(report,null,2));await test.info().attach('initialization',{path,contentType:'application/json'});
  console.log(`[initialization] ready=${ready} elapsed=${elapsedMs}ms budget=${INITIALIZATION_TIMEOUT_MS}ms failedRequests=${report.failedRequests.length} pageErrors=${pageErrors.length}`);
  if(!ready)console.error('[initialization failure]',JSON.stringify(report));
 }finally{
  p.off('request',onRequest);p.off('response',onResponse);p.off('requestfinished',onFinished);p.off('requestfailed',onFailed);p.off('console',onConsole);p.off('pageerror',onError);
 }
 if(!ready)throw new Error(`Initialisation non terminée après ${elapsedMs} ms (borne ${INITIALIZATION_TIMEOUT_MS} ms). Voir initialization.json : étape observable, stockage, erreurs et requêtes.`,{cause:failure});
}
async function selectSave(p:Page,name='occupied'){await p.getByRole('button',{name:'Charger une partie',exact:true}).click();await p.locator('.lg-save-name').filter({hasText:'· '+name}).click();await expect(p.locator('.lg-campaign-panel')).toBeVisible();}
async function choose(p:Page,name:string){await p.getByLabel('Rechercher un pays',{exact:true}).fill(name);await p.locator('.ng-search-results button').filter({hasText:name}).first().click();}
async function fitted(p:Page){const canvas=p.locator('.ng-globe canvas');await expect(canvas).toHaveAttribute('data-camera-mode','focused');await expect.poll(async()=>{const b=JSON.parse((await canvas.getAttribute('data-focus-bounds'))??'{}');return Math.max(Math.abs(b.minX),Math.abs(b.maxX),Math.abs(b.minY),Math.abs(b.maxY));}).toBeLessThan(.95);}
async function observeCamera(canvas:import('@playwright/test').Locator,durationMs:number){
 return canvas.evaluate((node,duration)=>new Promise<{initial:number;min:number;max:number;rendered:number;allInteracting:boolean;lateMin:number;lateMax:number}>(resolve=>{
  const initial=Number(node.getAttribute('data-camera-longitude')),frames=Number(node.getAttribute('data-rendered-frames')),start=performance.now();let min=initial,max=initial,allInteracting=true,lateMin=Infinity,lateMax=-Infinity;
  const sample=()=>{const lon=Number(node.getAttribute('data-camera-longitude'));min=Math.min(min,lon);max=Math.max(max,lon);allInteracting=allInteracting&&node.getAttribute('data-interacting')==='true';if(performance.now()-start>=duration*.8){lateMin=Math.min(lateMin,lon);lateMax=Math.max(lateMax,lon);}
   if(performance.now()-start>=duration)resolve({initial,min,max,rendered:Number(node.getAttribute('data-rendered-frames'))-frames,allInteracting,lateMin,lateMax});else requestAnimationFrame(sample);};requestAnimationFrame(sample);
 }),durationMs);
}
async function prepareCampaign(p:Page){
 await p.getByRole('button',{name:'Nouvelle partie',exact:true}).click();
 // The informational France preselection does not guarantee an eligible starting person.
 // Use the catalogue's actual eligibility; never grant an unavailable office to make a test pass.
 await p.locator('.ng-catalog summary').click();const catalog=p.getByRole('combobox',{name:'Catalogue complet des pays',exact:true});
 const eligible=await catalog.locator('option').evaluateAll(nodes=>(nodes as HTMLOptionElement[]).find(o=>!o.text.includes('démarrage indisponible'))?.value);expect(eligible).toBeTruthy();await catalog.selectOption(eligible!);
 await p.getByRole('button',{name:'Continuer',exact:false}).click();await p.locator('.ng-paths button:not([disabled])').first().click();await p.locator('.ng-person').first().click();await p.getByRole('button',{name:'Continuer',exact:false}).click();await p.getByRole('button',{name:'Continuer',exact:false}).click();await p.getByRole('button',{name:'Lancer la campagne',exact:false}).click();
}
async function restoredSettings(p:Page){
 await p.getByRole('button',{name:'Paramètres',exact:true}).click();
 // Native startup reads the save cache before releasing settings. Wait for that
 // real acknowledgement, without changing a preference or extending assertion timeouts.
 await p.getByRole('combobox',{name:'UI scale',exact:true}).and(p.locator(':enabled')).waitFor({state:'visible'});
 await expect(p.locator('html')).toHaveClass(/high-contrast/);await expect(p.locator('html')).toHaveClass(/reduced-motion/);
await expect(p.getByRole('combobox',{name:'UI scale',exact:true})).toHaveValue('1.5');await expect(p.getByRole('combobox',{name:'Display mode',exact:true})).toHaveValue('fullscreen');
 await expect.poll(()=>p.evaluate(()=>(window as any).__syntheticDisplayMode)).toBe('fullscreen');
 await p.getByRole('button',{name:'Gameplay',exact:true}).click();await expect(p.getByRole('combobox',{name:'Default simulation speed',exact:true})).toHaveValue('5');await expect(p.getByRole('checkbox',{name:'Autosave',exact:true})).not.toBeChecked();await expect(p.getByRole('checkbox',{name:'Pause on urgent events',exact:true})).not.toBeChecked();await expect(p.getByRole('combobox',{name:'Autosave interval',exact:true})).toHaveValue('30');
 await p.getByRole('button',{name:'Interface',exact:true}).click();await expect(p.getByRole('checkbox',{name:'Show provenance details',exact:true})).toBeChecked();
 await p.getByRole('button',{name:'Accessibility',exact:true}).click();await expect(p.getByRole('combobox',{name:'UI scale',exact:true})).toHaveValue('1.5');await expect(p.getByRole('checkbox',{name:'High contrast',exact:true})).toBeChecked();await expect(p.getByRole('checkbox',{name:'Reduced motion',exact:true})).toBeChecked();await back(p);
}
async function shot(p:Page,name:string){await fs.mkdir('artifacts/menu-integrity',{recursive:true});await p.screenshot({path:`artifacts/menu-integrity/${name}.png`,fullPage:true});expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}

test('explicit volatile cursor diagnostics export without campaign or preference writes',async({page})=>{
 await setup(page);
 await expect(page.getByRole('complementary',{name:'Diagnostic du curseur'})).toHaveCount(0);
 const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();
 await page.getByRole('button',{name:'Activer le diagnostic du curseur (5 min)',exact:true}).click();
 await back(page);
 await expect(page.locator('.atlas-menu')).toBeVisible();
 await page.mouse.move(350,250);await page.mouse.click(350,250,{button:'right'});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Marquer le symptôme',exact:true}).click();
 // A known synthetic JS stall verifies instrumentation, not the Windows symptom.
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const supported=typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask');
  let observer:PerformanceObserver|undefined;
  const timeout=setTimeout(()=>{observer?.disconnect();reject(new Error('Synthetic browser task not observed within 3 seconds'));},3000);
  if(supported){
   observer=new PerformanceObserver(list=>{if(list.getEntries().some(e=>e.duration>=80)){observer?.disconnect();clearTimeout(timeout);resolve();}});
   observer.observe({type:'longtask'});
  }
  // DevTools evaluation is not necessarily a PerformanceLongTaskTiming task.
  // Schedule a real browser timer task and wait for observable API delivery.
  setTimeout(()=>{const start=performance.now();while(performance.now()-start<90){/* test only */}
   if(!supported){clearTimeout(timeout);resolve();}
  },0);
 }));
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(true))))).toBe(true);
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Arrêter et exporter le diagnostic',exact:true}).click();
 const download=await downloadPromise;const path=test.info().outputPath('ui-diagnostic.json');await download.saveAs(path);
 const report=JSON.parse(await fs.readFile(path,'utf8'));
 await test.info().attach('ui-diagnostic',{path,contentType:'application/json'});
 expect(report.stopped).toBe(true);expect(report.rows.length).toBeLessThanOrEqual(2400);
 expect(report.rows.some((r:any)=>r.type==='screen'&&r.screen==='menu')).toBe(true);
 expect(report.rows.some((r:any)=>r.type==='contextmenu'&&r.x===350&&r.y===250)).toBe(true);
 expect(report.rows.some((r:any)=>r.type==='user-marker')).toBe(true);
 expect(report.rows.some((r:any)=>r.type==='frames'&&r.maxMs>=50)).toBe(true);
 if(report.environment.longTasks)expect(report.rows.some((r:any)=>r.type==='longtask'&&r.durationMs>=50)).toBe(true);
 expect(JSON.stringify(report)).not.toMatch(/controlledPerson|simulationState|synthetic-native-settings|synthetic-native-saves/);
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).toBe(before);
 await page.getByRole('button',{name:'Effacer et fermer le diagnostic',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Diagnostic du curseur'})).toHaveCount(0);
});

test('keyboard-only symptom boundaries preserve context and stop intercepting after export',async({page})=>{
 await setup(page);
 const unintercepted=()=>page.evaluate(()=>['F9','F10'].every(key=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))));
 expect(await unintercepted()).toBe(true);
 const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));
 const enter=async(button:import('@playwright/test').Locator)=>{await button.focus();await page.keyboard.press('Enter');};
 await enter(page.getByRole('button',{name:'Paramètres',exact:true}));
 await enter(page.getByRole('button',{name:'Activer le diagnostic du curseur (5 min)',exact:true}));
 await expect(page.getByRole('complementary',{name:'Diagnostic du curseur'})).toContainText('F9');
 await enter(page.getByRole('button',{name:/Back/}));
 await page.keyboard.press('F9'); await page.keyboard.press('F10');
 const downloadPromise=page.waitForEvent('download');
 await enter(page.getByRole('button',{name:'Arrêter et exporter le diagnostic',exact:true}));
 const path=test.info().outputPath('keyboard-diagnostic.json');await (await downloadPromise).saveAs(path);
 const report=JSON.parse(await fs.readFile(path,'utf8'));
 await test.info().attach('keyboard-diagnostic',{path,contentType:'application/json'});
 const markers=report.rows.filter((r:any)=>r.type==='symptom-start'||r.type==='symptom-end');
 expect(markers.map((r:any)=>r.type)).toEqual(['symptom-start','symptom-end']);
 expect(markers[1].receivedMs).toBeGreaterThanOrEqual(markers[0].receivedMs);
 expect(markers.every((r:any)=>r.ms===r.receivedMs)).toBe(true);
 expect(report.rows.map((r:any)=>r.ms)).toEqual(report.rows.map((r:any)=>r.ms).sort((a:number,b:number)=>a-b));
 expect(report.markerContexts[0].rows.some((r:any)=>r.type==='screen'&&r.screen==='menu')).toBe(true);
 expect(report.markerContexts[0].coverage.entries).toBeGreaterThan(1);
 expect(report.counts.pointerdown??0).toBe(0);expect(report.counts.mousedown??0).toBe(0);
 expect(await unintercepted()).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).toBe(stored);
});

test('active session continuation, replacement guards, explicit exit and native close',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
 await expect(page.getByRole('button',{name:'Continuer',exact:false}).first()).toBeDisabled();
 await selectSave(page);await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();
 await expect(page.locator('.clock strong')).toContainText('2031');await expect(page.locator('.leaflet-control-attribution')).not.toContainText('Leaflet');
 const openingDate=await page.locator('.clock strong').textContent();await page.locator('.clock').getByRole('button',{name:'▶ Resume',exact:true}).click();await expect.poll(()=>page.locator('.clock strong').textContent()).not.toBe(openingDate);
 await page.getByRole('button',{name:'Menu',exact:true}).click();const suspendedDate=await page.locator('.clock strong').textContent();await page.waitForTimeout(800);await expect(page.locator('.clock strong')).toHaveText(suspendedDate!);await page.getByRole('dialog',{name:'Pause menu',exact:true}).getByRole('button',{name:'Resume',exact:true}).click();await expect.poll(()=>page.locator('.clock strong').textContent()).not.toBe(suspendedDate);
 await page.locator('.clock').getByRole('button',{name:'Ⅱ Pause',exact:true}).click();await page.getByRole('button',{name:'×2',exact:true}).click();
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
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('combobox',{name:'UI scale',exact:true}).selectOption(scale);await expect(page.getByRole('combobox',{name:'UI scale',exact:true})).toHaveValue(scale);await back(page);
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
   await page.setViewportSize(viewport);const suffix=`${viewport.width}x${viewport.height}-ui${Number(scale)*100}`;
   await shot(page,'home-'+suffix);await page.getByRole('button',{name:'Paramètres',exact:true}).click();await shot(page,'settings-'+suffix);
   for(const category of ['Audio','Interface','Gameplay','Accessibility']){await page.getByRole('button',{name:category,exact:true}).click();await shot(page,category.toLowerCase()+'-'+suffix);}
   await page.getByRole('button',{name:'Audio',exact:true}).click();const audio=page.getByRole('slider');await expect(audio).toHaveCount(4);await fs.writeFile(`artifacts/menu-integrity/audio-accessibility-${suffix}.txt`,await page.locator('.settings-pane').ariaSnapshot());
   const values=await audio.evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value));
   for(const name of ['Master volume','Music volume','Interface volume','Notification volume']){
    const control=page.getByRole('slider',{name,exact:true});await expect(control).toBeDisabled();
    const rect=(await control.boundingBox())!;await page.mouse.click(rect.x+rect.width*.8,rect.y+rect.height/2);await control.evaluate(n=>(n as HTMLElement).focus());await page.keyboard.press('ArrowRight');
   }
   const mute=page.getByRole('checkbox',{name:'Mute when unfocused'});await expect(mute).toBeDisabled();const checked=await mute.isChecked();const muteRect=(await mute.boundingBox())!;await page.mouse.click(muteRect.x+muteRect.width/2,muteRect.y+muteRect.height/2);await mute.evaluate(n=>(n as HTMLElement).focus());await page.keyboard.press('Space');expect(await mute.isChecked()).toBe(checked);
   expect(await audio.evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(values);
   await page.getByRole('button',{name:'Interface',exact:true}).click();await expect(page.getByLabel('Confirm high-impact actions')).toBeDisabled();await expect(page.getByLabel('Map label density')).toBeDisabled();await back(page);
   await page.getByRole('button',{name:'Crédits',exact:true}).click();await expect(page.getByRole('heading',{name:'Crédits et sources'})).toBeVisible();await expect(page.locator('.credits-screen')).toContainText('NASA Earth Observatory');await expect(page.locator('.credits-screen')).toContainText('Natural Earth');await page.getByRole('button',{name:'Notice Leaflet embarquée'}).click();await expect(page.locator('.credits-notice pre')).toContainText('BSD 2-Clause License');await expect(page.locator('.credits-notice pre')).toContainText('Redistributions in binary form');await page.getByRole('button',{name:'Fermer la notice',exact:true}).click();await shot(page,'credits-'+suffix);await back(page);
   await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');await expect(page.locator('.ng-attribution')).not.toContainText(/NASA|Natural Earth/);await expect(page.locator('.ng-country-banner')).not.toContainText('Natural Earth');await shot(page,'new-'+suffix);
   for(const country of ['France','Canada','Luxembourg']){await choose(page,country);await fitted(page);await shot(page,'framing-'+country.toLowerCase()+'-'+suffix);}
   await choose(page,'Canada');await page.getByRole('button',{name:'Paramètres',exact:true}).click();await back(page);await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');await page.getByRole('button',{name:'Retour au menu',exact:false}).click();
   await selectSave(page);await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');await expect(page.locator('.lg-attribution')).not.toContainText(/NASA|Natural Earth/);await shot(page,'load-'+suffix);
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
 const b=(await canvas.boundingBox())!;const x=b.x+b.width*.5,y=b.y+b.height*.5;
 await page.mouse.move(x,y);await page.mouse.down();await expect(canvas).toHaveAttribute('data-interacting','true');
 // Observe an entire hold after the interaction acknowledgement, not a throttled pre-down sample.
 const held=await observeCamera(canvas,1100);expect(held.allInteracting).toBe(true);expect(held.rendered).toBeGreaterThan(3);expect(held.max).toBeCloseTo(held.initial,2);expect(held.min).toBeCloseTo(held.initial,2);
 await page.mouse.move(x+100,y+30,{steps:12});await page.mouse.up();await expect(canvas).toHaveAttribute('data-interacting','false');await expect(canvas).toHaveAttribute('data-camera-mode','free');
 // The last fifth of this observation is after the existing 1200 + 600 ms resume gate.
 const resumed=await observeCamera(canvas,2300);expect(resumed.lateMax-resumed.lateMin).toBeGreaterThan(.005);
 await choose(page,'Canada');
 // Read both states in one browser task: a slow driver cannot miss a 650 ms transition.
 expect(await canvas.evaluate(node=>{node.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));const during=node.getAttribute('data-camera-mode');node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return [during,node.getAttribute('data-camera-mode')];})).toEqual(['transition','free']);
 await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');await page.getByRole('button',{name:'Retour à la vue libre'}).click();await expect(canvas).toHaveAttribute('data-camera-mode','free');await choose(page,'France');await expect(canvas).toHaveAttribute('data-camera-mode','focused');await expect(page.locator('.ng-country-title h1')).toHaveText('France');
 const centered=async()=>{const c=(await canvas.boundingBox())!;const point=(await page.locator('.ng-hover').getAttribute('data-point'))!.split(',').map(Number);expect(Math.abs(point[0]-(c.x+c.width/2))).toBeLessThan(3);expect(Math.abs(point[1]-(c.y+c.height/2))).toBeLessThan(3);};await centered();
 for(const country of ['France','Canada','Luxembourg']){await choose(page,country);await fitted(page);
  await shot(page,'framing-'+country.toLowerCase()+'-1920x1080');
 }
 await choose(page,'France');await expect(canvas).toHaveAttribute('data-camera-mode','focused');
 await page.getByRole('button',{name:'Zoom avant',exact:true}).click();await centered();const hold=await canvas.getAttribute('data-camera-longitude');await page.waitForTimeout(900);expect(await canvas.getAttribute('data-camera-longitude')).toBe(hold);await shot(page,'focused-france-1920x1080');
 await page.getByRole('button',{name:'Retour à la vue libre'}).click();await expect(canvas).toHaveAttribute('data-camera-mode','free');const free=await canvas.getAttribute('data-camera-longitude');await expect.poll(()=>canvas.getAttribute('data-camera-longitude')).not.toBe(free);
 await choose(page,'Canada');await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('Reduced motion',{exact:true}).check();await back(page);await expect(canvas).toHaveAttribute('data-motion','reduced');await expect(canvas).toHaveAttribute('data-camera-mode','focused');
 await page.getByRole('button',{name:'Retour à la vue libre'}).click();const quiet=await observeCamera(canvas,1100);expect(quiet.max).toBeCloseTo(quiet.initial,2);expect(quiet.min).toBeCloseTo(quiet.initial,2);
 const reducedBox=(await canvas.boundingBox())!;await page.mouse.move(reducedBox.x+reducedBox.width/2,reducedBox.y+reducedBox.height/2);await page.mouse.down();await page.mouse.move(reducedBox.x+reducedBox.width/2+60,reducedBox.y+reducedBox.height/2+20,{steps:6});await page.mouse.up();
 await expect(canvas).toHaveAttribute('data-interacting','false');const noInertia=await observeCamera(canvas,1100);expect(noInertia.max).toBeCloseTo(noInertia.initial,2);expect(noInertia.min).toBeCloseTo(noInertia.initial,2);
 // Cancellation/capture loss must not turn the subsequent release into a country click.
 // Settings navigation remounts the globe: observe this current canvas, not the disposed one.
 await canvas.evaluate(node=>{(window as any).__atlasPointerEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])node.addEventListener(type,event=>{const e=event as PointerEvent;const events=(window as any).__atlasPointerEvents;events.push({type,pointerId:e.pointerId,buttons:e.buttons,x:e.clientX,y:e.clientY,captured:node.hasPointerCapture(e.pointerId),cursor:getComputedStyle(node).cursor});if(events.length>160)events.shift();});});
 for(const interruption of ['cancel','lost']){
  const rect=(await canvas.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await expect(canvas).toHaveAttribute('data-interacting','true');
  await canvas.evaluate((node,kind)=>{const events=(window as any).__atlasPointerEvents;const id=events.filter((e:any)=>e.type==='pointerdown').at(-1).pointerId;if(kind==='cancel')node.dispatchEvent(new PointerEvent('pointercancel',{pointerId:id,pointerType:'mouse',bubbles:true}));else node.releasePointerCapture(id);},interruption);
  await expect.poll(()=>canvas.evaluate(node=>{const id=(window as any).__atlasPointerEvents.filter((e:any)=>e.type==='pointerdown').at(-1).pointerId;return node.hasPointerCapture(id);})).toBe(false);
  await page.mouse.up();await test.info().attach('pointer-events-'+interruption,{body:Buffer.from(JSON.stringify(await page.evaluate(()=>(window as any).__atlasPointerEvents),null,2)),contentType:'application/json'});await expect(canvas).toHaveAttribute('data-interacting','false');await expect(canvas).toHaveAttribute('data-camera-mode','free');await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');
 }
 const beforeDrag=Number(await canvas.getAttribute('data-camera-longitude'));const rect=(await canvas.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+70,rect.y+rect.height/2+20,{steps:6});await page.mouse.up();expect(Math.abs(Number(await canvas.getAttribute('data-camera-longitude'))-beforeDrag)).toBeGreaterThan(.1);
 await page.getByRole('button',{name:'Recentrer sur le pays choisi'}).click();await expect(canvas).toHaveAttribute('data-camera-mode','focused');await page.getByRole('button',{name:'Zoom avant',exact:true}).click();await centered();
 const pointerEvents=await page.evaluate(()=>(window as any).__atlasPointerEvents);expect(pointerEvents.some((e:any)=>e.type==='pointercancel')).toBe(true);expect(pointerEvents.some((e:any)=>e.type==='lostpointercapture')).toBe(true);await test.info().attach('pointer-events',{body:Buffer.from(JSON.stringify(pointerEvents,null,2)),contentType:'application/json'});
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('Reduced motion',{exact:true}).uncheck();await page.emulateMedia({reducedMotion:'reduce'});await back(page);await expect(canvas).toHaveAttribute('data-motion','reduced');await expect(page.locator('html')).toHaveClass(/reduced-motion/);expect(errors).toEqual([]);
});

test('settings persist through restart, display failure is visible and retryable',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.evaluate(()=>{(window as any).__syntheticFailDisplay=true;});await page.getByRole('combobox',{name:'Display mode',exact:true}).selectOption('fullscreen');await expect(page.getByRole('alert')).toContainText('Mode d’affichage non appliqué');await expect(page.getByRole('combobox',{name:'Display mode',exact:true})).toHaveValue('windowed');expect(await page.evaluate(()=>(window as any).__syntheticDisplayMode)).toBe('windowed');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('synthetic-native-settings')??'{}')['projectatlas.settings.v1']).graphics.displayMode)).toBe('windowed');
 await page.getByRole('button',{name:'Réessayer le mode d’affichage'}).click();await expect(page.getByRole('combobox',{name:'Display mode',exact:true})).toBeEnabled();await expect(page.getByRole('alert')).toContainText('Mode d’affichage non appliqué');
 await page.getByRole('combobox',{name:'UI scale',exact:true}).selectOption('1.3');await expect(page.getByRole('alert')).toContainText('Mode d’affichage non appliqué');
 await page.evaluate(()=>{(window as any).__syntheticFailDisplay=false;(window as any).__syntheticDeferDisplay=true;});await page.getByRole('button',{name:'Réessayer le mode d’affichage'}).click();
 await expect(page.getByRole('combobox',{name:'Display mode',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Display mode',exact:true})).toHaveValue('windowed');await expect(page.getByRole('alert')).toContainText('Mode d’affichage non appliqué');
 expect(await page.evaluate(()=>(window as any).__syntheticDisplayMode)).toBe('windowed');
 await page.getByRole('combobox',{name:'UI scale',exact:true}).selectOption('1.5');
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).__syntheticResolveDisplay)).toBe('function');await page.evaluate(()=>{(window as any).__syntheticDeferDisplay=false;(window as any).__syntheticResolveDisplay();});await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Display mode',exact:true})).toHaveValue('fullscreen');expect(await page.evaluate(()=>(window as any).__syntheticDisplayMode)).toBe('fullscreen');
 await page.getByRole('combobox',{name:'UI scale',exact:true}).selectOption('1.5');await page.getByRole('button',{name:'Gameplay',exact:true}).click();await page.getByRole('combobox',{name:'Default simulation speed',exact:true}).selectOption('5');await page.getByLabel('Autosave',{exact:true}).uncheck();await page.getByLabel('Pause on urgent events').uncheck();await page.getByRole('combobox',{name:'Autosave interval',exact:true}).selectOption('30');await expect(page.getByRole('combobox',{name:'Autosave interval',exact:true})).toHaveValue('30');await page.getByRole('button',{name:'Interface',exact:true}).click();await page.getByLabel('Show provenance details').check();await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByLabel('High contrast').check();await page.getByLabel('Reduced motion',{exact:true}).check();
 await expect(page.getByRole('checkbox',{name:'Reduced motion',exact:true})).toBeChecked();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('synthetic-native-settings')??'{}')['projectatlas.settings.v1']??'{}'))).toMatchObject({graphics:{displayMode:'fullscreen',uiScale:1.5},gameplay:{defaultSpeed:5,autosave:false,pauseOnUrgent:false,autosaveIntervalMinutes:30},interface:{showProvenance:true},accessibility:{uiScale:1.5,highContrast:true,reducedMotion:true}});
 await page.reload();await restoredSettings(page);
 const restarted=await page.context().newPage();await storage(restarted);await restarted.goto('/');await restoredSettings(restarted);await restarted.close();
 await prepareCampaign(page);await expect(page.getByRole('button',{name:'×5',exact:true})).toHaveClass('active');
 // Preparing another campaign is reversible; installation is the destructive boundary.
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();await prepareCampaign(page);await expect(guard(page)).toBeVisible();await guard(page).getByRole('button',{name:'Annuler et conserver la session'}).click();await expect(page.locator('.ng-recap')).toBeVisible();
});

test('no WebGL keeps navigation and saved preview available at both sizes and scales',async({page})=>{
 await storage(page);await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return Reflect.apply(old,this,[type,...args]);} as typeof old;});await page.goto('/');
 const combinations:string[]=[];
 for(const scale of ['1','1.5']){
  await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('combobox',{name:'UI scale',exact:true}).selectOption(scale);await expect(page.getByRole('combobox',{name:'UI scale',exact:true})).toHaveValue(scale);await back(page);
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
   await page.setViewportSize(viewport);const suffix=`${viewport.width}x${viewport.height}-ui${Number(scale)*100}`;
   const writes=await page.evaluate(()=>(window as any).__syntheticWrites);
   await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();
   await page.getByLabel('Rechercher un pays',{exact:true}).fill('Canada');const canada=page.locator('.ng-search-results button').filter({hasText:'Canada'}).first();await canada.focus();await page.keyboard.press('Enter');await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');
   await shot(page,'no-webgl-new-'+suffix);await page.getByRole('button',{name:'Retour au menu',exact:false}).click();
   await selectSave(page);await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await shot(page,'no-webgl-load-'+suffix);
   await expect(page.getByRole('button',{name:'Charger la campagne',exact:false})).toBeEnabled();expect(await page.evaluate(()=>(window as any).__syntheticWrites)).toBe(writes);
   await page.getByRole('button',{name:'Charger la campagne',exact:false}).click();
   await expect(page.locator('.clock strong')).toContainText('2031');const date=await page.locator('.clock strong').textContent();
   await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();
   await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Retour au menu',exact:false}).click();
   await page.getByRole('button',{name:'Continuer',exact:false}).first().click();await expect(page.locator('.clock strong')).toHaveText(date!);
   await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();combinations.push(suffix);
  }
 }
 expect(combinations).toEqual(['1920x1080-ui100','1366x768-ui100','1920x1080-ui150','1366x768-ui150']);
});
