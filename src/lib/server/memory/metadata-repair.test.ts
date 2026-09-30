import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';import { randomUUID } from 'node:crypto';
const mocks=vi.hoisted(()=>({date:'2026-09-22T13:00:00+02:00'}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:()=>({id:7,account_id:'test',imap_uid:42,mail_date:mocks.date})}));
import { resetFolioDbForTests } from '../folio-db/init.js';
import { db } from '../mail-intake/state.js';
import { proposeMemoryBundle,getMemoryReviewSnapshot,memorySnapshotDigest } from './store.js';
import { receiptDateRepair,applyReceiptDateRepair,mailMetadataDate } from './metadata-repair.js';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'memory-repair-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();mocks.date='2026-09-22T13:00:00+02:00';});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
function setup(){
 const b=proposeMemoryBundle({domain:'personal',source_kind:'mail',source_ref:'mail:test:42',extractor_id:'extractor',actor_id:'test',facts:[{data_class:'context',sensitivity:'private',subject:'Maintenance',predicate:'received_at',value:'2026-09-22',source_excerpt:'Thank you for your message.',valid_from:'2026-09-22'}]});
 db().prepare('INSERT INTO mail_intake_sources VALUES(7,\'test\',42,1,\'Thank you for your message.\',0)').run();
 const snapshot=getMemoryReviewSnapshot(b.proposal.proposal_id),hash=memorySnapshotDigest(snapshot);
 db().prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,?,'proposal',?,'delegated_reviewed','system','reviewer',?,?)").run(randomUUID(),b.proposal.proposal_id,b.proposal.proposal_id,JSON.stringify({verdict:'reject',bundle_digest:hash,diagnostic:{unsupported_object_ids:[b.facts[0].fact_id]}}),new Date().toISOString());
 return {b,hash};
}
it('repairs only mail metadata, preserves candidate status and records the old fact',()=>{
 const {b,hash}=setup(),id=b.proposal.proposal_id;expect(receiptDateRepair(id)?.snapshotHash).toBe(hash);expect(applyReceiptDateRepair(id,hash,'owner')).toBe(7);
 const f=getMemoryReviewSnapshot(id).bundle.facts[0];expect(f).toMatchObject({predicate:'mail_received_at',valid_from:null,status:'candidate',source_excerpt:mocks.date});
 const audit=db().prepare("SELECT detail_json FROM memory_ledger WHERE event_type='metadata_repaired'").get() as any;expect(JSON.parse(audit.detail_json).before.predicate).toBe('received_at');
 expect(receiptDateRepair(id)).toBeNull();expect(()=>applyReceiptDateRepair(id,hash,'owner')).toThrow();
});
it('rejects stale snapshots or mismatching source dates',()=>{
 const {b,hash}=setup();expect(()=>applyReceiptDateRepair(b.proposal.proposal_id,'old','owner')).toThrow();mocks.date='2026-09-23';expect(receiptDateRepair(b.proposal.proposal_id)).toBeNull();
 mocks.date='2026-09-22';db().prepare("UPDATE memory_facts SET value_text='changed' WHERE fact_id=?").run(b.facts[0].fact_id);expect(()=>applyReceiptDateRepair(b.proposal.proposal_id,hash,'owner')).toThrow();
});
it('does not turn malformed dates into business dates',()=>{expect(mailMetadataDate('2026-02-30')).toBeNull();expect(mailMetadataDate('2026-09-22T00:15:00+02:00')).toBe('2026-09-22');});
