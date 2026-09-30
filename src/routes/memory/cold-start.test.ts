import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getFolioDb, resetFolioDbForTests } from '$lib/server/folio-db/init.js';
import { proposeMemoryBundle } from '$lib/server/memory/store.js';
import { load } from './+page.server.js';
let root:string;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'memory-cold-'));mkdirSync(join(root,'vault'));vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));vi.stubEnv('FOLIO_VAULT_OVERRIDE',join(root,'vault'));vi.stubEnv('FEEDBACK_DB_PATH',join(root,'missing-feedback.db'));vi.stubEnv('FOLIO_CAREER_TRACKER_PATH',join(root,'missing-tracker'));resetFolioDbForTests();});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
it('opens every Memory view before mail intake was configured, preserving decisions and waiting receipts',async()=>{
 const make=(predicate:string)=>proposeMemoryBundle({domain:'household',source_kind:'manual',source_ref:'synthetic:'+predicate,actor_id:'fixture',extractor_id:'fixture',facts:[{data_class:'context',sensitivity:'private',subject:'Mustervertrag',predicate,value:'Quelle prüfen'}]});
 const decision=make('has_context');make('paid');
 expect(getFolioDb().prepare("SELECT name FROM sqlite_master WHERE name='mail_intake_sources'").get()).toBeUndefined();
 for(const view of ['overview','review','processing','automatic','history','knowledge','maintenance']){
  const data:any=await load({url:new URL('http://localhost/memory?view='+view),locals:{user:{id:1,role:'owner'}}} as any);
  expect(data.memoryView).toBe(view);
  if(view==='review')expect(data.candidateBundles.map((b:any)=>b.proposal.proposal_id)).toEqual([decision.proposal.proposal_id]);
 }
 expect(getFolioDb().prepare('SELECT count(*) n FROM mail_intake_config').get()).toEqual({n:0});
});
