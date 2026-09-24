import {createHash} from 'node:crypto';
import type {FocusItem} from './store.js';
/** Explicit operational Carta recommendations; never evaluated as code or confirmed Memory. */
export function cartaFocus(tracker:Array<Record<string,unknown>>,existing:FocusItem[]):FocusItem[]{
 const seen=new Set(existing.map(i=>i.trackerMatch).filter(Boolean));
 return tracker.filter(t=>t.urg==='hot'&&typeof t.fit==='number'&&t.fit>=9&&['new','review'].includes(String(t.status))&&['apply','clarify'].includes(String(t.action)))
 .sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')))
 .flatMap(t=>{
  if(typeof t.company!=='string'||typeof t.title!=='string'||typeof t.url!=='string')return [];
  let url:URL;try{url=new URL(t.url);if(url.protocol!=='https:'||url.username||url.password)return [];}catch{return [];}
  const match=t.company+'|'+t.url;if(seen.has(match)||seen.has(t.company+'|'+t.title))return [];seen.add(match);
  return [{id:'carta-'+createHash('sha256').update(match).digest('hex').slice(0,16),title:t.title+' · '+t.company,recommendation:t.action==='clarify'?'Offene Anforderungen und Konditionen zuerst klären.':'Bewerbung vorbereiten; offene Bedingungen vor Profilweitergabe klären.',why:'Carta priorisiert diesen Fall als dringend (Fit '+t.fit+'/10).',priority:0,href:url.href,state:'decide' as const,trackerMatch:match,aliases:[t.company.split(' (')[0]],sourceNote:'Carta-Tracker · '+String(t.date??'Stand unbekannt')}];
 });
}
