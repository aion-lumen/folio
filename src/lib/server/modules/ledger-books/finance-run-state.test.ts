import {describe,it,expect,vi,afterEach} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
vi.mock('../../env.js',()=>({getFolioDbPath:()=>process.env.FOLIO_DB_PATH!}));
import {financeRunRoot,financePaused,requestFinancePause,saveFinanceRun,readFinanceRun,refreshedFinanceRun,type FinanceRun} from './finance-run-state.js';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
function setup(){const dir=mkdtempSync(join(tmpdir(),'finance-run-test-'));dirs.push(dir);vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));return dir;}
describe('persistent finance checkpoints',()=>{
 it('refreshes a completed snapshot as a new run without rewriting the original',()=>{
  const previous={schema:'folio/finance-run/v1',id:'old',status:'completed',phase:'finished',pid:1,started_at:'yesterday',updated_at:'',ended_at:'then',message:'',statements:[],payment_attempted:['f'],payment_runs:['p'],reviewed_links:['r'],counts:{links_reviewed:1},batch_sha256:'bank'} as FinanceRun;
  const next=refreshedFinanceRun(previous,'bank','new','today',2);
  expect(next).toMatchObject({id:'new',previous_run_id:'old',started_at:'today',phase:'discovery',status:'running',payment_attempted:['f']});
  expect(next.ended_at).toBeUndefined();expect(previous.status).toBe('completed');expect(previous.id).toBe('old');
  expect(()=>refreshedFinanceRun(previous,'changed','new','today',2)).toThrow('statement_batch_changed');
 });
 it('preserves the run identity across limited review slices and refuses unfinished statements',()=>{
  const previous={schema:'folio/finance-run/v1',id:'same',status:'paused',phase:'link_review',pid:1,started_at:'before',updated_at:'',message:'',statements:[],payment_attempted:[],payment_runs:[],reviewed_links:[],counts:{},batch_sha256:'bank'} as FinanceRun;
  expect(refreshedFinanceRun(previous,'bank','unused','after',2)).toMatchObject({id:'same',started_at:'before',phase:'discovery'});
  expect(()=>refreshedFinanceRun({...previous,statements:[{status:'blocked'} as any]},'bank','n','now',2)).toThrow('statement_review_incomplete');
 });
 it('preserves the original start and completed items on restart checkpoints',()=>{setup();const s:FinanceRun={schema:'folio/finance-run/v1',id:'test',status:'running',phase:'link_review',pid:123,started_at:'2026-09-18T08:00:00Z',updated_at:'',message:'',statements:[],payment_attempted:['first'],payment_runs:['r1'],reviewed_links:['a'],counts:{links_reviewed:1}};saveFinanceRun(s);const next=readFinanceRun()!;next.pid=456;next.reviewed_links.push('b');saveFinanceRun(next);expect(readFinanceRun()?.started_at).toBe(s.started_at);expect(readFinanceRun()?.reviewed_links).toEqual(['a','b']);expect(readFinanceRun()?.payment_attempted).toEqual(['first']);});
 it('pauses without discarding the checkpoint',()=>{setup();expect(financePaused()).toBe(false);requestFinancePause(true);expect(financePaused()).toBe(true);requestFinancePause(false);expect(financePaused()).toBe(false);});
 it('rejects damaged or incompatible state rather than using it',()=>{setup();requestFinancePause(false);writeFileSync(join(financeRunRoot(),'current.json'),'{broken');expect(readFinanceRun()).toBeNull();});
});
