import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('real globe, search, four-step confirmation and menu continuity',async({page})=>{
 const errors:string[]=[];const external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('data:'))external.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();
 await expect(page.locator('.ng-country-title h1')).toHaveText('France');await expect(page.locator('[data-globe-status]')).toHaveAttribute('data-globe-status','ready');
 await expect(page.locator('.ng-globe canvas')).toBeVisible();await expect(page.locator('.ng-globe canvas')).toHaveAttribute('data-texture-status','ready');await fs.mkdir('artifacts/new-game',{recursive:true});
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){await page.setViewportSize(viewport);await page.screenshot({path:`artifacts/new-game/france-${viewport.width}x${viewport.height}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
 await page.setViewportSize({width:1920,height:1080});
 await page.getByLabel('Rechercher un pays',{exact:true}).fill('Canada');await page.locator('.ng-search-results button').filter({hasText:'Canada'}).click();await expect(page.locator('.ng-country-title h1')).toHaveText('Canada');await expect(page.locator('.ng-hover')).toHaveText('Canada');
 await page.getByRole('button',{name:'Zoom avant',exact:true}).click();await page.getByRole('button',{name:'Recentrer sur le pays choisi'}).click();
 await page.getByRole('button',{name:'Retour au menu',exact:false}).click();await expect(page.locator('.atlas-menu')).toBeVisible();
 await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();
 const select=page.getByLabel('Catalogue complet des pays');const option=await select.locator('option').evaluateAll(os=>(os as HTMLOptionElement[]).find(o=>!o.text.includes('indisponible'))?.value);expect(option).toBeTruthy();await select.selectOption(option!);
 await page.getByRole('button',{name:'Continuer',exact:false}).click();await page.locator('.ng-paths button:not([disabled])').first().click();await page.locator('.ng-person').first().click();
 await page.getByRole('button',{name:'Continuer',exact:false}).click();await expect(page.locator('.ng-configuration')).toBeVisible();await page.getByRole('button',{name:'Continuer',exact:false}).click();
 await expect(page.locator('.ng-recap')).toBeVisible();await page.screenshot({path:'artifacts/new-game/recap-1920x1080.png'});
 await page.getByRole('button',{name:'Lancer la campagne',exact:false}).click();await expect(page.getByRole('button',{name:'Menu',exact:true})).toBeVisible();await expect(page.locator('.start-overlay')).toHaveCount(0);await expect(page.locator('.clock strong')).toContainText('2026');
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Return to Main Menu',exact:true}).click();await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:/Back/}).click();await expect(page.locator('.new-game-setup')).toBeVisible();await page.getByRole('button',{name:'Retour au menu',exact:false}).click();await expect(page.locator('.atlas-menu')).toBeVisible();
 expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('honest keyboard/list fallback when WebGL is unavailable',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
 await page.goto('/');await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await expect(page.getByText('Globe 3D indisponible',{exact:true})).toBeVisible();await page.getByLabel('Rechercher un pays',{exact:true}).fill('France');await page.getByLabel('Rechercher un pays',{exact:true}).press('Enter');await expect(page.locator('.ng-country-title h1')).toHaveText('France');await page.screenshot({path:'artifacts/new-game/fallback-1366x768.png'});await context.close();
});
