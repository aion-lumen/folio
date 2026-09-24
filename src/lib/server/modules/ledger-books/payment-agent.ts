import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { areModulesDisabled,getDisabledModuleIds,isDemoVaultActive } from '../../env.js';
import { getFolioDb } from '../../folio-db/init.js';
import { acquire,release,renew } from '../../mail-intake/state.js';
import { prepareIntakeModel } from '../../mail-intake/runner.js';
import { readHermesExecutionProfile } from '../../hermes/execution-profile.js';
import { readHermesContextManifest } from '../../hermes/context-manifest.js';
import { listPaymentConfirmedMemory,recordPaymentConfirmations } from '../../memory/payment-confirmation.js';
import { atomicPrivateJson,documentBytes,isolatedProcess,privateDirectory } from '../../file-intake/document-security.js';
import { mayUseLocalFinanceContext } from './intake.js';
import { manualImportRoot,statementImportConfig,withStatementLock } from './manual-import.js';
import { canonicalHash,reconcileAvailableCases,validateReconciliation,type Result } from './reconciliation.js';
import { discoverPaymentSources,paymentCandidatesRoot,paymentWorkRoot,preparePaymentSource,type PaymentCandidate } from './payment-sources.js';
import { reviewInvoiceBatch,reviewsAgree,type ReviewInput } from './payment-review.js';

export interface PaymentAgentResult {
 run_id:string; attempted_fact_ids?:string[]; failed_cases?:{fact_id:string;reason:string}[]; reviewed:number; prepared:number; recorded:number; bank_confirmed:number;
 cases:{title:string;status:string;due_date:string;paid_at:string|null;review:'agreed'|'disagreement'}[];
 skipped:Record<string,number>; models:string[]; ledger_db_touched:false; money_moved:false;
}
export function paymentIntent(message:string):'run'|'help'|null{
 const v=message.trim().replace(/[.!]$/u,'').toLocaleLowerCase('de-CH');
 // Full-message commands only. Quotes, negations, pasted source text and
 // questions about capabilities never authorize a mutating adapter call.
 if(/^(?:bitte )?(?:zahlungsabgleich|rechnungsabgleich)(?: (?:starten|durchführen|ausführen|prüfen))?$/u.test(v)
  || /^(?:bitte )?gleiche (?:die |alle |alle möglichen |die restlichen )?(?:rechnungen|zahlungen|zahlungsfälle) (?:mit|gegen) (?:die |den )?kontoauszügen? ab$/u.test(v)
  || /^(?:please )?(?:reconcile|check) (?:my |the |all )?(?:invoices|payments) (?:against|with) (?:my |the )?bank statements$/u.test(v))return 'run';
 if(/zahlungsabgleich|rechnungsabgleich|(?:rechnung|zahlung).*(?:kontoauszug|kontoauszüg)|(?:invoice|payment).*bank statement/iu.test(v))return 'help';
 return null;
}
export const PAYMENT_HELP='Für den kontrollierten Abgleich schreibe „Zahlungsabgleich starten“. Ich prüfe unterstützte Rechnungen mit den lokalen Kontoauszügen und zwei lokalen Modellen. Nur eindeutig bankbelegte Zahlungen können ihre Memory-Prüffrage automatisch abschliessen. Aktuell unterstützt: Vodafone Kabel.';

async function preview(candidate:PaymentCandidate,batch:PaymentCandidate):Promise<Result>{
 const cfg=statementImportConfig();if(!cfg)throw new Error('statement_account_setup_required');
 const work=mkdtempSync(join(paymentWorkRoot(),'match-'));chmodSync(work,0o700);
 try{
  const cp=join(work,'candidate.json'),bp=join(work,'batch.json'),op=join(work,'result.json');
  atomicPrivateJson(cp,candidate);atomicPrivateJson(bp,batch);
  const result=await isolatedProcess(cfg.python_bin,['-I',join(cfg.ledger_root,'scripts/reconcile_finance_case.py'),'--candidate',cp,'--statement-batch',bp,'--output',op],work,[cfg.ledger_root,dirname(dirname(cfg.python_bin))],30000,16384);
  if(result.code!==0)throw new Error('payment_match_failed');
  const r=JSON.parse(documentBytes(op,512*1024).toString());
  if(!validateReconciliation(r,documentBytes(cp),batch.batch_sha256))throw new Error('payment_match_binding');
  return r;
 }finally{rmSync(work,{recursive:true,force:true});}
}
export async function runPaymentAgent(signal?:AbortSignal,progress?:(message:string)=>void,exclude:ReadonlySet<string>=new Set(),onlyFactIds?:ReadonlySet<string>):Promise<PaymentAgentResult>{
 const [profile,manifest]=await Promise.all([readHermesExecutionProfile(),readHermesContextManifest()]);
 if(areModulesDisabled() || getDisabledModuleIds().has('ledger-books') || !mayUseLocalFinanceContext(manifest.sources.financeObservations,isDemoVaultActive(),profile))throw new Error('payment_agent_local_finance_gate');
 // Acquired before any Hermes stream. Reuse the mail lock, not a competing
 // model loader; release only after the previous chat model is restored.
 const token=acquire();if(!token)throw new Error('payment_agent_model_busy');
 const heartbeat=setInterval(()=>{try{renew(token);}catch{}},30000);
 try{return await withStatementLock(async()=>{
  const cfg=statementImportConfig();if(!cfg)throw new Error('statement_account_setup_required');
  const batch=JSON.parse(documentBytes(join(manualImportRoot(),'statement-batch.json'),64 * 1024 * 1024).toString());
  if(batch.schema!=='ledger/manual-statement-batch/v0'||batch.bookkeeping?.ledger_db_touched!==false||batch.batch_sha256!==canonicalHash({sources:batch.sources,entries:batch.entries,issues:batch.issues}))throw new Error('invalid_statement_batch');
  const accounts=cfg.roots.flatMap(r=>r.accounts).filter(a=>a.profiles.includes('sparkasse-pdf-v1'));
  if(accounts.length!==1)throw new Error('payment_account_ambiguous');
  const coveredMonths=new Set<string>(batch.sources.filter((s:PaymentCandidate)=>s.account_ref===accounts[0].ref && s.control_result?.complete).map((s:PaymentCandidate)=>s.declared_period?.to?.slice(0,7)));
  const discovery=discoverPaymentSources(coveredMonths,6,exclude,onlyFactIds);
  const report:PaymentAgentResult={run_id:randomUUID(),attempted_fact_ids:discovery.selected.map(s=>s.fact.fact_id),reviewed:0,prepared:0,recorded:0,bank_confirmed:0,cases:[],skipped:{...discovery.skipped,preparation_failed:0},models:[],ledger_db_touched:false,money_moved:false};
  privateDirectory(paymentWorkRoot());
  const prepared:{candidate:PaymentCandidate;text:string;name:string;existing:boolean;match:Result;input:ReviewInput}[]=[];
  progress?.(`${discovery.selected.length} Rechnungen im begrenzten Prüflauf; Belege werden abgeglichen.`);
  for(const selected of discovery.selected){
   signal?.throwIfAborted();renew(token);
   try{
    const p=await preparePaymentSource(selected,accounts[0].ref,signal),match=await preview(p.candidate,batch);
    const refs=new Set(match.matches.map(m=>m.observation_id));
    const entries=batch.entries.filter((e:PaymentCandidate)=>refs.has(e.observation_id));
    const {masked_account:_masked,...invoice}=p.candidate.normalized_invoice;
    const input:ReviewInput={id:selected.fact.fact_id,invoice_text:p.text,invoice,mail_excerpt:selected.fact.source_excerpt??'',bank_entries:entries.map((e:PaymentCandidate)=>({booking_date:e.booking_date,amount:e.amount,currency:e.currency,direction:e.direction,status:e.status,counterparty:e.counterparty,purpose:e.purpose})),coverage_complete:match.coverage.complete_for_target,today:new Date().toISOString().slice(0,10)};
    prepared.push({...p,match,input});
   }catch(error){signal?.throwIfAborted();report.skipped.preparation_failed++;(report.failed_cases??=[]).push({fact_id:selected.fact.fact_id,reason:error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'source_preparation_failed'});progress?.('Ein Fall bleibt offen: Quelle oder Rechnungsformat konnte nicht vollständig geprüft werden.');}
  }
  if(prepared.length){
   const votes=await reviewInvoiceBatch(prepared.map(p=>p.input),token,signal,progress);
   report.models=[...new Set([...votes.values()].flat().map(v=>v.model))];
   const allowed=new Set<string>();
   for(const p of prepared){
    signal?.throwIfAborted();renew(token);
    const v=votes.get(p.input.id)??[];
    const agreed=reviewsAgree(v,p.input) && v.every(x=>x.payment_evidence===(p.match.status==='matched'?'paid':'not_proven'));
    report.reviewed++;
    const entry=batch.entries.find((e:PaymentCandidate)=>e.observation_id===p.match.matches[0]?.observation_id);
    report.cases.push({title:p.candidate.display_title,status:p.match.status,due_date:p.candidate.normalized_invoice.due_date,paid_at:p.match.status==='matched'?entry?.booking_date??null:null,review:agreed?'agreed':'disagreement'});
    // Audit independent votes, even when disagreement prevents confirmation.
    atomicPrivateJson(join(paymentWorkRoot(),`${report.run_id}-${p.input.id}.json`),{schema:'folio/payment-local-review/v1',input:p.input,votes:v,result_id:p.match.result_id,agreed});
    if(!agreed)continue;
    const current=getFolioDb().prepare('SELECT * FROM memory_facts WHERE fact_id=?').get(p.input.id);
    if(canonicalHash(current)!==p.candidate.memory_binding.fact_sha256)throw new Error('payment_memory_changed_during_review');
    if(!p.existing){
     p.candidate.preparation_policy='payment-agent/v1';
     p.candidate.local_review={input:p.input,votes:v};
     privateDirectory(paymentCandidatesRoot());const target=join(paymentCandidatesRoot(),p.name);
     if(existsSync(target))throw new Error('payment_candidate_already_exists');
     writeFileSync(target,JSON.stringify(p.candidate,null,2)+'\n',{flag:'wx',mode:0o600});report.prepared++;
    }else{
     // A corrected parser may turn a former unknown result into a match.
     // Retain the old candidate for audit, then bind the newly agreed reviews
     // before reconciliation. Old "not_proven" votes cannot authorize payment.
     const target=join(paymentCandidatesRoot(),p.name);
     const currentCandidate=JSON.parse(documentBytes(target,512*1024).toString());
     if(canonicalHash(currentCandidate)!==canonicalHash(p.candidate))throw Error('payment_candidate_changed_during_review');
     atomicPrivateJson(join(paymentWorkRoot(),'candidate-history',`${report.run_id}-${p.input.id}.json`),currentCandidate);
     p.candidate.preparation_policy='payment-agent/v1';
     p.candidate.local_review={input:p.input,votes:v};
     atomicPrivateJson(target,p.candidate);
    }
    allowed.add(p.input.id);
   }
   signal?.throwIfAborted();renew(token);
   await reconcileAvailableCases(cfg.ledger_root,cfg.python_bin);
   signal?.throwIfAborted();report.recorded=recordPaymentConfirmations(allowed).recorded;
   report.bank_confirmed=listPaymentConfirmedMemory().filter(c=>allowed.has(c.fact_id)).length;
  }
  atomicPrivateJson(join(paymentWorkRoot(),report.run_id+'.json'),report);
  atomicPrivateJson(join(paymentWorkRoot(),'latest.json'),report);
  return report;
 });}finally{
  try{progress?.('Lokales Chatmodell wird wiederhergestellt.');await prepareIntakeModel(profile.modelId,profile.contextLength??65536,token);}
  finally{clearInterval(heartbeat);release(token);}
 }
}
export function renderPaymentResult(r:PaymentAgentResult):string{
 const lines=[`${r.reviewed} Rechnungen mit zwei lokalen Modellen geprüft. ${r.bank_confirmed} Zahlungen sind bankbelegt; ${r.recorded} Memory-Prüffragen wurden neu abgeschlossen.`];
 for(const c of r.cases)lines.push(c.review==='disagreement'?`${c.title}: Modellprüfung uneinig – bleibt offen.`:c.paid_at?`${c.title}: bezahlt am ${c.paid_at}.`:`${c.title}: Zahlung nicht belegt; angekündigter Einzug ${c.due_date}.`);
 const s=r.skipped;
 if(s.missing_coverage)lines.push(`${s.missing_coverage} weitere Vodafone-Fälle ohne passenden Auszugszeitraum.`);
 if(s.unsupported)lines.push(`${s.unsupported} weitere Zahlungsangaben benötigen ein unterstütztes Rechnungsformat.`);
 if(s.source_unavailable+s.preparation_failed+s.budget)lines.push(`${s.source_unavailable+s.preparation_failed+s.budget} Fälle wegen fehlender Quelle, Prüfproblem oder Laufgrenze zurückgestellt.`);
 lines.push('Es wurden keine Zahlungen ausgelöst.');return lines.join('\n');
}
