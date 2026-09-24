import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getFolioDb, resetFolioDbForTests } from '../folio-db/init.js';
import * as memory from './store.js';
import * as changes from './changes.js';
vi.mock('../mail-intake/model-session.js', () => ({withMailModel:async (_role:string,work:()=>Promise<unknown>)=>work()}));
let dir: string;
beforeEach(() => { dir=mkdtempSync(join(tmpdir(),'folio-change-test-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.stubEnv('FOLIO_VAULT_OVERRIDE',join(dir,'vault')); });
afterEach(() => {resetFolioDbForTests();vi.unstubAllEnvs();vi.unstubAllGlobals();rmSync(dir,{recursive:true,force:true});});
function fact(confirmed=true) {
 const f=memory.proposeMemoryFact({domain:'career',data_class:'profile',sensitivity:'private',subject:'Test project',predicate:'has_profile_fact',value:'Previous description',source_ref:`test:${randomUUID()}`,source_kind:'test',source_excerpt:'Previous description',actor_id:'fixture'});
 return confirmed ? memory.confirmMemoryFactByHuman(f.fact_id,'owner:1') : f;
}
const draft={value:'Updated description',predicate:'has_profile_fact',valid_from:null,reason:'Owner clarified project state.'};
function stage(f= fact()) {const id=changes.stageMemoryChange({snapshot:changes.changeSnapshot(f.fact_id),instruction:'Please update the project description.',draft,model:'local:test',owner:'owner:1'});return {f,id,row:changes.listMemoryChanges('owner:1').find(r=>r.request_id===id)!};}
it.each([true,false])('does not change a confirmed=%s fact until slide review; keeps history',confirmed=>{
 const f=fact(confirmed);const {id,row}=stage(f);
 expect(memory.getMemoryFact(f.fact_id)).toEqual(f);
 expect(getFolioDb().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:1});
 const replacement=changes.reviewMemoryChange(id,row.version,'owner:1','apply')!;
 expect(memory.getMemoryFact(f.fact_id)).toMatchObject({status:'superseded',value_text:f.value_text});
 expect(memory.getMemoryFact(replacement)).toMatchObject({status:'confirmed',value_text:draft.value,confirmed_by:'owner:1',supersedes_fact_id:f.fact_id,source_kind:'owner-instruction',sensitivity:'private'});
 expect(()=>changes.reviewMemoryChange(id,row.version,'owner:1','apply')).toThrow();
});
it('rejects another owner, forged versions and stale evidence without writes',()=>{
 const {f,id,row}=stage();
 expect(()=>changes.reviewMemoryChange(id,row.version,'owner:2','apply')).toThrow();
 expect(()=>changes.reviewMemoryChange(id,'forged','owner:1','apply')).toThrow();
 getFolioDb().prepare('UPDATE memory_facts SET source_excerpt=? WHERE fact_id=?').run('New source',f.fact_id);
 expect(changes.listMemoryChanges('owner:1')[0].stale).toBe(true);
 expect(()=>changes.reviewMemoryChange(id,row.version,'owner:1','apply')).toThrow('verändert');
 expect(getFolioDb().prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({n:1});
 changes.reviewMemoryChange(id,row.version,'owner:1','reject');
 expect(memory.getMemoryFact(f.fact_id).status).toBe('confirmed');
});
it('new matching source arriving after preview invalidates the old proposal',()=>{
 const {id,row}=stage();fact();
 expect(()=>changes.reviewMemoryChange(id,row.version,'owner:1','apply')).toThrow('verändert');
});
it('never lowers sensitivity and rejects changed additional evidence',()=>{
 const target=fact(), evidence=fact();getFolioDb().prepare("UPDATE memory_facts SET sensitivity='sensitive' WHERE fact_id=?").run(evidence.fact_id);
 const id=changes.stageMemoryChange({snapshot:changes.changeSnapshot(target.fact_id,evidence.fact_id),instruction:'Use the new source.',draft,model:'local',owner:'owner:1'});
 const row=changes.listMemoryChanges('owner:1')[0];
 const replacement=changes.reviewMemoryChange(id,row.version,'owner:1','apply')!;
 expect(memory.getMemoryFact(replacement).sensitivity).toBe('sensitive');
});
it('rejects model-invented fields, identity changes, dates and no-op responses',()=>{
 const f=fact();
 for(const raw of [{...draft,subject:'Other person'},{...draft,predicate:'execute_shell'},{...draft,valid_from:'2026-02-30'},{...draft,value:f.value_text},{...draft,predicate:'paid'}])expect(()=>changes.validateChangeDraft(raw,f)).toThrow();
});
it('checks drift during inference before staging',()=>{
 const f=fact(),snapshot=changes.changeSnapshot(f.fact_id);fact();
 expect(()=>changes.stageMemoryChange({snapshot,instruction:'Update',draft,model:'local',owner:'owner:1'})).toThrow('geändert');
 expect(changes.listMemoryChanges('owner:1')).toHaveLength(0);
});
it('local model prepares a proposal with no tools and no canonical mutation',async()=>{
 const f=fact();const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({models:[{type:'llm',key:'test-local',loaded_instances:[{}]}]}))).mockResolvedValueOnce(new Response(JSON.stringify({output:[{type:'message',content:JSON.stringify(draft)}]})));
 vi.stubGlobal('fetch',fetcher);
 const {prepareMemoryChange}=await import('../focus/memory-change.js');
 await prepareMemoryChange(f.fact_id,null,'Please update this description.','owner:1');
 expect(memory.getMemoryFact(f.fact_id)).toEqual(f);
 expect(changes.listMemoryChanges('owner:1')).toHaveLength(1);
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({integrations:[],store:false});
});
it('review route requires owner, same origin, and explicit slide marker',async()=>{
 const {id,row}=stage();const {actions}=await import('../../../routes/memory/changes/+page.server.js');
 const event=(role:string,origin:string,marker=false)=>{const data=new FormData();Object.entries({request_id:id,version:row.version,decision:'apply',...(marker?{slide_approved:'yes'}:{})}).forEach(([k,v])=>data.set(k,v));return {locals:{user:{role,id:'1'}},url:new URL('http://localhost/memory/changes'),request:new Request('http://localhost/memory/changes',{method:'POST',headers:{origin},body:data})};};
 await expect((actions.review as Function)(event('visitor','http://localhost'))).rejects.toMatchObject({status:403});
 await expect((actions.review as Function)(event('owner','http://evil.test'))).rejects.toMatchObject({status:403});
 expect(await (actions.review as Function)(event('owner','http://localhost'))).toMatchObject({status:409});
 expect(await (actions.review as Function)(event('owner','http://localhost',true))).toMatchObject({success:true});
});
