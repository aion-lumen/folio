import {compileMemoryContext,memoryQueryTerms} from '../memory/compiler.js';
import {getFolioDb} from '../folio-db/init.js';
import {isDemoVaultActive} from '../env.js';
import {listSourceConfirmedMemory} from '../memory/quorum.js';
/** Read-only retrieval for the authenticated owner's local model. No model-chosen SQL or paths. */
export function companionMemory(question:string,caseTitle='',history?:unknown){
 if(isDemoVaultActive())return [];
 const previous=Array.isArray(history)?history.filter(m=>m?.role==='user'&&typeof m.text==='string').slice(-2).map(m=>m.text.slice(0,500)).join(' '):'';
 let query=(question+' '+caseTitle+' '+previous).slice(0,3000);
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
 const facts=domains.flatMap(({domain})=>compileMemoryContext({consumer_id:'local-companion',domain,query,max_sensitivity:'sensitive',limit:20,always_include_data_classes:pinned}).facts);
 const score=(f:typeof facts[number])=>pinned.includes(f.data_class)?100:terms.reduce((n,t)=>n+Number((f.value+' '+f.predicate+' '+f.data_class).toLocaleLowerCase('de-CH').includes(t)),0);
 return facts.filter(f=>score(f)>0).sort((a,b)=>score(b)-score(a)).slice(0,20).map(f=>({...f,value:f.value.slice(0,1200)}));
}
