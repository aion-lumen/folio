import { describe, expect, it } from 'vitest';
import { sha256 } from '../../file-intake/document-security.js';
import { canonicalHash, validateReconciliation, statementMonthInventory, type Result } from './reconciliation.js';
const target='participant_payment_to_provider';
const bytes = Buffer.from(JSON.stringify({ case: { subject_ref: 'synthetic:1', subject_ref_version: 'v1', identity_rule_version: 'test-v1', identity_sha256: 'a'.repeat(64) },match_request:{target} }));
function seal(r:Result) { r.result_id='recon_'+canonicalHash(Object.fromEntries(Object.entries(r).filter(([k])=>!['generated_at','result_id'].includes(k)))).slice(0,24);return r; }
function fixture():Result { return seal({result_id:'', reconciliation_target:target,coverage:{complete_for_target:true,gaps:[],evidence:[{ref:'test',sha256:'c'.repeat(64)}],required_window:{from:'2026-09-01',to:'2026-09-30'}},schema:'ledger/reconciliation-result/v0',subject_ref:'synthetic:1',subject_ref_version:'v1',identity_rule_version:'test-v1',identity_sha256:'a'.repeat(64),candidate:{sha256:sha256(bytes),hash_method:'raw-bytes'},input:{statement_batch_sha256:'b'.repeat(64)},status:'matched',rule:{id:'claim-transaction-match',version:'v2'},system_confirmation:{confirmed:true,is_user_confirmation:false,claim:target},matches:[{observation_id:'obs_test',evidence:[{ref:'synthetic-source:1',sha256:'c'.repeat(64)}]}],exceptions:[],generated_at:'2026-09-17T12:00:00Z',policy:{local_only:true,may_execute:false,observations_are_not_bookings:true}}); }
describe('Ledger projection guards',()=>{
 it('includes July beyond the first twelve sources without claiming complete coverage',()=>{
  const entries=[...Array.from({length:12},()=>({booking_date:'2026-08-01'})),{booking_date:'2026-07-31'}];
  expect(statementMonthInventory(entries)).toBe('Monate mit erfassten Buchungen (gesamter Bestand): 2026-07, 2026-08.');
 });
 it('accepts an evidenced exact candidate and current statement revision',()=>expect(validateReconciliation(fixture(),bytes,'b'.repeat(64))).toBe(true));
 it('revokes changed candidate or statement revision',()=>{expect(validateReconciliation(fixture(),Buffer.from(bytes.toString().replace('synthetic:1','synthetic:2')),'b'.repeat(64))).toBe(false);expect(validateReconciliation(fixture(),bytes,'d'.repeat(64))).toBe(false);});
 it.each(['no-evidence','human','unknown-positive','gap','wrong-claim','exception','duplicate'])('refuses %s even with a recomputed result hash',(kind)=>{const r=fixture();if(kind==='no-evidence')r.matches=[];if(kind==='human')r.system_confirmation.is_user_confirmation=true;if(kind==='unknown-positive')r.status='unknown_due_to_missing_coverage';if(kind==='gap')r.coverage.gaps=['missing'];if(kind==='wrong-claim')r.system_confirmation.claim='refund';if(kind==='exception')r.exceptions=['reversal'];if(kind==='duplicate')r.matches.push(r.matches[0]);expect(validateReconciliation(seal(r),bytes,'b'.repeat(64))).toBe(false);});
 it('rejects tampering with a saved result',()=>{const r=fixture();r.generated_at='2026-09-18T00:00:00Z';expect(validateReconciliation(r,bytes,'b'.repeat(64))).toBe(true);r.coverage.required_window!.to='2027-01-01';expect(validateReconciliation(r,bytes,'b'.repeat(64))).toBe(false);});
});
