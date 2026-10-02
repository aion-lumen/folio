import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({job:null as any,preview:vi.fn(),reconcile:vi.fn(),maintain:vi.fn()}));
vi.mock('../../file-intake/document-security.js',()=>({
 atomicPrivateJson:(_p:string,value:unknown)=>{m.job=structuredClone(value);},
 documentBytes:()=>{if(!m.job)throw Error('missing');return Buffer.from(JSON.stringify(m.job));}
}));
vi.mock('../../file-intake/signature-maintenance.js',()=>({maintainDocumentSignatures:m.maintain}));
vi.mock('./manual-import.js',()=>({manualImportRoot:()=>'/synthetic',
 readManualStatementImport:()=>({files:[{id:'file',sha256:'hash',accounts:[{ref:'account',profiles:['format']}]}]}),
 previewManualStatement:m.preview,reconcileStatementPayments:m.reconcile
}));
import { queueStatementJob,tickStatementJob,statementJob } from './statement-jobs.js';
beforeEach(()=>{vi.useFakeTimers();m.job=null;m.preview.mockResolvedValue({status:'staged_unbooked'});m.maintain.mockResolvedValue(true);m.reconcile.mockResolvedValue({});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.clearAllMocks();});
it('returns a queued job, completes it in the background, and never repeats a completed import',async()=>{
 expect(queueStatementJob('file','hash','account','format').status).toBe('queued');
 expect(m.preview).not.toHaveBeenCalled();await tickStatementJob();await tickStatementJob();
 expect(statementJob()?.status).toBe('completed');expect(m.preview).toHaveBeenCalledExactlyOnceWith('file','hash','account','format',true);expect(m.reconcile).toHaveBeenCalledOnce();
});
it('rejects changed files/accounts and simultaneous owner requests',()=>{
 expect(()=>queueStatementJob('file','changed','account','format')).toThrow('statement_selection_changed');
 expect(()=>queueStatementJob('file','hash','other','format')).toThrow('statement_selection_changed');
 queueStatementJob('file','hash','account','format');expect(()=>queueStatementJob('file','hash','account','format')).toThrow('statement_job_busy');
});
it('resumes an interrupted job but leaves an active job in another process alone',async()=>{
 queueStatementJob('file','hash','account','format');m.job.pid=999999;m.job.status='running';
 const kill=vi.spyOn(process,'kill').mockImplementation(()=>true);
 await tickStatementJob();expect(m.preview).not.toHaveBeenCalled();
 kill.mockImplementation(()=>{throw Error('ESRCH');});await tickStatementJob();
 expect(statementJob()?.status).toBe('completed');expect(m.preview).toHaveBeenCalledOnce();
});
it('retains a failed security check without starting reconciliation',async()=>{
 m.preview.mockResolvedValue({status:'blocked',reason_code:'malware_detected'});
 queueStatementJob('file','hash','account','format');await tickStatementJob();
 expect(statementJob()).toMatchObject({status:'failed',message:'malware_detected'});expect(m.reconcile).not.toHaveBeenCalled();
});
