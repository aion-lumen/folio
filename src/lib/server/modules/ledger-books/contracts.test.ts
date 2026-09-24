import {beforeEach,describe,it,expect,vi} from 'vitest';
const source=vi.hoisted(()=>({raw:'',entry:{entry_id:'txn_'+'a'.repeat(24),booking_date:'2026-09-01',amount:'-10.00',currency:'CHF'},mail:{id:17,mail_date:'2026-09-01',subject:'Invoice',sender:'billing@example.test'},body:'Ten francs',batch:'b'.repeat(64),available:true}));
vi.mock('node:fs',()=>({existsSync:()=>source.available}));
vi.mock('../../file-intake/document-security.js',()=>({documentBytes:()=>Buffer.from(source.raw)}));
vi.mock('../../env.js',()=>({getSessionExchangePath:()=>'/private-fixture'}));
vi.mock('../../feedback/reader.js',()=>({getFeedbackRowById:()=>source.mail}));
vi.mock('../../mail-intake/source.js',()=>({localMailSource:()=>({bodyText:source.body})}));
vi.mock('./household.js',()=>({readHouseholdContext:()=>({batch:{batch_sha256:source.batch,entries:[source.entry]}})}));
vi.mock('./contract-mail-sync.js',()=>({readContractUpdates:(inventory:unknown)=>({inventory,sync:null})}));
import {contractDigest,readContractInventory,validateContractInventory} from './contracts.js';
function fixture(){return {schema:'folio/contracts-inventory/v1',as_of:'2026-09-24',batch_sha256:'b'.repeat(64),coverage:{mail_rows:1,mail_with_text:1,bank_entries:1,bank_through:'2026-08-31',accounts:['test'],limitations:[]},items:[{id:'service',label:'Service',group:'KI & Software',status:'observed',priority:'normal',cost:'10 CHF',summary:'Paid',next_step:'Review',unknowns:[],timing:null,evidence:[{kind:'bank',id:source.entry.entry_id,sha256:contractDigest(source.entry),label:'Payment',date:'2026-09-01',note:'Posted'}, {kind:'mail',id:'17',sha256:contractDigest([17,'2026-09-01','Invoice','billing@example.test','Ten francs']),label:'Invoice',date:'2026-09-01',note:'Receipt'}]}]};}
beforeEach(()=>{source.available=true;source.body='Ten francs';source.entry.amount='-10.00';source.batch='b'.repeat(64);source.raw=JSON.stringify(fixture());});
describe('private contract inventory evidence boundaries',()=>{
 it('opens the exact mail and validates the actual original bank entry',()=>{const out=readContractInventory();expect(out.stale).toBe(false);expect(out.inventory!.items[0].evidence.map(e=>e.valid)).toEqual([true,true]);expect(out.inventory!.items[0].evidence[1].href).toBe('/mail-queue?feedback=17');});
 it('marks changed source text and changed amounts unavailable instead of silently keeping evidence verified',()=>{source.body='Different amount';source.entry.amount='-100.00';const out=readContractInventory();expect(out.stale).toBe(true);expect(out.inventory!.items[0].evidence.every(e=>!e.valid)).toBe(true);});
 it('shows a dated inventory as stale when the statement batch changes',()=>{source.batch='c'.repeat(64);expect(readContractInventory().stale).toBe(true);});
 it('has no private fallback if inventory is missing or corrupt',()=>{source.available=false;expect(readContractInventory().inventory).toBeNull();source.available=true;source.raw='bad';expect(readContractInventory().error).toBeTruthy();});
 it('rejects unsafe identifiers, executable links, impossible dates and duplicate contracts',()=>{for(const mutate of [(f:any)=>f.items[0].evidence[0].id='../secret',(f:any)=>f.items[0].help={label:'Help',url:'javascript:alert(1)'},(f:any)=>f.items[0].help={label:'Help',url:'https://user:secret@example.test'},(f:any)=>f.as_of='2026-02-31',(f:any)=>f.items.push({...f.items[0]})]){const f=fixture();mutate(f);expect(()=>validateContractInventory(f)).toThrow();}});
});
