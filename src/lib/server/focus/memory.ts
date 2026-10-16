import {compileMemoryContext,limitMemoryFacts,memoryQueryTerms} from '../memory/compiler.js';
import {compileMemoryContextsHybrid} from '../memory/hybrid.js';
import {getFolioDb} from '../folio-db/init.js';
import {isDemoVaultActive} from '../env.js';
import {listSourceConfirmedMemory} from '../memory/quorum.js';
import {memoryVocabulary,onlyNonLearningAssessment} from './search-vocabulary.js';
/** Read-only retrieval for the authenticated owner's local model. No model-chosen SQL or paths. */
function memoryRequest(question:string,caseTitle='',history?:unknown){
 const previous=Array.isArray(history)?history.filter(m=>m?.role==='user'&&typeof m.text==='string').slice(-2).map(m=>m.text.slice(0,500)).join(' '):'';
 let query=(question+' '+caseTitle+' '+previous).slice(0,3000);
 const semanticQuery=query;
 const vocabulary=memoryVocabulary(query);
 // Suppress only injected terms for other senses. An owner's literal
 // "Assessment" remains ambiguous and must retain those source candidates.
 const explicitTerms=new Set(semanticQuery.normalize('NFKC').toLocaleLowerCase('de-CH').match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu)??[]);
 const injectedAssessmentTerms=new Set(vocabulary.filter(t=>!explicitTerms.has(t)));
 // Reserve terms before the shared 32-term truncation, even with long history.
 query=vocabulary.join(' ')+' '+query;
 const travel=/address|where.*live|commut|how far|residence|wohnort|wohnadresse|adresse|anschrift|entfern|arbeitsweg|pendel|wohne/i.test(query);
 if(travel)query+=' Wohnort Adresse Anschrift';
 if(/available|availability|verfügbar|anfangen|starten|verfügbarkeit/i.test(query))query+=' availability Verfügbarkeit';
 if(/certificat|credential|qualification|zertifikat|zertifiz|qualifikation|nachweis/i.test(query))query+=' Zertifizierung credential IPMA CPRE SAP';
 if(/degree|education|studium|abschluss|ausbildung|bachelor|master/i.test(query))query+=' degree Bachelor Informatik';
 if(/berufserfahrung|laufbahn|lebenslauf|arbeitgeber/i.test(query))query+=' career_experience';
 if(/language|sprachen|englisch|französisch|deutsch/i.test(query))query+=' language';
 const pinned=travel?['owner_address']:[];
 if(/certificat|credential|qualification|zertifikat|zertifiz|qualifikation|nachweis/i.test(question))pinned.push('career_credential');
 if(/available|availability|verfügbar|verfügbarkeit/i.test(question))pinned.push('career_availability','career_travel_availability');
 if(/degree|education|studium|abschluss|ausbildung/i.test(question))pinned.push('career_education');
 const noise=new Set(['please','tell','know','which','what','does','about','could','next','bitte','kannst','könntest','mein','meine','meinen','meinem','meiner','mich','mir','habe','bin','dort','weit','welche','welchen','wann','steht','stelle','prüfen','nächste']);
 const terms=memoryQueryTerms(query).filter(t=>!noise.has(t));query=terms.join(' ');
 const existing=getFolioDb().prepare("SELECT DISTINCT domain FROM memory_facts WHERE status='confirmed' ORDER BY domain LIMIT 24").all() as {domain:string}[];
 const domains=[...new Set([...listSourceConfirmedMemory().map(claim=>claim.fact.domain),...existing.map(row=>row.domain)])].slice(0,24).map(domain=>({domain}));
 return {query,semanticQuery,terms,pinned,domains,injectedAssessmentTerms};
}
function rankFacts(facts:ReturnType<typeof compileMemoryContext>['facts'],terms:string[],pinned:string[],semanticIds=new Set<string>(),limit=20,subjectDomains=new Set<string>(),injectedAssessmentTerms=new Set<string>()){
 // A literal subject named in the request is lexical evidence of relevance.
 // Entity membership alone still cannot confer relevance on sibling facts.
 const score=(f:typeof facts[number])=>{
  const nonLearning=injectedAssessmentTerms.size>0&&onlyNonLearningAssessment(f.subject+' '+f.value);
  return pinned.includes(f.data_class)?100:terms.reduce((n,t)=>n+(nonLearning&&injectedAssessmentTerms.has(t)?0:Number((f.value+' '+f.predicate+' '+f.data_class).toLocaleLowerCase('de-CH').includes(t))+Number(subjectDomains.has(f.domain)&&memoryQueryTerms(f.subject).includes(t))),0);
 };
 const ranked=facts.filter(f=>score(f)>0||semanticIds.has(f.fact_id)).sort((a,b)=>(score(b)||Number(semanticIds.has(b.fact_id)))-(score(a)||Number(semanticIds.has(a.fact_id))));
 return limitMemoryFacts(ranked,limit,semanticIds).map(f=>({...f,value:f.value.slice(0,1200)}));
}

export function companionMemory(question:string,caseTitle='',history?:unknown){
 if(isDemoVaultActive())return [];
 const {query,terms,pinned,domains,injectedAssessmentTerms}=memoryRequest(question,caseTitle,history);
 const facts=domains.flatMap(({domain})=>compileMemoryContext({consumer_id:'local-companion',domain,query,max_sensitivity:'sensitive',limit:20,always_include_data_classes:pinned}).facts);
 return rankFacts(facts,terms,pinned,undefined,undefined,undefined,injectedAssessmentTerms);
}
export async function companionMemoryHybrid(question:string,caseTitle='',history?:unknown){
 if(isDemoVaultActive())return [];
 const {query,semanticQuery,terms,pinned,domains,injectedAssessmentTerms}=memoryRequest(question,caseTitle,history);
 const bundles=await compileMemoryContextsHybrid({consumer_id:'local-companion',query,semantic_query:semanticQuery,max_sensitivity:'sensitive',limit:20,always_include_data_classes:pinned},domains.map(d=>d.domain));
 const semanticIds=new Set(bundles.flatMap(b=>b.retrieval?.semantic_fact_ids??[]));
 // Preserve the original path exactly when disabled, excluded or unavailable.
 const limit=bundles.some(b=>b.retrieval?.semantic_status==='ready')?10:20;
 const subjectDomains=new Set(bundles.filter(b=>b.retrieval?.semantic_status==='ready').map(b=>b.domain));
 return rankFacts(bundles.flatMap(b=>b.facts),terms,pinned,semanticIds,limit,subjectDomains,injectedAssessmentTerms);
}
