import {it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn(()=>({inventory:null,stale:false,error:null})));
vi.mock('$lib/server/modules/ledger-books/contracts.js',()=>({readContractInventory:read}));
vi.mock('$lib/server/modules/http.js',()=>({requireModuleCapability:vi.fn()}));
import {load} from './+page.server.js';
it('rejects non-owner before reading private contracts',()=>{read.mockClear();expect(()=>load({locals:{user:{role:'council_member'}},setHeaders:vi.fn()} as any)).toThrow();expect(read).not.toHaveBeenCalled();});
it('prevents caching the owner inventory',()=>{const headers=vi.fn();load({locals:{user:{role:'owner'}},setHeaders:headers} as any);expect(headers).toHaveBeenCalledWith({'cache-control':'private, no-store'});});
