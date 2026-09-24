import {it,expect,vi,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {compileProjectContext,projects,stageProjectContext,type ProjectContext} from './project-context.js';
const dirs:string[]=[];function fixture(){const root=mkdtempSync(join(tmpdir(),'project-packet-'));dirs.push(root);return root;}
afterEach(async()=>{const {resetFolioDbForTests}=await import('../folio-db/init.js');resetFolioDbForTests();vi.unstubAllEnvs();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
it('uses only listed project sources, bounds excerpts and records evidence hashes',()=>{
 const root=fixture();writeFileSync(join(root,'README.md'),'a'.repeat(8000));writeFileSync(join(root,'private.md'),'DO NOT INCLUDE');
 const p=compileProjectContext({id:'game',label:'Game',root,target_id:'game-session',files:['README.md']},'Review game');
 expect(p.sources).toHaveLength(1);expect(p.sources[0].excerpt).toHaveLength(6000);expect(p.sources[0].truncated).toBe(true);expect(p.sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(p)).not.toContain('DO NOT INCLUDE');
});
it('rejects symbolic links escaping the configured project root',()=>{const root=fixture(),outside=fixture();writeFileSync(join(outside,'secret.md'),'secret');symlinkSync(join(outside,'secret.md'),join(root,'README.md'));expect(()=>compileProjectContext({id:'game',label:'Game',root,target_id:'game-session',files:['README.md']},'Review')).toThrow('außerhalb');});
it('rejects traversal in the local project registry',()=>{const root=fixture(),path=join(root,'config.json');writeFileSync(path,JSON.stringify({schema:'folio/project-context/v1',projects:[{id:'game',label:'Game',root,target_id:'game-session',files:['../outside.md']}]}));vi.stubEnv('FOLIO_PROJECT_CONTEXT_PATH',path);expect(()=>projects()).toThrow();});
it('disables real project sources in demo mode',()=>{const root=fixture();vi.stubEnv('FOLIO_VAULT_OVERRIDE',join(root,'demo-vault'));expect(projects()).toEqual([]);expect(()=>compileProjectContext({} as ProjectContext,'x')).toThrow('Demo');});

it('stages a bounded packet without exporting it and preserves the approval gate',async()=>{
 const root=fixture();writeFileSync(join(root,'README.md'),'Project evidence');
 const project={id:'game',label:'Game',root,target_id:'game-session',files:['README.md']};
 writeFileSync(join(root,'projects.json'),JSON.stringify({schema:'folio/project-context/v1',projects:[project]}));
 const target={id:'game-session',label:'Game',domain:'game',adapter:'filesystem',locality:'cloud',capabilities:['analyze'],allowed_data_classes:['project_context'],retention_days:14};
 writeFileSync(join(root,'targets.json'),JSON.stringify({schema:'folio/session-targets/v1',targets:[target]}));
 vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));vi.stubEnv('FOLIO_SESSION_EXCHANGE_PATH',join(root,'exchange'));vi.stubEnv('FOLIO_SESSION_BRIDGE_PATH',join(root,'bridge'));vi.stubEnv('FOLIO_PROJECT_CONTEXT_PATH',join(root,'projects.json'));vi.stubEnv('FOLIO_SESSION_TARGETS_PATH',join(root,'targets.json'));
 const packet=stageProjectContext('game','Review next step');expect(packet.status).toBe('staged');
 const relay=await import('./store.js');expect(relay.getRelayPayloadForReview(packet.case_id).body).toContain('Project evidence');expect(()=>relay.shareRelayCase(packet.case_id,target as never)).toThrow('requires case approval');
 target.allowed_data_classes=[];writeFileSync(join(root,'targets.json'),JSON.stringify({schema:'folio/session-targets/v1',targets:[{...target,allowed_data_classes:['mail_body']}]}));expect(()=>stageProjectContext('game','Review')).toThrow('nicht freigegeben');
});
