import {randomUUID} from 'node:crypto';
import {closeSync,existsSync,openSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {getFolioDb} from '../../folio-db/init.js';
import {getFeedbackRowById} from '../../feedback/reader.js';
import {attachmentEvidence} from '../../mail-intake/attachments.js';
import {atomicPrivateJson,documentBytes,privateDirectory,sha256} from '../../file-intake/document-security.js';
import {acquire,release,renew} from '../../mail-intake/state.js';
import {prepareIntakeModel} from '../../mail-intake/runner.js';
import {readHermesExecutionProfile} from '../../hermes/execution-profile.js';
import {readHermesContextManifest} from '../../hermes/context-manifest.js';
import {areModulesDisabled,getDisabledModuleIds,isDemoVaultActive} from '../../env.js';
import {mayUseLocalFinanceContext} from './intake.js';
import {manualImportRoot,previewManualStatement,readManualStatementImport,reconcileStatementPayments} from './manual-import.js';
import {canonicalHash} from './reconciliation.js';
import {runPaymentAgent} from './payment-agent.js';
import {clearedInvoiceText,paymentWorkRoot,preparedPayments} from './payment-sources.js';
import {appendInvoiceEvidence,evidenceReviewInput,invoiceSourceMatches,reusableAdvisoryReview} from './finance-evidence.js';
import {reviewEvidenceLinks} from './payment-review.js';
import {coverageGaps,discoverLinks,type BankEvidence,type MailEvidence,type EvidenceLink} from './finance-discovery.js';
import {financePaused,financeRunRoot,readFinanceRun,saveFinanceRun,refreshedFinanceRun,type FinanceRun} from './finance-run-state.js';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const code=(e:unknown)=>e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'local_processing_failed';
function bankBatch(){const b=JSON.parse(documentBytes(join(manualImportRoot(),'statement-batch.json'),64 * 1024 * 1024).toString());if(b.schema!=='ledger/manual-statement-batch/v0'||b.bookkeeping?.ledger_db_touched!==false||b.batch_sha256!==canonicalHash({sources:b.sources,entries:b.entries,issues:b.issues}))throw Error('invalid_statement_batch');return b;}
function persist(s:FinanceRun,message:string){s.message=message;saveFinanceRun(s);console.log(JSON.stringify({at:s.updated_at,phase:s.phase,message,counts:s.counts}));}
async function pausePoint(s:FinanceRun){while(financePaused()){s.status='paused';persist(s,'Pausiert; bereits geprüfte Arbeit bleibt erhalten.');await delay(15000);}s.status='running';}
export function claimFinanceWorker(){
 const root=financeRunRoot();privateDirectory(root);const path=join(root,'worker.lock');
 if(existsSync(path)){
  const previous=JSON.parse(documentBytes(path,4096).toString());
  if(!Number.isInteger(previous.pid)||previous.pid<1)throw Error('invalid_finance_worker_lock');
  try{process.kill(previous.pid,0);throw Error('finance_worker_already_running');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
  // Only a proven dead process permits restart, never an expired heartbeat.
  rmSync(path);
 }
 const fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid}));closeSync(fd);
 return ()=>{const owner=JSON.parse(readFileSync(path,'utf8'));if(owner.pid===process.pid)rmSync(path);};
}
async function localCorpus(s:FinanceRun):Promise<MailEvidence[]>{
 const db=getFolioDb();
 const rows=db.prepare('SELECT feedback_id,account,uid,body,truncated FROM mail_intake_sources ORDER BY feedback_id').all() as {feedback_id:number;account:string;uid:number;body:string;truncated:number}[];
 const mails:MailEvidence[]=[];let missing=0;
 for(const row of rows){const m=getFeedbackRowById(row.feedback_id);if(!m){missing++;continue;}const date=m.mail_date??'';
  mails.push({id:row.feedback_id,ref:`mail:${row.account}:${row.uid}`,date,subject:m.subject,sender:m.sender,body:row.body,truncated:!!row.truncated,sha256:canonicalHash([row,m.subject,m.sender,date])});
 }
 s.counts.local_mail_sources=rows.length;s.counts.mail_metadata_missing=missing;
 // Consume only exact source-bound, security- and extraction-verified evidence.
 // EML and IMAP use the same binding; old registry rows remain visibly unlinked.
 const originalBodyHashes=new Map(mails.map(m=>[m.id,sha256(m.body)])),seen=new Set<string>();
 let cleared=0,blocked=0,unlinked=0;
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_attachment_bindings'").get()){
  const bound=db.prepare('SELECT DISTINCT feedback_id FROM mail_attachment_bindings').all() as {feedback_id:number}[];
  for(const binding of bound){
   await pausePoint(s);const m=mails.find(x=>x.id===binding.feedback_id);if(!m){unlinked++;continue;}
   try{for(const a of attachmentEvidence(m.id))if(appendInvoiceEvidence(m,a.sha256,a.text,seen))cleared++;}catch{blocked++;}
  }
  unlinked+=Number((db.prepare("SELECT count(*) n FROM mail_attachment_parts p WHERE detected_mime='application/pdf' AND NOT EXISTS (SELECT 1 FROM mail_attachment_bindings b WHERE b.source_key=p.source_key)").get() as {n:number}).n);
 }
 // Invoice PDFs fetched by the native payment adapter already have full
 // original/scan/extraction/body bindings. Reuse that verified local evidence.
 const caches:{source:any;proof:any}[]=preparedPayments().map(p=>({source:p.candidate.memory_binding?.source,proof:p.candidate.invoice_document}));
 const cacheRoot=join(paymentWorkRoot(),'sources');
 if(existsSync(cacheRoot))for(const name of readdirSync(cacheRoot).filter(n=>n.endsWith('.json')).sort()){
  try{const c=JSON.parse(documentBytes(join(cacheRoot,name),16384).toString());if(c.schema==='folio/payment-source-cache/v1')caches.push(c);}catch{blocked++;}
 }
 for(const c of caches){
  const m=mails.find(m=>m.id===c.source?.feedback_id);
  if(!m||!invoiceSourceMatches(c.source,m,originalBodyHashes.get(m.id)!)){unlinked++;continue;}
  try{const text=clearedInvoiceText(c.proof);if(appendInvoiceEvidence(m,c.proof.original_sha256,text,seen))cleared++;}catch{blocked++;}
 }
 s.counts.attachments_cleared=cleared;s.counts.attachments_blocked=blocked;s.counts.attachments_unlinked=unlinked;
 // Snapshot is an evidence corpus, never an instruction or public handoff.
 atomicPrivateJson(join(financeRunRoot(),'corpus.json'),mails);s.corpus_sha256=canonicalHash(mails);
 return mails;
}
export async function runFinanceBatch(resume=false,options:{refresh?:boolean;maxLinks?:number}={}){
 if(options.maxLinks!==undefined&&(!Number.isInteger(options.maxLinks)||options.maxLinks<1||options.maxLinks>120))throw Error('invalid_finance_link_budget');
 const [profile,manifest]=await Promise.all([readHermesExecutionProfile(),readHermesContextManifest()]);
 if(areModulesDisabled()||getDisabledModuleIds().has('ledger-books')||!mayUseLocalFinanceContext(manifest.sources.financeObservations,isDemoVaultActive(),profile))throw Error('finance_run_local_finance_gate');
 const unlock=claimFinanceWorker();let s:FinanceRun|null=null;
 try{
  if(options.refresh){
   const previous=readFinanceRun();if(!previous)throw Error('no_finance_run_to_refresh');
   // claimFinanceWorker has already proved that no other worker owns the lock.
   s=refreshedFinanceRun(previous,bankBatch().batch_sha256,randomUUID(),new Date().toISOString(),process.pid);
  }
  else if(resume){s=readFinanceRun();if(!s||s.status==='completed')throw Error('no_resumable_finance_run');s.pid=process.pid;s.status='running';delete s.error;}
  else {
   const old=readFinanceRun();if(old&&old.status!=='completed')throw Error('finance_run_requires_resume');
   const inventory=readManualStatementImport();if(!inventory.configured||inventory.error||!inventory.scanner.ready||inventory.warnings.length)throw Error('finance_preflight_not_ready');
   const unique=[...new Map(inventory.files.map(f=>[f.sha256,f])).values()];
   if(unique.some(f=>f.accounts.length!==1||f.accounts[0].profiles.length!==1))throw Error('statement_assignment_ambiguous');
   const b=existsSync(join(manualImportRoot(),'statement-batch.json'))?bankBatch():null;
   s={schema:'folio/finance-run/v1',id:randomUUID(),status:'running',phase:'statements',pid:process.pid,started_at:new Date().toISOString(),updated_at:'',message:'',statements:unique.map(file=>({file,status:b?.sources.some((x:any)=>x.source_sha256===file.sha256&&x.account_ref===file.accounts[0].ref)?'duplicate':'pending'})),payment_attempted:[],payment_runs:[],reviewed_links:[],counts:{statement_total:unique.length}};
  }
  persist(s,'Kontrollierter Lauf gestartet.');
  if(s.phase==='statements'){
   for(const item of s.statements.filter(i=>i.status==='pending')){
    await pausePoint(s);persist(s,`Auszüge prüfen: ${s.statements.filter(x=>x.status!=='pending').length}/${s.statements.length}`);
    try{const account=item.file.accounts[0];const result=await previewManualStatement(item.file.id,item.file.sha256,account.ref,account.profiles[0],true);item.status=result.status==='staged_unbooked'?'done':'blocked';item.reason=result.reason_code;}
    catch(e){const why=code(e);if(why==='import_busy_or_interrupted_lock')throw e;item.status='blocked';item.reason=why;}
    s.counts.statements_checked=s.statements.filter(x=>x.status!=='pending').length;s.counts.statements_blocked=s.statements.filter(x=>x.status==='blocked').length;saveFinanceRun(s);
   }
   await reconcileStatementPayments();s.phase='discovery';persist(s,'Auszüge erfasst; bestehende belegte Zahlungsfälle aktualisiert.');
  }
  let b=bankBatch();
  if(s.batch_sha256&&s.batch_sha256!==b.batch_sha256)throw Error('statement_batch_changed_resume_required');
  if(s.phase==='discovery'){
   persist(s,'Lokale Mailtexte und vorhandene Anhänge in beiden Richtungen abgleichen.');
   const mails=await localCorpus(s),banks=b.entries as BankEvidence[],links=discoverLinks(banks,mails);
   const linkedBanks=new Set(links.map(l=>l.bank_id)),linkedMails=new Set(links.map(l=>l.mail_id));
   const financial=mails.filter(m=>/rechnung|mahnung|invoice|payment|zahlung|quittung|receipt|erstattung|rückzahlung|gutschrift|bezahlt|paid/iu.test(m.subject));
   const summary={schema:'folio/finance-discovery/v1',batch_sha256:b.batch_sha256,corpus_sha256:s.corpus_sha256,links,bank_without_mail:banks.filter(x=>!linkedBanks.has(x.observation_id)).map(x=>x.observation_id),financial_mail_without_bank:financial.filter(x=>!linkedMails.has(x.id)).map(x=>({id:x.id,ref:x.ref,date:x.date,subject:x.subject,truncated:x.truncated})),statement_gaps:coverageGaps(b.sources),mail_coverage:dbCoverage(),policy:{links_are_not_confirmations:true,absence_is_not_nonpayment:true,money_moved:false}};
   atomicPrivateJson(join(financeRunRoot(),'discovery.json'),summary);s.batch_sha256=b.batch_sha256;
   // Refreshing the corpus after acquiring evidence does not discard valid
   // independent reviews. Reuse only exact bank + mail input hash matches.
   s.reviewed_links=[];s.counts.links_reviewed=0;s.counts.links_supported=0;s.counts.links_uncertain=0;s.counts.links_rejected=0;
   for(const link of links){try{
    const review=JSON.parse(documentBytes(join(financeRunRoot(),'reviews',sha256(link.id)+'.json'),128*1024).toString());
    const input=evidenceReviewInput(link,banks,mails);
    if(!reusableAdvisoryReview(review,input,b.batch_sha256))continue;
    s.reviewed_links.push(link.id);
    const supported=review.votes.every((v:any)=>v.relation==='supported')&&!input.mail.truncated;
    if(supported)s.counts.links_supported++;else if(review.votes.some((v:any)=>v.relation==='uncertain')||new Set(review.votes.map((v:any)=>v.relation)).size>1)s.counts.links_uncertain++;else s.counts.links_rejected++;
   }catch{/* Missing or stale evidence is reviewed again. */}}
   s.counts.links_reviewed=s.reviewed_links.length;
   Object.assign(s.counts,{bank_entries:banks.length,statement_sources:b.sources.length,possible_links:links.length,bank_without_mail:summary.bank_without_mail.length,financial_mail_without_bank:summary.financial_mail_without_bank.length,statement_gaps:summary.statement_gaps.length});s.phase='supported_payments';saveFinanceRun(s);
  }
  if(s.phase==='supported_payments'){
   for(;;){
    await pausePoint(s);
    try{const report=await runPaymentAgent(undefined,m=>persist(s!,m),new Set(s.payment_attempted));
     s.payment_attempted.push(...report.attempted_fact_ids??[]);s.payment_runs.push(report.run_id);
     s.counts.payment_reviewed=(s.counts.payment_reviewed??0)+report.reviewed;s.counts.payment_new_confirmations=(s.counts.payment_new_confirmations??0)+report.recorded;s.counts.payment_preparation_failed=(s.counts.payment_preparation_failed??0)+report.skipped.preparation_failed;
     saveFinanceRun(s);if(!report.attempted_fact_ids?.length)break;
    }catch(e){if(code(e)==='payment_agent_model_busy'){persist(s,'Lokales Modell belegt; warte ohne den anderen Lauf zu unterbrechen.');await delay(30000);continue;}throw e;}
   }
   s.phase='link_review';saveFinanceRun(s);
  }
  if(s.phase==='link_review'){
   const discovery=JSON.parse(documentBytes(join(financeRunRoot(),'discovery.json'),32*1024*1024).toString());
   const mails=JSON.parse(documentBytes(join(financeRunRoot(),'corpus.json'),256*1024*1024).toString()) as MailEvidence[];
   if(discovery.batch_sha256!==b.batch_sha256||discovery.corpus_sha256!==canonicalHash(mails))throw Error('discovery_source_changed');
   const pending=(discovery.links as EvidenceLink[]).filter(x=>!s!.reviewed_links.includes(x.id));
   let newlyReviewed=0;
   while(pending.length){
    if(options.maxLinks!==undefined&&newlyReviewed>=options.maxLinks){s.status='paused';persist(s,'Prüfabschnitt beendet; weitere Kandidaten bleiben für den nächsten Abschnitt erhalten. Lokale Modelle sind frei.');return;}
    await pausePoint(s);const profile=await readHermesExecutionProfile();const token=acquire();if(!token){persist(s,'Warte auf freies lokales Modell.');await delay(30000);continue;}
    const abort=new AbortController();
    const heartbeat=setInterval(()=>{try{renew(token);if(financePaused())abort.abort();}catch{abort.abort();}},5000);
    const batch=pending.slice(0,Math.min(6,(options.maxLinks??Infinity)-newlyReviewed)),inputs=batch.map(link=>evidenceReviewInput(link,b.entries,mails));
    try{
     if(bankBatch().batch_sha256!==s.batch_sha256)throw Error('statement_batch_changed');
     const votes=await reviewEvidenceLinks(inputs,token,abort.signal,m=>persist(s!,m));
     for(const input of inputs){
      const v=votes[input.id]??[];const supported=v.length===2&&v[0].model!==v[1].model&&v.every(x=>x.input_sha256===canonicalHash(input)&&x.relation==='supported')&&!input.mail.truncated;
      const uncertainty=v.some(x=>x.relation==='uncertain')||new Set(v.map(x=>x.relation)).size>1;
      atomicPrivateJson(join(financeRunRoot(),'reviews',sha256(input.id)+'.json'),{schema:'folio/advisory-finance-link/v1',run_id:s.id,batch_sha256:s.batch_sha256,input,votes:v,supported,automatic_confirmation:false});
      s.reviewed_links.push(input.id);s.counts.links_reviewed=s.reviewed_links.length;if(supported)s.counts.links_supported=(s.counts.links_supported??0)+1;else if(uncertainty)s.counts.links_uncertain=(s.counts.links_uncertain??0)+1;else s.counts.links_rejected=(s.counts.links_rejected??0)+1;
     }
     pending.splice(0,batch.length);newlyReviewed+=batch.length;saveFinanceRun(s);
    }catch(e){if(!financePaused())throw e;}
    finally{try{await prepareIntakeModel(profile.modelId,profile.contextLength??65536,token);}finally{clearInterval(heartbeat);release(token);}}
    persist(s,`${s.reviewed_links.length} Zuordnungen mit zwei lokalen Modellen geprüft.`);
    await delay(1000);
   }
   s.phase='finished';s.status='completed';s.ended_at=new Date().toISOString();persist(s,'Lokaler Gesamtabgleich abgeschlossen. Fehlende Quellen und nicht unterstützte Fälle bleiben im Bericht offen.');
  }
 }catch(e){if(s){s.status='failed';s.error=code(e);persist(s,'Lauf kontrolliert angehalten; geprüfte Zwischenstände bleiben erhalten.');}throw e;}
 finally{unlock();}
}
function dbCoverage(){return (getFolioDb().prepare('SELECT account,value FROM mail_intake_coverage').all() as {account:string;value:string}[]).map(x=>({account:x.account,coverage:JSON.parse(x.value)}));}
