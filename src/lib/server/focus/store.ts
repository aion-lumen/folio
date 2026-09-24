import {cartaFocus} from './carta.js';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getFolioDbPath,isDemoVaultActive} from '../env.js';
import {getFolioDb} from '../folio-db/init.js';
import {careerTrackerPath,parseCartaTrackerSource,readCartaTracker} from '../career/carta-tracker.js';
import {calendarFocusStatus} from './calendar-status.js';
import {state as calendarState} from '../calendar/store.js';
import {sources as calendarSources,recordedCalendarSourceIds} from '../calendar/planning.js';
export type FocusItem={id:string;title:string;recommendation:string;why:string;priority:number;deadline?:string;href:string;state:'decide'|'waiting'|'done';facts?:string[];aliases?:string[];briefing?:Array<{text:string;source:string;checkedAt:string;kind:'source'|'assessment'|'open'}>;trackerMatch?:string;sourceNote:string};
export type FocusView=FocusItem&{evidence:Array<{id:string;text:string;status:string;source:string}>;revision:string;mode:string;snoozeUntil?:string;nudge:string;lastNote?:string};
function db(){if(isDemoVaultActive())throw new Error('Im Demo-Vault nicht verfügbar.');const d=getFolioDb();d.exec('CREATE TABLE IF NOT EXISTS focus_events(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,revision TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,until_at TEXT,at TEXT NOT NULL)');return d;}
export function loadFocus():{items:FocusView[];warning:string}{
 if(isDemoVaultActive())return {items:[],warning:'Im Demo-Vault nicht verfügbar.'};
 const path=join(dirname(getFolioDbPath()),'focus.json');if(!existsSync(path))return {items:[],warning:'Prioritäten noch nicht eingerichtet.'};
 const config=JSON.parse(readFileSync(path,'utf8')) as {items:FocusItem[];trackerPath?:string};
 let tracker:Array<Record<string,unknown>>=[],warning='';
 if(config.trackerPath)try{tracker=(config.trackerPath===careerTrackerPath()?readCartaTracker():parseCartaTrackerSource(readFileSync(config.trackerPath,'utf8'),config.trackerPath)).positions;}catch{warning='Carta-Tracker nicht lesbar; Status ist möglicherweise unvollständig.';}
 const d=db();
 const calendar=config.items.some(i=>i.href.startsWith('/calendar?'))?calendarState():null;
 const sources=calendar?calendarSources():[],recorded=calendar?recordedCalendarSourceIds(calendar.events.filter(e=>e.status!=='cancelled')):new Set<string>();
 const items=[...cartaFocus(tracker,config.items),...config.items].map(original=>{
  const calendarStatus=calendar?calendarFocusStatus(original,sources,calendar,recorded):null;
  const item=calendarStatus?.item??original;
  const evidence=(item.facts??[]).flatMap(id=>{const f=d.prepare("SELECT fact_id id,value_text text,status,source_ref source FROM memory_facts WHERE fact_id=? AND status IN ('candidate','confirmed')").get(id) as FocusView['evidence'][number]|undefined;return f?[f]:[];});
  for(const [index,entry] of (item.briefing??[]).slice(0,12).entries()){if(typeof entry.text==='string'&&typeof entry.source==='string')evidence.push({id:'briefing:'+item.id+':'+index,text:entry.text.slice(0,1600),status:(entry.kind==='assessment'?'Einschätzung':entry.kind==='open'?'Offen':'Quellenauszug')+' · Stand '+entry.checkedAt,source:entry.source.slice(0,500)});}
  if(calendarStatus)evidence.push(calendarStatus.evidence);
  let state=calendarStatus?.mode??item.state,recommendation=item.recommendation,href=item.href;
  if(item.trackerMatch){const matches=tracker.filter(t=>[String(t.company)+'|'+String(t.title),String(t.company)+'|'+String(t.url)].includes(item.trackerMatch!));if(matches.length===1){const t=matches[0];try{const link=new URL(String(t.url));if(link.protocol==='https:'&&!link.username&&!link.password)href=link.href;}catch{}evidence.push({id:'carta:'+item.id,text:String(t.note??''),status:'Carta operativ',source:'Carta-Tracker'});if(t.status==='applied'){state='waiting';recommendation='Bewerbung versandt. Auf Rückmeldung warten; keine erneute Bewerbung vorbereiten.';}if(t.status==='skip'){state='done';recommendation='Im Carta-Tracker abgeschlossen.';}}}
  const revision=createHash('sha256').update(JSON.stringify({item,evidence,state,recommendation})).digest('hex');
  const last=d.prepare('SELECT * FROM focus_events WHERE item_id=? AND revision=? ORDER BY at DESC,rowid DESC LIMIT 1').get(item.id,revision) as {action:string;until_at:string;note:string}|undefined;
  const latestNote=d.prepare("SELECT note FROM focus_events WHERE item_id=? AND revision=? AND trim(note)<>'' ORDER BY at DESC,rowid DESC LIMIT 1").get(item.id,revision) as {note:string}|undefined;
  let mode:string=state;if(last?.action==='start')mode='working';if(last?.action==='wait')mode=last.until_at&&last.until_at<=new Date().toISOString()?'decide':'waiting';if(last?.action==='done')mode='done';if(last?.action==='snooze'&&last.until_at>new Date().toISOString())mode='snoozed';
  if(calendarStatus)mode=calendarStatus.mode;
  const delayed=d.prepare("SELECT count(*) n FROM focus_events WHERE item_id=? AND action='snooze'").get(item.id) as {n:number};
  const nudge=last?.action==='wait'&&mode==='decide'?'Die vereinbarte Wartezeit ist abgelaufen. Rückmeldung prüfen oder nächsten Kontakt festlegen.':delayed.n>=2&&mode==='decide'?'Schon zweimal verschoben. Jetzt einen konkreten nächsten Schritt wählen oder den Vorrang bewusst ändern.':item.deadline&&item.deadline<new Date().toISOString().slice(0,10)&&!['done','waiting'].includes(mode)?'Frist überschritten. Status und nächsten Schritt jetzt klären.':'';
  return {...item,href,state,recommendation,evidence,revision,mode,snoozeUntil:last?.until_at,lastNote:latestNote?.note,nudge};
 }).sort((a,b)=>a.priority-b.priority||(a.deadline??'9999').localeCompare(b.deadline??'9999'));
 return {items,warning};
}
export function recordFocus(id:string,revision:string,action:string,note:string){
 if(!['start','wait','done','snooze','reopen'].includes(action))throw new Error('Diese Aktion ist nicht freigeschaltet.');
 const item=loadFocus().items.find(i=>i.id===id);if(!item||item.revision!==revision)throw new Error('Der Kontext hat sich geändert. Bitte neu laden.');
 if(['done','wait'].includes(action)&&!note.trim())throw new Error('Bitte Ergebnis oder erwartete Rückmeldung kurz festhalten.');
 const at=new Date().toISOString(),until=action==='snooze'?new Date(Date.now()+86400000).toISOString():action==='wait'?new Date(Date.now()+7*86400000).toISOString():null;
 db().prepare('INSERT INTO focus_events VALUES (?,?,?,?,?,?,?)').run(randomUUID(),id,revision,action,note.slice(0,1000),until,at);
 return loadFocus();
}
