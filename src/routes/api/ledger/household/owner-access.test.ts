import {describe,it,expect,vi} from 'vitest';
const guards=vi.hoisted(()=>({read:vi.fn(()=>({entries:[]})),detail:vi.fn(()=>({documents:[]})),document:vi.fn(()=>({bytes:Buffer.from('%PDF-1.7'),filename:'Beleg.pdf'})),transfer:vi.fn(()=>({bytes:Buffer.from('synthetic,csv'),contentType:'text/csv',filename:'Wise-Transferhistorie.csv'})),capability:vi.fn()}));
const preview=vi.hoisted(()=>vi.fn(async()=>({bytes:Buffer.from([255,216,255]),pages:2})));
vi.mock('$lib/server/modules/ledger-books/household-preview.js',()=>({householdPreview:preview}));
vi.mock('$lib/server/modules/http.js',()=>({requireModuleCapability:guards.capability}));
vi.mock('$lib/server/modules/ledger-books/household.js',()=>({householdEntries:guards.read,householdExpenseHierarchy:guards.read}));
vi.mock('$lib/server/modules/ledger-books/household-evidence.js',()=>({householdEntryDetail:guards.detail,householdDocument:guards.document}));
vi.mock('$lib/server/modules/ledger-books/transfer-sources.js',()=>({transferDownload:guards.transfer}));
import {GET as transfer} from '../transfers/sources/[digest]/+server.js';
import {GET as entries} from './entries/+server.js';
import {GET as expenses} from './expenses/+server.js';
import {GET as detail} from './entries/[id]/+server.js';
import {GET as document} from './entries/[id]/documents/[kind]/[digest]/+server.js';
describe('private household endpoints',()=>{
 it('rejects a non-owner before reading any entries or originals',async()=>{for(const handler of [entries,expenses,detail,document,transfer]){await expect(async()=>handler({locals:{user:{role:'council_member'}},url:new URL('http://localhost/'),params:{}} as any)).rejects.toMatchObject({status:403});}expect(guards.read).not.toHaveBeenCalled();expect(guards.document).not.toHaveBeenCalled();expect(guards.transfer).not.toHaveBeenCalled();});
 it('sets no-store and isolates PDF originals',async()=>{const response=await document({locals:{user:{role:'owner'}},url:new URL('http://localhost/?batch=x'),params:{id:'id',kind:'statement',digest:'sha'}} as any);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-security-policy')).toContain('sandbox');expect(response.headers.get('content-disposition')).toMatch(/^inline/);expect(guards.capability).toHaveBeenCalledWith('ledger-books','batches.read');});
 it('renders only a currently verified original and denies previews after proof revocation',async()=>{const event={locals:{user:{role:'owner'}},url:new URL('http://localhost/?batch=x&preview=1&page=2'),params:{id:'id',kind:'statement',digest:'sha'}} as any;const response=await document(event);expect(response.headers.get('content-type')).toBe('image/jpeg');expect(response.headers.get('x-document-pages')).toBe('2');expect(preview).toHaveBeenCalledWith(Buffer.from('%PDF-1.7'),2);preview.mockClear();guards.document.mockImplementationOnce(()=>{throw Error('proof_revoked');});await expect(document(event)).rejects.toMatchObject({status:409});expect(preview).not.toHaveBeenCalled();});
 it('serves transfer exports as uncached downloads, never executable inline content',async()=>{const r=await transfer({locals:{user:{role:'owner'}},params:{digest:'a'.repeat(64)}} as any);expect(r.headers.get('content-disposition')).toMatch(/^attachment/);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('content-security-policy')).toContain('sandbox');});
});
