import {describe,it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn(()=>({overview:null,stale:false,error:'empty'})));
vi.mock('$lib/server/modules/ledger-books/wealth.js',()=>({readWealthOverview:read}));
vi.mock('$lib/server/modules/http.js',()=>({requireModuleCapability:vi.fn()}));
import {load} from './+page.server.js';
describe('wealth route privacy',()=>{
 it('rejects non-owner before reading financial data',()=>{read.mockClear();expect(()=>load({locals:{user:{role:'council_member'}},setHeaders:vi.fn()} as any)).toThrow();expect(read).not.toHaveBeenCalled();});
 it('prevents caching owner financial data',()=>{const headers=vi.fn();load({locals:{user:{role:'owner'}},setHeaders:headers} as any);expect(headers).toHaveBeenCalledWith({'cache-control':'private, no-store'});});
});
