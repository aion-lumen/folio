import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { resetFolioDbForTests } from '../folio-db/init.js';
import { acquire,release,configure,save,runs,getIntakeRun,assertAuthorization,db,acquireModelActivity,releaseModelActivity,modelActivities,renewModelActivity,type IntakeRun } from './state.js';
import {prepareIntakeRetry} from './retry.js';
import { memoryMailBody, localMailSource } from './source.js';
import type { FeedbackRow } from '../feedback/types.js';
let dir='';beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'folio-intake-test-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));});afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('durable intake authority',()=>{
 it('retains account priorities and existing scopes across pause and reactivation',()=>{
  const first=configure(true,'owner:1','priority',10,{unread_first:true,deferred_accounts:['yahoo'],career_rejections:true,history_paused:true});
  const paused=configure(false,'owner:1','pause',10);
  const resumed=configure(true,'owner:1','resume',10);
  for(const c of [paused,resumed])expect(c).toMatchObject({unread_first:true,deferred_accounts:['yahoo'],career_rejections:true,history_paused:true,activated_at:first.activated_at});
  expect(configure(true,'owner:1','normal',10,{unread_first:false,deferred_accounts:[]})).toMatchObject({unread_first:false,deferred_accounts:[]});
 });
 it('can retry and authorize an older batch beyond the recent history window',()=>{
  const c=configure(true,'owner:1','synthetic retry');
  const old:IntakeRun={id:'old-failed',account:'gmail',state:'failed',phase:'memory',items:[{id:7,stage:'review'}],attempts:3,started_at:'2026-09-01'};
  save(old);
  for(let i=0;i<305;i++)save({...old,id:`recent-${i}`,state:'completed',items:[]});
  expect(runs()).toHaveLength(300);expect(runs().some(r=>r.id===old.id)).toBe(false);
  expect(getIntakeRun('missing')).toBeNull();expect(getIntakeRun(old.id)).toEqual(old);
  const retry=prepareIntakeRetry(getIntakeRun(old.id)!);save(retry);
  expect(runs()).toHaveLength(301);expect(runs()[0]).toMatchObject({id:old.id,state:'pending',items:old.items});
  save({...retry,state:'running'});
  expect(()=>assertAuthorization(c.authorization_id,old.id,7,'owner:1')).not.toThrow();
  expect(()=>assertAuthorization(c.authorization_id,old.id,8,'owner:1')).toThrow();
  save({...retry,state:'completed'});expect(runs()).toHaveLength(300);
 });
 it('shows a legacy 2000-character capture as incomplete until verified refetch',()=>{db().prepare('INSERT INTO mail_intake_sources VALUES (7,?,?,?,?,?)').run('gmail',42,900,'x'.repeat(2000),0);const row={id:7,account_id:'gmail',imap_uid:42} as FeedbackRow;expect(localMailSource(row).bodyTruncated).toBe(true);expect(memoryMailBody(row)).toBeNull();db().prepare('INSERT INTO mail_intake_source_capture VALUES (?,?)').run(7,'decoded-body-v2');expect(localMailSource(row).bodyTruncated).toBe(false);});

 it('excludes a second runtime and releases only the matching lease',()=>{const first=acquire()!;expect(acquire()).toBeNull();release('wrong');expect(acquire()).toBeNull();release(first);expect(acquire()).toBeTruthy();});
 it('atomically fences chat activity against model swaps and mail intake',()=>{const chat=acquireModelActivity('hermes-stream:test')!;expect(chat.mode).toBe('shared');expect(acquire()).toBeNull();expect(acquireModelActivity('profile-switch','exclusive')).toBeNull();renewModelActivity(chat);releaseModelActivity(chat.token);const intake=acquire()!;expect(modelActivities()).toMatchObject([{token:intake,mode:'exclusive',holder:'mail-intake'}]);expect(acquireModelActivity('hermes-stream:test')).toBeNull();release(intake);expect(acquireModelActivity('hermes-stream:test')).not.toBeNull();});
	 it('never treats lease expiry alone as proof that inference stopped',()=>{const token=acquire()!;db().prepare('UPDATE mail_intake_lease SET expires=0 WHERE token=?').run(token);expect(acquire()).toBeNull();release(token);});
 it('scopes standing authority to exact pending feedback and revokes on pause',()=>{const c=configure(true,'owner:1','test');save({id:'run',account:'gmail',state:'running',phase:'memory',items:[{id:7,stage:'review'}],attempts:0,started_at:new Date().toISOString()});expect(()=>assertAuthorization(c.authorization_id,'run',7,'owner:1')).not.toThrow();expect(()=>assertAuthorization(c.authorization_id,'run',8,'owner:1')).toThrow();configure(false,'owner:1','pause');expect(()=>assertAuthorization(c.authorization_id,'run',7,'owner:1')).toThrow();expect(db().prepare('SELECT count(*) AS n FROM mail_intake_events').get()).toMatchObject({n:2});});
 it('prefers full bound text and refuses truncated or mismatched evidence',()=>{db().prepare('INSERT INTO mail_intake_sources VALUES (7,?,?,?,?,?)').run('gmail',42,900,'Complete synthetic body',0);const row={id:7,account_id:'gmail',imap_uid:42} as FeedbackRow;expect(memoryMailBody(row)).toBe('Complete synthetic body');expect(memoryMailBody({...row,account_id:'yahoo'})).toBeNull();db().prepare('UPDATE mail_intake_sources SET truncated=1').run();expect(memoryMailBody(row)).toBeNull();});
});
