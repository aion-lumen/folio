import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const m=vi.hoisted(()=>({prepare:vi.fn()}));
vi.mock('./runner.js',()=>({MAIL_INTAKE_CONTEXT_LENGTH:16384,MAIL_REVIEW_CONTEXT_LENGTH:32768,prepareIntakeModel:m.prepare}));
vi.mock('../worker-runner/manager.js',()=>({isBusy:()=>false}));
vi.mock('../regelwerk/loader.js',()=>({loadRegelwerk:()=>({voice_consensus:{voices:[{role:'primary_llm',lm_studio_model:'primary'},{role:'conditional_reviewer',lm_studio_model:'reviewer'}]}})}));
import {resetFolioDbForTests} from '../folio-db/init.js';import {locked} from './state.js';import {withMailModel} from './model-session.js';
let dir='';beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'folio-manual-model-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));m.prepare.mockReset();m.prepare.mockResolvedValue(undefined);});afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();vi.unstubAllGlobals();rmSync(dir,{recursive:true,force:true});});
it('loads an unloaded primary before extraction and releases the shared lease',async()=>{await withMailModel('primary_llm',async()=>{expect(m.prepare).toHaveBeenCalledWith('primary',16384,expect.any(String));expect(locked()).toBe(true);});expect(locked()).toBe(false);});
it('loads the reviewer with larger context, restores primary and frees the lease',async()=>{await expect(withMailModel('conditional_reviewer',async()=>{throw Error('bad evidence response');})).rejects.toThrow('bad evidence');expect(m.prepare.mock.calls).toEqual([['reviewer',32768,expect.any(String)],['primary',16384,expect.any(String)]]);expect(locked()).toBe(false);});
it('never extracts after model load failure',async()=>{m.prepare.mockRejectedValue(Error());const work=vi.fn();await expect(withMailModel('primary_llm',work)).rejects.toThrow('geladen');expect(work).not.toHaveBeenCalled();expect(locked()).toBe(false);});

it('reuses the exact loaded voice model only when its context is sufficient',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({models:[{key:'voice',loaded_instances:[{config:{context_length:16384}}]}]}))));await withMailModel('primary_llm',async()=>{expect(locked()).toBe(true);expect(m.prepare).not.toHaveBeenCalled();},'voice');expect(locked()).toBe(false);});
it('reloads an exact voice model whose context is too small',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({models:[{key:'voice',loaded_instances:[{config:{context_length:8192}}]}]}))));await withMailModel('primary_llm',async()=>{} ,'voice');expect(m.prepare).toHaveBeenCalledWith('voice',16384,expect.any(String));});
