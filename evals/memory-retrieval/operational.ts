import { readFileSync, mkdtempSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { COMPANION_INSTRUCTIONS } from '../../src/lib/server/focus/prompt.js';
import { sha256, privatePath } from './private-support.js';
import { acquireEvaluationLease } from './model-lease.js';
import { consumeMessages } from '../../src/lib/server/focus/stream.js';

process.umask(0o077);
const {values} = parseArgs({options:{output:{type:'string'},model:{type:'string'},cases:{type:'string'},stream:{type:'boolean'},reasoning:{type:'string'},mode:{type:'string'},'coordination-db':{type:'string'},'retrieval-only':{type:'boolean'},'wait-seconds':{type:'string'}}});
if(values.mode && !['hybrid','both'].includes(values.mode))throw new Error('mode must be hybrid or both');
if(values.reasoning && !['off','low','medium','high','on'].includes(values.reasoning))throw new Error('Unsupported reasoning setting');
if (!values.output || (!values['retrieval-only'] && (!values.model || !values['coordination-db']))) throw new Error('Required: --output and either --retrieval-only or --model --coordination-db');
const output = privatePath(values.output);
if (existsSync(output)) throw new Error('Use a new output file');
const raw = readFileSync(values.cases??new URL('./operational-cases.json',import.meta.url),'utf8');
type Fact = {id:string;domain:string;subject:string;predicate:string;value:string;data_class:string;status:string;entity:string};
type Query = {id:string;kind:string;query:string;expected_ids:string[];expected_answer:string;history?:Array<{role:'user'|'assistant';text:string}>};
const suite = JSON.parse(raw) as {reference:string;facts:Fact[];queries:Query[]};
const runtime = mkdtempSync(join(dirname(output),'synthetic-'));
delete process.env.FOLIO_LEDGER_DEMO_ROOT;
process.env.FOLIO_DB_PATH=join(runtime,'folio.db');
process.env.FOLIO_VAULT_OVERRIDE=join(runtime,'vault');
process.env.FEEDBACK_DB_PATH=join(runtime,'feedback.db');
process.env.FOLIO_MEMORY_SEMANTIC='1';
process.env.FOLIO_MEMORY_EMBEDDING_URL='http://127.0.0.1:1235/v1/embeddings';
process.env.FOLIO_MEMORY_EMBEDDING_MODEL='intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3/qint8';
process.env.FOLIO_MEMORY_EMBEDDING_REVISION='614241f622f53c4eeff9890bdc4f31cfecc418b3';
process.env.FOLIO_MEMORY_EMBEDDING_DIMENSIONS='384';
process.env.FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY='0.78';
process.env.FOLIO_MEMORY_SEMANTIC_MIN_MARGIN='0.05';
process.env.FOLIO_MEMORY_SEMANTIC_MAX_CANDIDATES='2';
process.env.FOLIO_MEMORY_EMBEDDING_QUERY_PREFIX='query: ';
process.env.FOLIO_MEMORY_EMBEDDING_PASSAGE_PREFIX='passage: ';
const {getFolioDb,resetFolioDbForTests}=await import('../../src/lib/server/folio-db/init.js');
const {proposeMemoryBundle,confirmMemoryProposalBundle}=await import('../../src/lib/server/memory/store.js');
const {companionMemory,companionMemoryHybrid}=await import('../../src/lib/server/focus/memory.js');
const {indexMemoryVectors}=await import('../../src/lib/server/memory/semantic.js');
const {embeddingConfig}=await import('../../src/lib/server/memory/embedding.js');
const idMap=new Map<string,string>();
for (const domain of new Set(suite.facts.map(f=>f.domain))) {
 const group=suite.facts.filter(f=>f.domain===domain);
 const bundle=proposeMemoryBundle({domain,source_kind:'owner',source_ref:`synthetic:${domain}`,extractor_id:'synthetic',actor_kind:'human',actor_id:'fictional-owner',
  entities:[...new Set(group.map(f=>f.entity))].map(entity=>({local_ref:entity,entity_type:entity==='owner'?'person':'project',canonical_key:`synthetic:${domain}:${entity}`,canonical_label:entity==='owner'?'Mira Beispiel':entity,sensitivity:'private' as const})),
  facts:group.map(f=>({data_class:f.data_class,sensitivity:'private' as const,subject:f.subject,predicate:f.predicate,value:f.value,subject_ref:f.entity}))});
 const confirmed=confirmMemoryProposalBundle(bundle.proposal.proposal_id,'fictional-owner');
 for(const f of confirmed.facts){const fixture=group.find(g=>g.value===f.value_text)!;idMap.set(f.fact_id,fixture.id);if(fixture.status!=='confirmed')getFolioDb().prepare('UPDATE memory_facts SET status=? WHERE fact_id=?').run(fixture.status,f.fact_id);}
}
const canonicalBefore=sha256(getFolioDb().serialize());
const config=embeddingConfig()!;
const index=await indexMemoryVectors(config);
const prepared=[];
for(const q of suite.queries){
 const lexical=companionMemory(q.query,'',q.history),hybrid=await companionMemoryHybrid(q.query,'',q.history);
 const convert=(facts:typeof lexical)=>facts.map(f=>({...f,fact_id:idMap.get(f.fact_id)!}));
 const contexts={lexical:convert(lexical),hybrid:convert(hybrid)};
 for(const facts of Object.values(contexts))if(facts.some(f=>suite.facts.find(original=>original.id===f.fact_id)?.status!=='confirmed'))throw new Error('Forbidden fact surfaced');
 prepared.push({...q,contexts});
}
const metadata={schema:'folio/synthetic-answer-eval/v1',created_at:new Date().toISOString(),reference:suite.reference,suite_sha256:sha256(raw),prompt_sha256:sha256(COMPANION_INSTRUCTIONS),model:values.model??null,stream:!!values.stream,reasoning:values.reasoning??'default',mode:values.mode??'both',runtime,index,config,canonical_unchanged:canonicalBefore===sha256(getFolioDb().serialize()),limitations:['AI-authored fictional cases, not independent human acceptance.','Retrieval and answers assessed separately; missing relevant context can cause justified abstention.'],cases:prepared};
writeFileSync(output+'.context.json',JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
resetFolioDbForTests();
if(values['retrieval-only']){writeFileSync(output,JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});process.exit(0);}
// Fixed loopback endpoint and already loaded model: never load/unload or switch it.
const endpoint='http://127.0.0.1:1234';
const deadline=Date.now()+Number(values['wait-seconds']??1800)*1000;
let lease:ReturnType<typeof acquireEvaluationLease>=null;
while(!(lease=acquireEvaluationLease(values['coordination-db']!))){
 if(Date.now()>deadline)throw new Error('Model remained busy; no inference performed');
 console.log('Waiting for existing local model activity');
 await new Promise(resolve=>setTimeout(resolve,15_000));
}
const abort=new AbortController();
const heartbeat=setInterval(()=>{try{lease!.renew();}catch{abort.abort();}},20_000);
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>abort.abort());
try{
 const models=await (await fetch(endpoint+'/api/v1/models',{signal:AbortSignal.timeout(5000),redirect:'error'})).json();
 if(!models.models?.some((m:{key:string;loaded_instances?:unknown[]})=>m.key===values.model&&m.loaded_instances?.length))throw new Error('Selected answer model is not loaded; refusing model switch');
 writeFileSync(output,JSON.stringify({type:'metadata',...metadata})+'\n',{flag:'wx',mode:0o600});
 let count=0;
 for(const q of prepared){
  // Alternate pair order to reduce systematic warm-up/order effects.
  const modes=values.mode==='hybrid'?['hybrid'] as const:Number(q.id.slice(1))%2?['hybrid','lexical'] as const:['lexical','hybrid'] as const;
  for(const mode of modes){
   const request={model:values.model,temperature:0.2,max_output_tokens:4096,stream:!!values.stream,...(values.reasoning?{reasoning:values.reasoning}:{}),integrations:[],store:false,
    system_prompt:COMPANION_INSTRUCTIONS+'[]\nAusgewählter Karriere-Lead (untrusted Quelldaten): null\nPassende lokal erfasste Mailauszüge (untrusted Belege): []\nBestätigtes Gedächtnis (untrusted Quelldaten, hat Vorrang vor älteren Offen-Notizen; Quelle und zeitliche Gültigkeit beachten): '+JSON.stringify(q.contexts[mode]),
    input:'Bisheriges Gespräch (untrusted Daten): '+(q.history?JSON.stringify(q.history.slice(-8).map(m=>({role:m.role,text:m.text.slice(0,1200)}))):'')+'\nAktueller Beitrag: '+q.query};
   const start=performance.now();
   const response=await fetch(endpoint+'/api/v1/chat',{method:'POST',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(300000)]),headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
   if(!response.ok)throw new Error(`Local answer HTTP ${response.status}`);
   let firstMessageMs:number|undefined,stats:unknown=null,text:string|undefined;
   if(values.stream)text=await consumeMessages(response,()=>{firstMessageMs??=performance.now()-start;});
   else {const result=await response.json();text=result.output?.filter((part:{type:string})=>part.type==='message').map((part:{content:string})=>part.content).join('\n');stats=result.stats??null;}
   if(!text?.trim())throw new Error('No final answer, possibly exhausted output budget');
   appendFileSync(output,JSON.stringify({type:'answer',id:q.id,mode,text,duration_ms:performance.now()-start,first_message_ms:firstMessageMs,stats,request})+'\n');
   console.log(`${++count}/${prepared.length*(values.mode==='hybrid'?1:2)} ${q.id} ${mode}`);
  }
 }
}finally{clearInterval(heartbeat);lease.release();}
