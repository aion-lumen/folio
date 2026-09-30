import { createHash } from 'node:crypto';
import { isHistoricalAppointment } from '../../memory/temporal.js';
import type { MemoryProposalBundle } from './types.js';
export type RetentionMode='discard'|'history'|'profile'|'review';
export interface RetentionDecision {mode:RetentionMode;reason:string;title:string;groupKey:string|null;}
export interface RetentionReview {verdict?:string;reason_codes?:string[];bundle_digest?:string;diagnostic?:{unsupported_object_ids?:string[]};}
const normalize=(text:string)=>text.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[’']/g,'').replace(/\s+/g,' ').trim();
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
/** A profile is a source-attributed search, never an inferred current preference. */
export function savedSearchProfile(bundle:MemoryProposalBundle){
 if(bundle.proposal.domain!=='immo'||bundle.facts.length!==1||bundle.entities.length||bundle.relations.length||bundle.episodes.length)return null;
 const f=bundle.facts[0];if(!['has_context','prefers'].includes(f.predicate))return null;
 const context=normalize(`${f.subject} ${f.value_text}`),quote=f.source_excerpt?.trim();if(!quote)return null;
 if(!/(?:gespeicherte.*such|saved.*search|haus zum kauf|wohnung(?:ssuche| mieten))/i.test(context))return null;
 if(!/(?:€|eur|chf|zimmer|rooms|m²|km)/i.test(`${f.value_text} ${quote}`))return null;
 // Exact source wording is the grouping key. Keep location from the subject when
 // the evidence contains only a price; never merge distinct criteria by similarity.
 const criteria=quote.replace(/^.*?(?=Haus zum Kauf|Wohnung mieten)/i,'').replace(/^Gespeicherte Suche:\s*/i,'');
 const location=/^(?:preis:|max\b)/i.test(criteria)?normalize(f.subject):'';
 return {key:hash(`${bundle.proposal.domain}\0${location}\0${normalize(criteria)}`),title:location?`${f.subject}: ${criteria}`:criteria};
}
export function assessMemoryRetention(bundle:MemoryProposalBundle,review:RetentionReview|undefined,today:string):RetentionDecision|null{
 const b=bundle,fs=b.facts;
 if(b.proposal.status!=='candidate'||b.proposal.source_kind!=='mail'||!fs.length)return null;
 if([...fs,...b.entities,...b.relations,...b.episodes].some(x=>x.status!=='candidate'))return null;
 const title=fs[0].subject;
 const decision=(mode:RetentionMode,reason:string,groupKey:string|null=null,t=title):RetentionDecision=>({mode,reason,groupKey,title:t});
 // These facts use their own domain workflows, especially monthly bank matching.
 if(fs.some(f=>['paid','has_application_status'].includes(f.predicate)||['transaction','account_reference','application'].includes(f.data_class)))return null;
 const low=review?.verdict==='reject'&&review.reason_codes?.includes('transient_or_low_value');
 if(review?.reason_codes?.some(r=>r!=='transient_or_low_value'&&r!=='fully_supported'))return low?decision('review','Welche Angabe stimmt mit der Mail überein?'):null;
 const profile=savedSearchProfile(b);
 if(profile)return decision('profile','Suchkriterien aus dieser Mail.',profile.key,profile.title);
 // A past timestamp never closes an obligation or confirms an event happened.
 if(fs.some(f=>/\b(?:recurring|every|each|regelmäßig|regelmässig|wöchentlich|monatlich|jährlich|jeden|jede)\b/iu.test(`${f.value_text} ${f.source_excerpt}`)))return low?decision('review','Gilt diese wiederkehrende Absprache weiterhin?'):null;
 if(fs.every(f=>['scheduled_for','available_at'].includes(f.predicate)&&isHistoricalAppointment({...f,predicate:'scheduled_for'},today)) && !b.relations.length && !b.entities.length && b.episodes.every(e=>e.episode_type==='mail_event'&&e.source_ref===b.proposal.source_ref&&/^\d{4}-\d{2}-\d{2}$/.test(e.occurred_at)&&e.occurred_at<today&&fs.some(f=>normalize(f.source_excerpt??'')===normalize(e.source_excerpt??'')))){
  if(fs.some(f=>/\b(?:deadline|frist|rückgabe|return|fällig|register|anmeld|prüf|payment|zahlung)/iu.test(`${f.subject} ${f.value_text} ${f.source_excerpt}`)))return low?decision('review','Ist zu diesem vergangenen Termin noch etwas offen?'):null;
  return decision('history','Vergangene Terminabsprache.');
 }
 if(!low)return null;
 if(fs.some(f=>['committed_to','decided'].includes(f.predicate)))return decision('review','Ist diese Zusage oder Entscheidung noch offen?');
 if(fs.some(f=>['identified_by','has_contact_address','has_profile_fact','has_project_fact','prefers','contacted_by'].includes(f.predicate)))return decision('review','Soll diese Kontakt- oder persönliche Angabe gespeichert bleiben?');
 if(fs.some(f=>['scheduled_for','available_at'].includes(f.predicate)))return decision('review','Für welchen Zeitraum gilt diese Absprache?');
 if(b.proposal.domain==='finance')return decision('review','Zu welchem Finanzvorgang gehört diese Angabe?');
 const text=fs.map(f=>`${f.subject} ${f.value_text} ${f.source_excerpt??''}`).join(' ');
 if(/\b(?:pending|will|must|needs?|requires?|should|waiting|await|request|commit|deadline|noch|ausstehend|muss|bitte|wird|erwartet|fehlt|prüfen|medication|prescription|therap|doctor|rezept|krank|owner|eligible|approved|genehmigt)\b/iu.test(text))return decision('review','Ist aus dieser Nachricht noch etwas zu erledigen?');
 // No useful object attributes: just the literal, short advert headline flagged
 // by the independent reviewer. Numbers, obligations and relationships survive.
 if(b.proposal.domain==='immo'&&fs.length===1&&fs[0].predicate==='has_context'&&/^\d+$/.test(title)&&fs[0].value_text.length<140
  && normalize(fs[0].value_text)===normalize(fs[0].source_excerpt??'') && /(?:charmant|schön|traum|idyllisch)/iu.test(fs[0].value_text)
  && !/\d|€|CHF|EUR|@/i.test(fs[0].value_text)&&!b.entities.length&&!b.relations.length&&!b.episodes.length)
  return decision('discard','Reine Angebotsüberschrift ohne Sachangabe.');
 return decision('review','Welche Angabe möchtest du über diesen Vorgang behalten?');
}
