// @vitest-environment happy-dom
import { afterEach,describe,it,expect } from 'vitest';
import { inspectSaveCatalog,setSaveBackend,saveGame } from '../saveStorage';
describe('load catalogue diagnostics over the existing backend',()=>{
 afterEach(()=>setSaveBackend({list:()=>[],read:()=>null,write:async()=>{},remove:async()=>{}}));
 it('retains indexed missing saves and orphaned raw entries without hiding other entries',()=>{
  setSaveBackend({list:()=>['orphan','__index__'],read:id=>id==='__index__'?JSON.stringify({missing:{name:'Missing',modifiedAt:'2026-01-01'}}):null,write:async()=>{},remove:async()=>{}});
  const result=inspectSaveCatalog();expect(result.entries.map(e=>e.id).sort()).toEqual(['missing','orphan']);expect(result.warnings).toHaveLength(1);
 });
 it('shows unavailable storage and invalid index honestly',()=>{
  setSaveBackend({diagnose:()=> 'Storage unavailable',list:()=>['orphan'],read:()=>'{broken',write:async()=>{},remove:async()=>{}});
  expect(inspectSaveCatalog().warnings).toHaveLength(3);
 });
 it('does not mutate storage when reading and preserves automatic identity',async()=>{
  const store=new Map<string,string>();let writes=0;
  setSaveBackend({list:()=>[...store.keys()],read:id=>store.get(id)??null,write:async(id,v)=>{writes++;store.set(id,v);},remove:async()=>{}});
  await saveGame('__autosave__','Autosave','{}',{countryId:'c',countryName:'C',controlledPersonName:'P',office:null,simulationDate:'2026-01-01',schemaVersion:20});
  const before=writes;expect(inspectSaveCatalog().entries[0].id).toBe('__autosave__');expect(writes).toBe(before);
 });
});
