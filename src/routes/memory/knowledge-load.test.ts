import {it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
vi.mock('$lib/server/calendar/planning.js',()=>({calendarMatches:async()=>({}),calendarConflicts:()=>({})}));
vi.mock('$lib/server/memory/payment-confirmation.js',()=>({listPaymentConfirmedMemory:()=>[]}));
vi.mock('$lib/server/memory/quorum.js',()=>({inspectMemoryQuorum:()=>[],listSourceConfirmedMemory:()=>[]}));
vi.mock('$lib/server/memory/review.js',()=>({listMemoryReviewQueue:()=>({active:[],standalone:[],historical:[],historicalStandalone:[],counts:{historicalFacts:0},today:'2026-09-19'})}));
import {resetFolioDbForTests} from '$lib/server/folio-db/init.js';
import {proposeMemoryFact,confirmMemoryFactByHuman} from '$lib/server/memory/store.js';
import {load} from './+page.server.js';
it('keeps confirmed knowledge visible with more than 300 pending facts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'folio-memory-visibility-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();
 try{
  const create=(n:number)=>proposeMemoryFact({domain:'career',data_class:'profile',subject:'Test person',predicate:'has_profile_fact',value:'Fact '+n,sensitivity:'private',source_kind:'owner',source_ref:'test:'+n,actor_kind:'human',actor_id:'test'});
  const confirmed=create(0);confirmMemoryFactByHuman(confirmed.fact_id,'test');
  for(let i=1;i<=301;i++)create(i);
  const data:any=await load({url:new URL('http://localhost/memory?view=knowledge'),locals:{user:{role:'owner',id:1}}} as any);
  expect(data.confirmed.map((f:any)=>f.fact_id)).toEqual([confirmed.fact_id]);
 }finally{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});}
});
