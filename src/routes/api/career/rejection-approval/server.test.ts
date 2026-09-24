import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({apply:vi.fn(),get:vi.fn(),demo:vi.fn(()=>false),capability:vi.fn()}));
vi.mock('$lib/server/env.js',()=>({isDemoVaultActive:m.demo}));
vi.mock('$lib/server/modules/http.js',()=>({requireModuleCapability:m.capability}));
vi.mock('$lib/server/career/rejection-approval.js',()=>({rejectionApprovals:()=>({apply:m.apply,get:m.get}),approvalView:(x:unknown)=>x}));
import {POST} from './+server.js';
const id='12345678-1234-4234-8234-123456789abc';
function event(body:unknown={id,action:'approve'},role='owner',origin='http://localhost') {
 return {url:new URL('http://localhost/api/career/rejection-approval'),locals:{user:{role,id:1}},request:new Request('http://localhost/api/career/rejection-approval',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})} as Parameters<typeof POST>[0];
}
beforeEach(()=>{vi.clearAllMocks();m.demo.mockReturnValue(false);m.apply.mockReturnValue({state:'applied'});m.get.mockReturnValue({state:'pending'});});
describe('explicit owner approval HTTP boundary',()=>{
 it('accepts only a server-created id and explicit approval action',async()=>{expect((await POST(event())).status).toBe(200);expect(m.apply).toHaveBeenCalledWith(id,'owner:1',[]);});
 it('refreshes a preview without applying it',async()=>{await POST(event({id,action:'preview'}));expect(m.get).toHaveBeenCalledWith(id);expect(m.apply).not.toHaveBeenCalled();});
 it.each([event({id,action:'approve',path:'/other/file'}),event({id,action:'approve',changes:[]}),event({id:'../../x',action:'approve'}),event({id,action:'execute'})])('rejects additional write instructions',async e=>{await expect(POST(e)).rejects.toMatchObject({status:400});expect(m.apply).not.toHaveBeenCalled();});
 it('rejects non-owner, foreign origin and demo before using the store',async()=>{await expect(POST(event(undefined,'council_member'))).rejects.toMatchObject({status:403});await expect(POST(event(undefined,'owner','https://foreign.example'))).rejects.toMatchObject({status:403});m.demo.mockReturnValue(true);await expect(POST(event())).rejects.toMatchObject({status:403});expect(m.apply).not.toHaveBeenCalled();});
 it('reports stale data without exposing paths or retrying writes',async()=>{m.apply.mockImplementation(()=>{throw Error('tracker_changed');});await expect(POST(event())).rejects.toMatchObject({status:409,body:{message:expect.stringContaining('erneut starten')}});expect(m.apply).toHaveBeenCalledTimes(1);});
});
