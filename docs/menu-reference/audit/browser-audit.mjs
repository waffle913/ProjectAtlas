// Automated checks against the real running React application (no DOM injection).
// Playwright is an external test tool; production dependencies are unchanged.
// Usage: PROJECTATLAS_PLAYWRIGHT_MODULE=<module file URL> node browser-audit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PROJECTATLAS_PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.PROJECTATLAS_URL ?? 'http://127.0.0.1:5174';
const out = fileURLToPath(new URL('./', import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.PROJECTATLAS_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const checks = [], errors = [], layouts = [];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
const menu = () => page.locator('.atlas-menu');
const pause = () => page.getByRole('dialog', { name: 'Pause menu', exact: true });
async function back() { await page.getByRole('button', { name: /Back/ }).click(); }
async function requireMenu() { await menu().waitFor(); assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).count(), 0); }
async function openPause() { await page.getByRole('button', { name: 'Menu', exact: true }).click(); }
async function capture(name, width, height) {
  await page.setViewportSize({ width, height });
  const layout = await page.evaluate(() => {
    const rect = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      content: rect(document.querySelector('.atlas-content')), footer: rect(document.querySelector('.atlas-footer')),
      panels: [...document.querySelectorAll('.atlas-panel')].map(rect),
      overlappingSaveDetails: [...document.querySelectorAll('.atlas-save')].filter(e=>e.querySelector('.atlas-save-details').getBoundingClientRect().height>e.getBoundingClientRect().height-4).map(e=>e.textContent),
      clippedControls: [...document.querySelectorAll('.atlas-nav button,.atlas-panel-heading button')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent) };
  });
  assert.equal(layout.overlappingSaveDetails.length,0,`${name}: overlapping save rows`);
  assert(!layout.horizontalOverflow, `${name}: horizontal overflow`);
  assert.equal(layout.clippedControls.length, 0, `${name}: clipped controls ${layout.clippedControls}`);
  assert(layout.content.bottom <= layout.footer.y + 1, `${name}: content/footer overlap`);
  layouts.push({ name, width, height, ...layout });
  await page.screenshot({ path: out + name + '.png', fullPage: true });
  if (name.includes('ui150')) await page.screenshot({ path: out + name + '-viewport.png', fullPage: false });
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('.atlas-nav-list button')?.disabled, { timeout: 90000 });
  assert.equal(await page.getByRole('button', { name: /Notifications|Messages/ }).count(), 0);
  assert.equal(await page.locator('.atlas-summary,.atlas-news').count(), 0);
  checks.push('No messages/notifications shortcuts or campaign panel without selection');
  await capture('empty-1920x1080',1920,1080); await capture('empty-1366x768',1366,768);
  await page.setViewportSize({width:1920,height:1080});
  for(const name of ['Paramètres','Crédits','Charger une partie']) {
    await page.getByRole('button',{name,exact:true}).first().click(); await back(); await requireMenu();
  }
  checks.push('Settings/Credits/Load return to menu without an active game');
  // Full-world JSON exceeds browser localStorage quota. Install the EXISTING SaveBackend
  // testing seam in this isolated browser. Save As still serializes the actual engine
  // state and creates its real metadata; no handcrafted saves/events are supplied.
  await page.evaluate(async () => {
    const { setSaveBackend } = await import('/src/app/saveStorage.ts');
    window.__menuAudit = { files: new Map(), writes: 0 };
    const audit=window.__menuAudit;
    setSaveBackend({ list:()=>[...audit.files.keys()], read:id=>audit.files.get(id)??null,
      write:async(id,value)=>{audit.files.set(id,value);audit.writes++;}, remove:async id=>{audit.files.delete(id);} });
  });
  await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();
  await page.getByRole('button',{name:'Play this person',exact:true}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).waitFor({timeout:90000});
  for(const name of ['Settings','Load Game']) {
    await openPause(); await pause().getByRole('button',{name,exact:true}).click(); await back();
    assert.equal(await menu().count(),0); await page.getByRole('button',{name:'Menu',exact:true}).waitFor();
  }
  checks.push('Settings/Load opened from the active game return to game');
  async function saveAs(name) {
    await openPause(); await pause().getByRole('button',{name:'Save As',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Save game',exact:true});
    await dialog.getByPlaceholder('Save name').fill(name); await dialog.getByRole('button',{name:'Save',exact:true}).click();
    await dialog.waitFor({state:'hidden',timeout:90000});
  }
  await saveAs('Campagne de contrôle'); await saveAs('Reprise de contrôle');
  checks.push('Two actual serialized saves created through the game Save As workflow');
  await openPause(); await pause().getByRole('button',{name:'Return to Main Menu',exact:true}).click();
  await requireMenu(); assert.equal(await page.locator('.atlas-save').count(),2); assert.equal(await page.locator('.atlas-summary').count(),0);
  const writes=await page.evaluate(()=>window.__menuAudit.writes);
  await page.locator('.atlas-save').nth(1).click(); await requireMenu();
  assert.equal(await page.evaluate(()=>window.__menuAudit.writes),writes);
  assert.equal(await page.locator('.atlas-summary').count(),1);
  assert((await page.locator('.atlas-summary-context').innerText()).includes('Campagne de contrôle'));
  assert((await page.locator('.atlas-summary').innerText()).includes('Aucun événement accessible'));
  checks.push('Selecting an actual save opens an honest empty summary without loading or writing');
  for(const name of ['Paramètres','Crédits','Charger une partie']) {
    await page.getByRole('button',{name,exact:true}).first().click(); await back(); await requireMenu();
    assert.equal(await page.locator('.atlas-save[aria-pressed="true"]').count(),1);
  }
  checks.push('Settings/Credits/Load opened from main menu return to main menu despite an active in-memory game; selection retained');
  await capture('selected-1920x1080',1920,1080); await capture('selected-1366x768',1366,768);
  await page.getByRole('button',{name:'Paramètres',exact:true}).first().click();
  await page.locator('.settings-pane label').filter({hasText:'UI scale'}).locator('select').selectOption('1.5'); await back(); await requireMenu();
  assert.equal(await page.locator('.atlas-large-ui').count(),1);
  await capture('selected-ui150-1920x1080',1920,1080); await capture('selected-ui150-1366x768',1366,768);
  checks.push('1920x1080 and 1366x768 checked at UI 100% and 150%, without horizontal overflow, clipped navigation or footer overlap');
  await page.getByRole('button',{name:'Charger cette partie',exact:false}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).waitFor({timeout:90000}); assert.equal(await menu().count(),0);
  checks.push('Only the explicit Load selected campaign action restores the actual serialized save');
  await openPause(); await pause().getByRole('button',{name:'Return to Main Menu',exact:true}).click(); await requireMenu();
  assert.equal(await page.locator('.atlas-summary').count(),0);
  checks.push('Successful loading clears the old preview selection');
  await page.locator('.atlas-save').first().click();
  await page.getByRole('button',{name:'Charger une partie',exact:true}).click();
  const row=page.locator('.save-entry').filter({hasText:'Reprise de contrôle'});
  await row.getByRole('button',{name:'Delete',exact:true}).click(); await row.getByRole('button',{name:'Confirm',exact:true}).click();
  await row.waitFor({state:'hidden'}); await back(); await requireMenu();
  assert.equal(await page.locator('.atlas-summary').count(),0); assert.equal(await page.locator('.atlas-save').count(),1);
  checks.push('Deleting the selected save hides the preview without choosing another campaign');
  assert.equal(errors.length,0);
  await fs.writeFile(out+'browser-results.json',JSON.stringify({checks,errors,layouts,saveBackend:'existing SaveBackend seam, isolated in-memory storage of genuine game-generated full-world saves'},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
} catch(error) {
  await page.screenshot({path:out+'check-failure.png',fullPage:true});
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); }

