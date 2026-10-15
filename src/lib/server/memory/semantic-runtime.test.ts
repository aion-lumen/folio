import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { getFolioDb, resetFolioDbForTests } from '../folio-db/init.js';
import { proposeMemoryFact, confirmMemoryFactByHuman } from './store.js';
import { semanticIndexPath } from './semantic.js';
import { refreshMemoryVectors, semanticMaintenanceStatus, startMemorySemanticRuntime, stopMemorySemanticRuntime } from './semantic-runtime.js';
let dir:string;
function add(value:string) {
 const f=proposeMemoryFact({domain:'home',data_class:'context',sensitivity:'private',subject:'Synthetic room',predicate:'needs',value,source_kind:'owner',source_ref:'synthetic:'+value,actor_kind:'human',actor_id:'synthetic'});
 confirmMemoryFactByHuman(f.fact_id,'synthetic');return f;
}
function response(init:RequestInit) {
 const data=JSON.parse(String(init.body));return new Response(JSON.stringify({model:data.model,data:data.input.map((_t:string,index:number)=>({index,embedding:[1,0,0]}))}));
}
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),'folio-semantic-runtime-'));
 vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.stubEnv('FOLIO_VAULT_OVERRIDE',join(dir,'vault'));
 vi.stubEnv('FOLIO_MEMORY_SEMANTIC','1');vi.stubEnv('FOLIO_MEMORY_EMBEDDING_URL','http://127.0.0.1:1235/v1/embeddings');
 vi.stubEnv('FOLIO_MEMORY_EMBEDDING_MODEL','synthetic');vi.stubEnv('FOLIO_MEMORY_EMBEDDING_REVISION','1');vi.stubEnv('FOLIO_MEMORY_EMBEDDING_DIMENSIONS','3');
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>response(init)));
});
afterEach(()=>{stopMemorySemanticRuntime();vi.useRealTimers();resetFolioDbForTests();vi.unstubAllEnvs();vi.unstubAllGlobals();rmSync(dir,{recursive:true,force:true});});
it('refreshes new confirmations and purges withdrawn facts on the automatic cycle without canonical writes',async()=>{
 vi.useFakeTimers();const first=add('old');const before=getFolioDb().serialize();
 startMemorySemanticRuntime();startMemorySemanticRuntime();
 await vi.advanceTimersByTimeAsync(5_000);
 expect(semanticMaintenanceStatus()).toMatchObject({status:'ready',facts:1,indexed:1});
 expect(getFolioDb().serialize()).toEqual(before);
 const second=add('new');getFolioDb().prepare("UPDATE memory_facts SET status='tombstoned' WHERE fact_id=?").run(first.fact_id);
 const updated=getFolioDb().serialize();await vi.advanceTimersByTimeAsync(300_000);
 const index=new Database(semanticIndexPath(),{readonly:true});expect(index.prepare('SELECT fact_id FROM vectors').all()).toEqual([{fact_id:second.fact_id}]);index.close();
 expect(getFolioDb().serialize()).toEqual(updated);
 stopMemorySemanticRuntime();const calls=vi.mocked(fetch).mock.calls.length;await vi.advanceTimersByTimeAsync(600_000);expect(fetch).toHaveBeenCalledTimes(calls);
});
it('recovers after a service outage on the next refresh',async()=>{
 add('new');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 await refreshMemoryVectors();expect(semanticMaintenanceStatus()).toMatchObject({status:'unavailable'});
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>response(init)));
 await refreshMemoryVectors();expect(semanticMaintenanceStatus()).toMatchObject({status:'ready',indexed:1});
});
it('never starts maintenance while disabled or on a demo vault',async()=>{
 vi.useFakeTimers();vi.stubEnv('FOLIO_MEMORY_SEMANTIC','0');startMemorySemanticRuntime();await vi.advanceTimersByTimeAsync(310_000);
 expect(existsSync(semanticIndexPath())).toBe(false);expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv('FOLIO_MEMORY_SEMANTIC','1');vi.stubEnv('FOLIO_VAULT_OVERRIDE',join(dir,'demo-vault'));
 await refreshMemoryVectors();expect(semanticMaintenanceStatus()).toMatchObject({status:'excluded'});expect(fetch).not.toHaveBeenCalled();
});
it('serializes refreshes and refuses to publish old-vault readiness after a switch',async()=>{
 add('new');let resume!:()=>void;
 vi.stubGlobal('fetch',vi.fn((_url:unknown,init:RequestInit)=>new Promise<Response>(resolve=>{resume=()=>resolve(response(init));})));
 const first=refreshMemoryVectors(),second=refreshMemoryVectors();expect(second).toBe(first);
 vi.stubEnv('FOLIO_DB_PATH',join(dir,'other.db'));resume();await first;
 expect(semanticMaintenanceStatus()).toMatchObject({status:'pending'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
