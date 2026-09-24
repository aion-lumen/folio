import {describe,it,expect} from 'vitest';
import {canonicalHash} from './reconciliation.js';
import {validateWealth} from './wealth.js';
function fixture(){const body={schema:'ledger/wealth-overview/v1',generated_at:'2026-09-20T12:00:00Z',status:'partial_source_bound_projection',bookkeeping:{ledger_db_touched:false,orders_possible:false,payments_changed:false},accounts:[],cashflows:[],currency_totals:[],native_cash:[],valuations:[],estimates:[],gaps:[],conversion:null};return {...body,projection_sha256:canonicalHash(body)};}
function sign(x:any){const {projection_sha256,...body}=x;return {...body,projection_sha256:canonicalHash(body)};}
describe('read-only asset view',()=>{
 it('accepts a hash-bound empty projection without inventing balances',()=>{expect(validateWealth(fixture()).currency_totals).toEqual([]);});
 it('rejects edited and unbound content',()=>{const x=fixture();x.generated_at='2026-09-21T12:00:00Z';expect(()=>validateWealth(x)).toThrow('digest');});
 it('rejects purported execution or journal changes even if hash matches',()=>{const x=fixture();x.bookkeeping.orders_possible=true;expect(()=>validateWealth(sign(x))).toThrow('effects');});
 it('rejects infinity and unknown currency',()=>{const x:any=fixture();x.currency_totals=[{currency:'CHF',total:'Infinity',cash:'0',invested:'0'}];expect(()=>validateWealth(sign(x))).toThrow();x.currency_totals[0]={currency:'CHF+EUR',total:'1',cash:'1',invested:'0'};expect(()=>validateWealth(sign(x))).toThrow();});
});
