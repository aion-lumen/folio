import type { ExecutionProfile } from '$lib/types/execution-profile.js';
import { isDemoVaultActive, getLmStudioBaseUrl } from '../env.js';
import { hasModuleCapability } from '../modules/index.js';
import { getCartaPosition, reconcileRecentRejections, searchCartaPositions } from '../career/rejection-reconcile.js';
import { approvalView, rejectionApprovals } from '../career/rejection-approval.js';

export interface LocalCareerToolResult {
 name?: 'positions.search' | 'positions.get' | 'positions.reconcile_rejections';
 args?: Record<string, unknown>;
 result?: unknown;
 text: string;
}

const rejectionTopic = /absag|rejection|abgelehnt/iu;
const rejectionAction = /prüf|pruef|vergleich|abgleich|aktualis|korrig|nachzieh|nachtrag|eintrag|einzutragen|einpfleg|ergänz|ergaenz|aufnehm|aufnehmen|übernehm|uebernehm|hinzufüg|hinzufueg|check|reconcile|update|record|\b(?:trag|trage|trägst|add)\b/iu;
const receivedRejections = /bekommen|erhalten|eingegangen|angekommen|empfangen|received|arrived|\b(?:letzte[nrms]?|vergangene[nrms]?|neue[nrms]?|neueste[nrms]?|aktuelle[nrms]?|recent|latest|last|past|seit|heute|gestern)\b/iu;

/** A request to list received mail is read-only; even an update request only
 * prepares the existing owner-approved change card. */
export function careerRejectionMode(message: string): 'preview' | 'read_only' {
 return rejectionAction.test(message) && !/\b(?:nur|only)\b|\b(?:nicht|nichts|keine)\s+(?:ändern|aendern|eintragen|übernehmen|speichern)|\b(?:do not|don't)\b/iu.test(message) ? 'preview' : 'read_only';
}

/** Bounded rolling windows. Do not silently substitute fourteen days when a
 * different, unsupported period was requested. An unspecified period is 14 days. */
export function rejectionLookbackDays(message: string): number | null {
 if (/\b(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|gestern|heute|vorgestern|kalenderwoche|monat\p{L}*|jahr\p{L}*|yesterday|today|month\p{L}*|year\p{L}*)\b|\d{4}-\d{2}|\d{1,2}\.\d{1,2}\./iu.test(message)) return null;
 const periods = [...message.matchAll(/\b(?:letzte[nrms]?|vergangene[nrms]?|past|last)\s+(?:(\d+|\p{L}+)\s*)?(wochen?|tag(?:e|en|es)?|weeks?|days?)\b/giu)];
 if (!periods.length) return /\b(?:woche\p{L}*|tag(?:e|en|es)?|weeks?|days?|seit|since|zwischen|between)\b/iu.test(message) ? null : 14;
 if (periods.length !== 1) return null;
 const [, quantity, unit] = periods[0];
 const words: Record<string, number> = {ein:1,eine:1,einer:1,einen:1,one:1,zwei:2,two:2,drei:3,three:3,vier:4,four:4,fünf:5,fuenf:5,five:5,sechs:6,six:6,sieben:7,seven:7,acht:8,eight:8,neun:9,nine:9,zehn:10,ten:10};
 const count = quantity ? (/^\d+$/.test(quantity) ? Number(quantity) : words[quantity.toLocaleLowerCase('de-CH')]) : /^(?:woche|tag|tages|week|day)$/iu.test(unit) ? 1 : NaN;
 const days = count * (/woche|week/iu.test(unit) ? 7 : 1);
 return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
}

export function localCareerToolIntent(message: string): 'reconcile' | 'get' | 'search' | null {
 const value=message.toLocaleLowerCase('de-CH');
 if (rejectionTopic.test(value) && (rejectionAction.test(value) || receivedRejections.test(value)))return 'reconcile';
 if (/\b(?:listing|rejection):[a-f0-9]{16,64}\b/u.test(value))return 'get';
 if (/positions?[\s_-]*tracker|positionstracker|bewerbung|absagen|application|rejection|carta.*(?:tracker|position|zugriff)|tracker.*(?:position|stelle)|(?:such|find).*stelle/iu.test(value))return 'search';
 return null;
}

/** Only short follow-ups inherit the last user's career topic. Assistant prose
 * cannot authorise a write or turn an unrelated question into a tracker query. */
export function careerMessage(message:string,history:{role:string;content:string}[]):string {
 if(localCareerToolIntent(message))return message;
 const previous=history.filter(h=>h.role==='user').at(-1)?.content;
 if(!previous||!localCareerToolIntent(previous))return message;
 if(/^(?:und|wie|was).*\b(?:bei|zu|mit)\b.{1,100}[?.]?$/iu.test(message.trim()))return `Bewerbung ${message}`;
 if(/^(?:ja[, ]*)?(?:bitte )?(?:prüfen|abgleichen|aktualisieren|korrigieren)(?: bitte)?[.!]?$/iu.test(message.trim()))return localCareerToolIntent(previous)==='reconcile'?previous:`Absagen zu meinen Bewerbungen der letzten zwei Wochen prüfen`;
 if(/^(?:ja[, ]*)?(?:bitte|bestätigt|bestätigen|freigeben|übernehmen|anwenden)[.!]?$/iu.test(message.trim()))return 'Positions-Tracker Freigabehilfe';
 return message;
}

export function careerSearchQuery(message:string):string {
 if(/(?:was|kennst|zugang|zugriff|access|what).*(?:positions?[\s_-]*tracker|positionstracker)/iu.test(message)||/positions-tracker\.html/iu.test(message))return '';
 const after=message.match(/(?:\bbei\b|\bzu\b|\bnach\b|\babout\b|\bfor\b)\s+(.+)/iu)?.[1]??message;
 return after.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x&&!new Set(['welche','welcher','welchen','wurden','wurde','abgelehnt','erfasst','schon','noch','hat','sich','etwas','geändert','kannst','du','aktualisieren','aktualisiere','was','wie','steht','ist','sind','zeig','zeige','mir','bitte','suche','finde','im','in','den','dem','der','die','das','meine','meinen','meiner','meinem','alle','allen','offen','offene','offenen','aktuell','aktuellen','bisher','bereits','letzten','zum','zur','mit','von','bei','nach','zu','und','position','positionen','positions','positions-tracker','positionstracker','tracker','bewerbung','bewerbungen','absage','absagen','habe','ich','bekommen','status','stand','the','my','applications','application','rejections','show','me']).has(x.toLocaleLowerCase('de-CH'))).join(' ').slice(0,200);
}

const safe=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]#])/g,'\\$1');
function positionText(row:ReturnType<typeof getCartaPosition>['position']):string {
 if(!row)return 'Diesen Eintrag finde ich im aktuellen Tracker nicht.';
 const status=row.effectiveStatus==='rejected'?'Absage erfasst':row.status==='applied'?'Bewerbung versandt':row.status==='skip'?'Zurückgestellt / ausgeschlossen':row.status==='review'?'In Prüfung':'Offen';
 return `**${safe(row.company)} – ${safe(row.title)}**\n${status}${row.submittedAt?` · eingereicht ${safe(row.submittedAt)}`:''}${row.rejection?` · Absage ${safe(row.rejection.date)}`:''}${row.note?`\n${safe(row.note)}`:''}`;
}

export async function runLocalCareerTool(message:string,profile:ExecutionProfile,now=new Date(),signal?:AbortSignal,progress?:(text:string)=>void):Promise<LocalCareerToolResult|null> {
 const intent=localCareerToolIntent(message);if(!intent)return null;
 let loopback=false;try{loopback=['localhost','127.0.0.1','[::1]'].includes(new URL(getLmStudioBaseUrl()).hostname);}catch{/* fail closed */}
 if(process.env.FOLIO_AGENT_MOCK_RESPONSE!==undefined||isDemoVaultActive()||profile.endpoint!=='local'||profile.verification!=='local-artifact'||!loopback||!hasModuleCapability('career','cases.read'))return {text:'Der Positions-Tracker ist hier nur im privaten Folio mit verifiziert lokalem Modell verfügbar. Ich habe keine Carta-Datei gelesen.'};
 if(/freigabehilfe/iu.test(message))return {text:'Zum Speichern nutze bitte „Absagen im Tracker bestätigen“ in der Ergebniskarte des Abgleichs. Eine Chat-Antwort allein ändert den Tracker nicht. Falls die Karte fehlt, starte „Absagen der letzten zwei Wochen abgleichen“.'};
 if(intent==='reconcile') {
  const days=rejectionLookbackDays(message),mode=careerRejectionMode(message);
  if(days===null)return {text:'Für den Absagenabgleich kann ich die letzten 1 bis 90 Tage prüfen. Bitte nenne etwa „Absagen der letzten 14 Tage mit dem Positions-Tracker abgleichen“. Ein anderer Zeitraum wurde nicht stillschweigend geprüft.'};
  const toExclusive=now.toISOString(),fromInclusive=new Date(+now-days*86400_000).toISOString();
  const report=await reconcileRecentRejections({fromInclusive,toExclusive,modelId:profile.modelId,signal,progress});
  signal?.throwIfAborted();
  const plan=mode==='preview'&&hasModuleCapability('career','events.write')?rejectionApprovals().prepare(report):null;
  const review=plan?approvalView(plan):null;
  const already=report.findings.filter(f=>f.eventType==='rejection'&&f.status==='NO_CHANGE').length;
  const unclear=report.summary.UNCLEAR+report.summary.EVIDENCE_CONFLICT;
  const date=new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'});
  const rejections=report.findings.filter(f=>f.eventType==='rejection').sort((a,b)=>Date.parse(b.mailTime)-Date.parse(a.mailTime));
  const list=rejections.map(f=>`- ${date.format(new Date(f.mailTime))} · **${safe(f.eventEmployer??'Arbeitgeber nicht eindeutig')}** – ${safe(f.eventRole??'Stelle in der Mail nicht genannt')} · ${f.reasonCode==='forwarded_rejection_requires_review'?'Weitergeleitet; Empfängerzuordnung offen':f.status==='NO_CHANGE'?'bereits im Tracker':f.status==='EXACT_PROPOSAL'?'im Tracker zu ergänzen':'Zuordnung prüfen'}`).join('\n');
  const text=`Ich habe ${report.summary.prefilterCandidates-(report.candidateSelection.unverifiedLocalMessages??0)} von ${report.summary.prefilterCandidates} lokal erfassten Mails der letzten ${days} Tage geprüft (${date.format(new Date(fromInclusive))} bis ${date.format(now)}): ${already} Absagen bereits erfasst, ${report.summary.EXACT_PROPOSAL} eindeutige Ergänzungen und ${unclear} Fälle mit Klärungsbedarf.${report.candidateSelection.unverifiedLocalMessages?` ${report.candidateSelection.unverifiedLocalMessages} Modellprüfungen blieben offen und wurden nicht übernommen.`:''}${report.summary.STALE_REVISION?' Der Tracker hat sich während der Prüfung geändert. Bitte erneut abgleichen.':''}\n\n${list||'In den geprüften Mails wurde keine Absage gefunden.'}\n\n${review?'Die Freigabekarte zeigt die konkreten Ergänzungen. Wo die Stelle aus der Mail nicht eindeutig hervorgeht, bestätigst du zuerst die Zuordnung zur angezeigten Bewerbung. Erst „Absagen im Tracker bestätigen“ schreibt sie in Carta; die versandte Bewerbung bleibt erhalten.':'Der Tracker wurde nicht verändert.'}\n\n${report.coverage.some(c=>c.state==='unknown'||c.state==='source_gap')?'Dies prüft vorhandene lokale Mails. Die Vollständigkeit aller Postfächer ist für dieses Zeitfenster nicht nachgewiesen. Neue Mails bitte über den vorhandenen Mail-Import einlesen.':'Die geprüfte Postfachabdeckung ist im Ergebnis dokumentiert.'}${report.candidateSelection.excludedMissingOrTruncated?` ${report.candidateSelection.excludedMissingOrTruncated} unvollständige oder übergroße Mailtexte konnten nicht geprüft werden.`:''}${unclear?' Unklare Treffer und ihre Mailquellen stehen unter „Klärungsbedarf“ in der Ergebniskarte.':''}`;
  return {name:'positions.reconcile_rejections',args:{fromInclusive,toExclusive,mode},result:{...report,approval:review},text};
 }
 if(intent==='get') {
  const identity=message.match(/\b(?:listing|rejection):[a-f0-9]{16,64}\b/iu)![0].toLowerCase(),result=getCartaPosition(identity);
  return {name:'positions.get',args:{identity},result,text:result.rejection?`**${safe(result.rejection.employer)} – ${safe(result.rejection.title)}**\nAbsage ${safe(result.rejection.date)}: ${safe(result.rejection.reason)}`:positionText(result.position)};
 }
 const query=careerSearchQuery(message),filter=/absag|abgelehnt|rejection/iu.test(message)?'rejected':/offene?\s+bewerb|bewerb.*offen|laufende?\s+bewerb|pending.*application/iu.test(message)?'applied':'all';
 const result=searchCartaPositions(query,query||filter!=='all'?15:5,filter);
 const intro=`Ich greife direkt auf den Carta-Positions-Tracker zu: ${result.totalPositions} Positionen und ${result.totalRejected} Einträge in der Absagehistorie.`;
 const rows=result.positions.map(p=>`- **${safe(p.company)} – ${safe(p.title)}**: ${p.effectiveStatus==='rejected'?'Absage erfasst':p.status==='applied'?'Bewerbung versandt':safe(p.status)}${p.submittedAt?` (${safe(p.submittedAt)})`:''}`);
 const historical=(query||filter==='rejected'?result.rejected:[]).filter(r=>!result.positions.some(p=>p.rejection?.identity===r.identity)).map(r=>`- **${safe(r.employer)} – ${safe(r.title)}**: Absage ${safe(r.date)}`);
 let text=result.matched===1&&query?positionText(result.positions[0]):`${intro}\n\n${[...rows,...historical].join('\n')||'Kein passender Eintrag. Bitte nenne den Arbeitgeber oder die Rolle genauer.'}`;
 if(result.truncated)text+='\n\nAuszug; mit einem Arbeitgeber oder einer Rolle kann ich gezielt suchen.';
 if(!query)text+='\n\nDu kannst mich auch bitten: „Gleiche die Absagen der letzten zwei Wochen mit dem Positions-Tracker ab.“ Eindeutige Ergänzungen bereite ich zur gemeinsamen Freigabe vor.';
 return {name:'positions.search',args:{query,filter},result,text};
}
