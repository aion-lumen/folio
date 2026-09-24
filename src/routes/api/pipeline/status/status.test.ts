import {it,expect,vi} from 'vitest';
vi.mock('$lib/server/mail-intake/pipeline-status.js',()=>({pipelineSnapshot:()=>({busy:false,label:'Pipeline · Abgeschlossen',status:{private:'not exposed'}})}));
import {GET} from './+server.js';
it('protects the status endpoint',()=>{expect(()=>GET({locals:{user:{role:'council_member'}}} as any)).toThrow();});
it('returns only indicator metadata without cache',async()=>{const r=await GET({locals:{user:{role:'owner'}}} as any);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.json()).toEqual({busy:false,label:'Pipeline · Abgeschlossen'});});
