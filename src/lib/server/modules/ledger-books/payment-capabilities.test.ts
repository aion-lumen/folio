import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const m=vi.hoisted(()=>({root:'',process:vi.fn()}));
vi.mock('./manual-import.js',()=>({statementImportConfig:()=>({python_bin:'/synthetic/python',ledger_root:'/synthetic/ledger'}),manualImportRoot:()=>m.root,withStatementLock:vi.fn()}));
vi.mock('./payment-sources.js',()=>({paymentWorkRoot:()=>m.root}));
vi.mock('../../file-intake/document-security.js',async original=>({...await original<typeof import('../../file-intake/document-security.js')>(),isolatedProcess:m.process}));
import {requireReconciliationCapabilities} from './payment-agent.js';
beforeEach(()=>{m.root=mkdtempSync(join(tmpdir(),'ledger-capabilities-'));});
afterEach(()=>{rmSync(m.root,{recursive:true,force:true});vi.clearAllMocks();});
it.each([
 {code:2,stdout:''},
 {code:0,stdout:'{}'},
 {code:0,stdout:JSON.stringify({schema:'ledger/reconciliation-capabilities/v1',rule:'claim-transaction-match/v5',profiles:['source-payment/v2'],required_reference:true})},
 {code:0,stdout:JSON.stringify({schema:'ledger/reconciliation-capabilities/v1',rule:'claim-transaction-match/v4',profiles:['source-payment/v2'],required_reference:true})}
])('rejects an old or incompatible adapter before any case processing',async result=>{
 m.process.mockResolvedValue(result);await expect(requireReconciliationCapabilities()).rejects.toThrow('ledger_companion_update_required');
});
it('accepts the bounded compatible adapter via its isolated CLI',async()=>{
 m.process.mockResolvedValue({code:0,stdout:JSON.stringify({schema:'ledger/reconciliation-capabilities/v1',rule:'claim-transaction-match/v5',profiles:['source-payment/v2'],required_reference:true,outgoing_transfers:true})});
 await expect(requireReconciliationCapabilities()).resolves.toBeUndefined();expect(m.process.mock.calls[0][1]).toEqual(['-I','/synthetic/ledger/scripts/reconcile_finance_case.py','--capabilities']);
});
