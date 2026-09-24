import {it,expect} from 'vitest';
import {prepareIntakeRetry} from './retry.js';
import type {IntakeRun} from './state.js';
const failed:IntakeRun={id:'r',account:'yahoo',history:true,state:'failed',phase:'validate',worker_id:'fetch',validator_id:'finished-but-incomplete',items:[{id:7,stage:'extract'},{id:8,stage:'done',outcome:'already_present'}],attempts:3,error:'incomplete_model_opinions',started_at:'2026-09-17'};
it('can preserve the accumulated attempt count after a specific technical correction',()=>{
 const next=prepareIntakeRetry(failed,true);
 expect(next.attempts).toBe(3);expect(next.state).toBe('pending');
 expect(next.validator_id).toBeUndefined();expect(next.items).toEqual(failed.items);
});
it('replays validation for the same imported mails when votes are missing',()=>{
 const next=prepareIntakeRetry(failed);
 expect(next.validator_id).toBeUndefined();expect(next.worker_id).toBe('fetch');expect(next.items).toEqual(failed.items);
 expect(next.state).toBe('pending');expect(next.attempts).toBe(0);expect(failed.validator_id).toBe('finished-but-incomplete');
});
it('keeps completed validation when retrying only Memory extraction',()=>{
 const next=prepareIntakeRetry({...failed,phase:'memory',error:'extraction_unavailable'});
 expect(next.validator_id).toBe(failed.validator_id);expect(next.phase).toBe('memory');
});
it('does not reset live or completed work',()=>{
 for(const state of ['running','completed','pending'] as const)expect(()=>prepareIntakeRetry({...failed,state})).toThrow('no_failed_run');
});
