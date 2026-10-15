/** Archive context is evidence about a source, not a claim that it is still current. */
export const FILE_QUALITY_POLICY = 'file-source-context-v3';
export const ARCHIVE_CLAIM_KINDS = ['event', 'state', 'plan', 'rule', 'transient'] as const;
export type ArchiveClaimKind = typeof ARCHIVE_CLAIM_KINDS[number];
export interface ArchiveFact {
 claim_kind?: string; subject: string; predicate: string; data_class: string;
 value: string; quote: string;
}
export interface ArchiveEvidence {
 policy: typeof FILE_QUALITY_POLICY;
 claim_kind: ArchiveClaimKind;
 assessed_on: string;
 source_date: string | null;
 date_quote: string | null;
 event_date_quote: string | null;
 raw_value: string;
 predicate: string;
 data_class: string;
 value: string;
}
export type ArchiveQuality = { evidence: ArchiveEvidence; hold: null } | { evidence: null; hold: 'transient_or_low_value' | 'historical_context_missing' };

/** A title/date/empty form header alone does not express useful archived knowledge.
 * Match only an exact contiguous excerpt; never strip conditions from a claim. */
export function archiveMetadataOnly(value:string,text:string):boolean {
 const norm=(s:string)=>s.replace(/\s+/gu,' ').trim();
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 if(/^\[Page 1\]$/.test(lines[0]??''))lines.shift();
 const header=lines.slice(0,5);
 const dateLabel=/^(?:\*{1,2})?(?:Stand|Dokumentstand|Dokumentdatum|Document date|Datum|Date|As of|Planung vom)(?:\*{1,2})?\s*:/iu;
 const metadata=(line:string,index:number)=>
  (index===0 && (line.startsWith('#')||dateLabel.test(header[1]??'')))
  || /^(?:#{1,6}\s*)?(?:\*{1,2})?(?:Stand|Dokumentstand|Dokumentdatum|Document date|Datum|Date|As of|Planung vom|Uhrzeit|Time)(?:\*{1,2})?\s*:\s*[\d\s.\-:/]*(?:von\s*bis)?\s*$/iu.test(line)
  || /^(?:Anzahl\s+(?:Teilnehmer|Teilnehmende)|Participants?)\s*:\s*\d+(?:\s*[-–]\s*\d+)?\s*$/iu.test(line)
  || /^(?:von\s*bis|\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/iu.test(line);
 for(let start=0;start<header.length;start++)for(let end=start;end<Math.min(header.length,start+4);end++){
  const span=header.slice(start,end+1);
  if(norm(span.join(' '))===norm(value)&&span.every((line,i)=>metadata(line,start+i)))return true;
 }
 return false;
}

function isoDate(raw: string): string | null {
 const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) ?? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
 if (!parts) return null;
 const iso = raw.includes('-') ? raw : `${parts[3]}-${parts[2]}-${parts[1]}`;
 const date = new Date(iso + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** A contiguous header, at most five nonempty lines after the first virtual page
 * marker. One title is allowed; body text or a new page closes the header. */
export function archiveSourceDate(text: string, asOf = new Date().toISOString().slice(0,10)): { date: string | null; quote: string | null } {
 if (!isoDate(asOf)) throw Error('invalid_archive_cutoff');
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 if (/^\[Page 1\]$/.test(lines[0]??'')) lines.shift();
 const matches:Array<{date:string;quote:string}>=[];
 for (const [index,line] of lines.slice(0,5).entries()) {
  const m=/^(?:#{1,6}\s*)?(?:Stand|Dokumentstand|Dokumentdatum|Document date|Datum|Date|As of|Planung vom)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\s*$/iu.exec(line);
  if (m) {
   const date=isoDate(m[1]);
   if (!date || date>asOf) return {date:null,quote:null};
   matches.push({date,quote:line});continue;
  }
  if (/^(?:Autor|Author|Version|Projekt|Project|Titel|Title)\s*:/iu.test(line)) continue;
  if (index===0 && line.length<=120 && !/[.!?]$/.test(line) && !/^\[Page/.test(line)) continue;
  break;
 }
 return new Set(matches.map(m=>m.date)).size===1 ? matches[0] : {date:null,quote:null};
}

/** A quoted historical date/period can support an event when the header is absent.
 * It remains a quote, never an invented document date or validity interval. */
function eventDateQuote(raw:string,asOf:string):string|null {
 const full=[...raw.matchAll(/(?<!\d)(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})(?!\d)/g)].map(m=>m[1]);
 if (full.length) return full.every(s=>{const d=isoDate(s);return d!==null&&d<=asOf;}) ? full[0] : null;
 const years=[...raw.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>m[0]);
 return years.length && years.every(y=>y<=asOf.slice(0,4)) ? years[0] : null;
}

export function renderArchiveEvidence(e: Omit<ArchiveEvidence,'value'>): string {
 if(e.policy!==FILE_QUALITY_POLICY||!ARCHIVE_CLAIM_KINDS.includes(e.claim_kind)||e.claim_kind==='transient'||!e.raw_value.trim()||e.raw_value.length>500||!isoDate(e.assessed_on))throw Error('invalid_archive_evidence');
 if(e.source_date ? archiveSourceDate(e.date_quote??'',e.assessed_on).date!==e.source_date : e.date_quote!==null||['plan','state'].includes(e.claim_kind))throw Error('invalid_archive_date');
 if(e.event_date_quote!==null && (e.claim_kind!=='event'||eventDateQuote(e.raw_value,e.assessed_on)!==e.event_date_quote))throw Error('invalid_archive_event_date');
 if(e.claim_kind==='event'&&!e.source_date&&!e.event_date_quote)throw Error('invalid_archive_event_date');
 if(e.predicate!=='has_context'||e.data_class!=='context')throw Error('invalid_archive_context_class');
 const label={event:'dokumentiertes Ereignis',state:'damaliger Zustand; heutige Gültigkeit ungeprüft',plan:'damaliger Plan; Umsetzung nicht belegt',rule:'dokumentierte Regel; heutige Gültigkeit ungeprüft'}[e.claim_kind];
 return `Archivquelle (${e.source_date?'Stand laut Dokument: '+e.source_date:'Quellendatum unbekannt'}; ${label}): ${e.raw_value}`;
}

export function assessArchiveFact(fact: ArchiveFact, text: string, asOf = new Date().toISOString().slice(0,10)): ArchiveQuality {
 if(!isoDate(asOf))throw Error('invalid_archive_cutoff');
 if(!ARCHIVE_CLAIM_KINDS.includes(fact.claim_kind as ArchiveClaimKind))throw Error('file_claim_kind_required');
 const raw=fact.value.replace(/\s+/gu,' ').trim();
 const operational=/\b(?:pid|ppid|process_id|request_id|run_id|duration_ms|uptime|exit_code|returncode)\s*[:=]\s*[\w.-]+/iu.test(raw)
  || /^\s*["'](?:name|version|scripts|dependencies|devDependencies|lockfileVersion)["']\s*:/u.test(raw)
  || /\b(?:bitte|please)\s+(?:führe|starte|execute|run|lösche|delete)\b/iu.test(raw);
 if(fact.claim_kind==='transient'||operational||archiveMetadataOnly(raw,text))return {evidence:null,hold:'transient_or_low_value'};
 // A conservative guard, not a complete linguistic classifier. All accepted
 // archive facts remain context; an event additionally needs temporal evidence.
 const plan=/\b(?:geplant(?:e[rmns]?)?|plan(?:e|en|t|st)|beabsichtigt(?:e[rmns]?)?|beabsichtig(?:e|en|t)|vorgesehen(?:e[rmns]?)?|zukünftig(?:e[rmns]?)?|möchte(?:n|st)?|will|wollen|soll(?:en|te|ten)?|absicht|ziel)\b/iu.test(raw)
  || /\b(?:werde|werden|wird|wirst|werdet)\b[^.!?;]{0,160}\b[\p{L}]{3,}en\s*[.!?]?$/iu.test(raw)
  || /\b(?:plan(?:s|ned|ning)?\s+to|intend(?:s|ed)?(?:\s+to)?|going\s+to|will|shall)\b/iu.test(raw);
 // Modal verbs also express contractual obligations. Preserve a rule's type;
 // an explicit intention cannot establish a rule, even with a dated header.
 const explicitIntention=/\b(?:geplant(?:e[rmns]?)?|plan(?:e|en|t|st)|beabsichtigt(?:e[rmns]?)?|beabsichtig(?:e|en|t)|möchte(?:n|st)?|absicht)\b/iu.test(raw)
  || /\b(?:plan(?:s|ned|ning)?\s+to|intend(?:s|ed|ing)?(?:\s+to)?)\b/iu.test(raw);
 if(fact.claim_kind==='rule'&&explicitIntention)return {evidence:null,hold:'historical_context_missing'};
 const kind:ArchiveClaimKind=plan&&['event','state'].includes(fact.claim_kind!)?'plan':fact.claim_kind as ArchiveClaimKind;
 const date=archiveSourceDate(text,asOf);
 const eventDate=kind==='event'?eventDateQuote(raw,asOf):null;
 if(kind==='event' && /\b(?:19|20)\d{2}\b/u.test(raw) && !eventDate)return {evidence:null,hold:'historical_context_missing'};
 if((kind==='plan'||kind==='state')&&!date.date || kind==='event'&&!date.date&&!eventDate)return {evidence:null,hold:'historical_context_missing'};
 const evidence:Omit<ArchiveEvidence,'value'>={policy:FILE_QUALITY_POLICY,claim_kind:kind,assessed_on:asOf,source_date:date.date,date_quote:date.quote,event_date_quote:eventDate,raw_value:raw,predicate:'has_context',data_class:'context'};
 return {hold:null,evidence:{...evidence,value:renderArchiveEvidence(evidence)}};
}
