import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetFolioDbForTests } from '../folio-db/init.js';
import { mailCoverage } from './coverage.js';
import { db, save } from './state.js';

let directory='';

beforeEach(()=>{
 directory=mkdtempSync(join(tmpdir(),'folio-mail-coverage-'));
 vi.stubEnv('FOLIO_DB_PATH',join(directory,'folio.db'));
 vi.stubEnv('FOLIO_MAIL_ACCOUNTS_PATH','');
 writeFileSync(join(directory,'mail-intake-accounts.json'),JSON.stringify(['gmail','work','yahoo'].map(id=>({id,label:id,kind:'imap'}))));
});

afterEach(()=>{
 resetFolioDbForTests();
 vi.unstubAllEnvs();
 rmSync(directory,{recursive:true,force:true});
});

describe('mail coverage status',()=>{
 it('separates queued, processing, failed and human-review items',()=>{
  const base={account:'gmail' as const,phase:'memory' as const,attempts:0,started_at:'2026-09-13T00:00:00.000Z'};
  save({...base,id:'queued',state:'pending',items:[{id:1,stage:'extract'},{id:2,stage:'done'}]});
  save({...base,id:'processing',state:'running',items:[{id:3,stage:'review'}]});
  save({...base,id:'failed',state:'failed',error:'extraction_unavailable',items:[{id:4,stage:'extract'},{id:5,stage:'done'}]});
  save({...base,id:'completed',state:'completed',items:[{id:6,stage:'done'}],ended_at:'2026-09-13T00:05:00.000Z'});
  db().prepare('INSERT INTO memory_proposals (proposal_id,domain,source_kind,source_ref,status,extractor_id,selection_method,created_at) VALUES (?,?,?,?,?,?,?,?)').run('proposal','ai','mail','mail:gmail:3','candidate','test','workflow','2026-09-13T00:04:00.000Z');

  const gmail=mailCoverage().find(account=>account.id==='gmail');
  expect(gmail).toMatchObject({pending:3,queued:1,processing:1,failed:1,candidates:1,humanReview:1});
 });
});
