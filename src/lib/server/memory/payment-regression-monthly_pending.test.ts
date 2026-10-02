/** Claude-Nachreview Belegfix: Monatslogik bei deaktivierter Automatik (synthetisch). */
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync,mkdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetFolioDbForTests } from '../folio-db/init.js';
import { proposeMemoryFact } from './store.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import { paymentReviewStates } from './worklists.js';
import { monthlyReconciliationPending } from './work-state.js';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'rv-monthly-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
// setMonthlyPaymentAutomation(false) schreibt {…previous, monthly_payments:false} und behält statement_scope.
it('B7 hält Zahlungsfragen nach Deaktivierung des Monatsabgleichs nicht dauerhaft zurück',()=>{
 const fact=proposeMemoryFact({domain:'finance',data_class:'transaction',subject:'Synthetic invoice',predicate:'paid',value:'60 EUR',sensitivity:'private',source_kind:'mail',source_ref:'mail:demo:1',actor_kind:'system',actor_id:'test'});
 const e:any={candidate:{memory_binding:{fact_id:fact.fact_id,fact_sha256:canonicalHash(fact)},normalized_invoice:{due_date:'2026-09-15'},match_request:{account_refs:['A']}},result:{status:'not_found_with_complete_coverage',coverage:{complete_for_target:true}},batch:{sources:[{account_ref:'A',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}}]},stale:false};
 mkdirSync(join(dir,'memory-work'));writeFileSync(join(dir,'memory-work','config.json'),JSON.stringify({enabled:true,statement_scope:'configured',monthly_payments:false}));
 expect(monthlyReconciliationPending()).toBe(false);
 expect(paymentReviewStates([e])[0].state).toBe('decision');
});

it('continues to hold questions while the enabled monthly workflow is paused',()=>{
 mkdirSync(join(dir,'memory-work'));writeFileSync(join(dir,'memory-work','config.json'),JSON.stringify({enabled:false,statement_scope:'configured',monthly_payments:true}));
 expect(monthlyReconciliationPending()).toBe(true);
});
