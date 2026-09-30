import { beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({rules:vi.fn(),demo:false}));
vi.mock('$lib/server/ledger-demo.js',()=>({isLedgerDemo:()=>mocks.demo}));
vi.mock('$lib/server/env.js',()=>({getVaultPath:()=>'/private/example/personal-vault'}));
vi.mock('$lib/server/regelwerk/loader.js',()=>({loadRegelwerkValidated:mocks.rules}));
import { load } from './+layout.server.js';
beforeEach(()=>{mocks.demo=false;mocks.rules.mockReset().mockReturnValue({priority_relevance:{private:'example'}});});
it.each(['guest','member',undefined])('omits owner paths and rules for %s',async role=>{
 const result=await load({locals:{user:role?{role}:undefined}} as any);
 expect(result).toEqual({vaultName:'personal-vault',vaultPath:'',regelwerk:null,ledgerDemo:false});
 expect(mocks.rules).not.toHaveBeenCalled();
});
it('retains rules and path for the owner',async()=>{
 expect(await load({locals:{user:{role:'owner'}}} as any)).toMatchObject({vaultPath:'/private/example/personal-vault',regelwerk:{priority_relevance:{private:'example'}}});
});
it('keeps the synthetic demo independent of private configuration',async()=>{
 mocks.demo=true;expect(await load({locals:{}} as any)).toEqual({vaultName:'Ledger Demo',vaultPath:'',regelwerk:null,ledgerDemo:true});expect(mocks.rules).not.toHaveBeenCalled();
});
