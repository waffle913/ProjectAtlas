import fs from 'node:fs/promises';
export async function storage(page:import('@playwright/test').Page){
 const entries=JSON.parse(await fs.readFile('artifacts/load-game/fixtures.json','utf8'));
 // Exercise the production native adapter through a synthetic IPC boundary. Full-world saves
 // exceed browser localStorage quotas; do not change production storage to fit the test.
 await page.addInitScript((entries)=>{
  const index:Record<string,unknown>={};const writes=new Map<string,string>();const removed=new Set<string>();
  for(const entry of entries)index[entry.id]=entry.metadata;
  for(const kind of ['corrupt','incompatible','missing'])index['synthetic.'+kind]={...entries[0].metadata,name:'TEST SYNTHÉTIQUE — '+({corrupt:'corrompue',incompatible:'incompatible',missing:'introuvable'})[kind as 'corrupt'|'incompatible'|'missing']};
  let settings:string|null=localStorage.getItem('synthetic-native-settings');
  const callbacks=new Map<number,(event:unknown)=>unknown>();const listeners=new Map<number,{event:string;handler:number}>();let sequence=0;
  const w=window as unknown as {__syntheticExit:number;__syntheticReads:number;__syntheticFailDisplay:boolean;__syntheticClose:()=>Promise<void>;__TAURI_EVENT_PLUGIN_INTERNALS__:unknown};
  w.__syntheticExit=0;w.__syntheticReads=0;
  w.__syntheticClose=async()=>{for(const [id,l] of listeners)if(l.event==='tauri://close-requested')await callbacks.get(l.handler)?.({event:l.event,id,payload:null});};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  (window as unknown as {__syntheticWrites:number}).__syntheticWrites=0;
  (window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(callback:(event:unknown)=>unknown)=>{const id=++sequence;callbacks.set(id,callback);return id;},unregisterCallback:(id:number)=>callbacks.delete(id),invoke:async(command:string,args:Record<string,unknown>={})=>{
   const id=String(args.id);
   if(command==='plugin:event|listen'){const key=++sequence;listeners.set(key,{event:String(args.event),handler:Number(args.handler)});return key;}
   if(command==='plugin:event|unlisten'){listeners.delete(Number(args.eventId));return;}
   if(command==='exit_app'){w.__syntheticExit++;return;}
   if(command==='settings_read')return settings;
   if(command==='settings_write'){settings=String(args.json);localStorage.setItem('synthetic-native-settings',settings);return;}
   if(command==='set_display_mode'){if(w.__syntheticFailDisplay)throw new Error('Synthetic native display rejection');return;}
   if(command==='save_file_list')return [...entries.map(e=>e.id),'synthetic.corrupt','synthetic.incompatible','__index__'];
   if(command==='save_file_read'){w.__syntheticReads++;
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
