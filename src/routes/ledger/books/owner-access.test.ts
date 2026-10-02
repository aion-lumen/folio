import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock('$lib/server/modules/ledger-books/statement-jobs.js',()=>({queueStatementJob:m.write,statementJob:m.read}));
vi.mock('$lib/server/memory/work-runtime.js',()=>({memoryWorkStatus:m.read,monthlyPaymentAutomation:m.read,setMonthlyPaymentAutomation:m.write,retryMonthlyWork:m.write}));
vi.mock('$lib/server/memory/payment-confirmation.js',()=>({listPaymentConfirmedMemory:m.read}));
vi.mock('$lib/server/modules/ledger-books/finance-run-state.js',()=>({financeRunView:m.read,requestFinancePause:m.write}));
vi.mock('$lib/server/modules/http.js',()=>({requireModuleCapability:vi.fn()}));
vi.mock('$lib/server/modules/ledger-books/observations.js',()=>({getFinanceObservationExchangeStatus:m.read,writeFinanceObservationExchange:m.write}));
vi.mock('$lib/server/modules/ledger-books/intake.js',()=>({readFinanceIntakeStatus:m.read}));
vi.mock('$lib/server/modules/ledger-books/store.js',()=>({readBooksReviewBatch:m.read}));
vi.mock('$lib/server/modules/ledger-books/manual-import.js',()=>({readManualStatementImport:m.read}));
import {load,actions} from './+page.server.js';
it('rejects a guest before reading any private payment or statement data',async()=>{
 await expect(load({locals:{user:{role:'council_member'}}} as any)).rejects.toMatchObject({status:403});
 expect(m.read).not.toHaveBeenCalled();
});
it('rejects guest actions before reading form data or changing monthly policy',async()=>{
 const formData=vi.fn();const event={locals:{user:{role:'council_member'}},request:{formData,headers:new Headers()},url:new URL('http://127.0.0.1:4173/ledger/books')};
 for(const action of Object.values(actions)){const result=await action!(event as any);expect(result).toMatchObject({status:403});}
 expect(formData).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
it('requires same-origin owner authorization to enable monthly reconciliation',async()=>{
 const formData=vi.fn();const result=await actions.monthlyAutomation!({locals:{user:{role:'owner'}},request:{formData,headers:new Headers({origin:'https://unrelated.example'})},url:new URL('http://127.0.0.1:4173/ledger/books')} as any);
 expect(result).toMatchObject({status:403});expect(formData).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});

it('requires the same origin for retrying imports and the monthly run',async()=>{
 const result=await actions.retryMonthly!({locals:{user:{role:'owner'}},request:{headers:new Headers({origin:'https://unrelated.example'})},url:new URL('http://127.0.0.1:4173/ledger/books')} as any);
 expect(result).toMatchObject({status:403});expect(m.write).not.toHaveBeenCalled();
});
