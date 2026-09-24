import type {ContractInventory,ContractItem} from '$lib/ledger-contracts.js';

/** Reviewed, private bindings. Shared payment processors must use an exact sender. */
export interface ContractMailProfile {
 id:string; reviewOnly:boolean; accounts:string[]; senders:string[]; domains:string[]; products:string[]; exclude:string[];
}
export interface ContractMailInput {id:number;date:string;sender:string;subject:string;body:string;account:string;complete:boolean;hash:string;eligible:boolean;}
export interface ContractMailEvent {
 id:string; mailId:number; sourceHash:string; date:string; contractId:string|null;
 kind:'cancelled'|'invoice'|'renewal'|'refund'|'review'; reason:string|null;
 until:string|null; amount:string|null; subject:string;
}
export interface ContractMailNotice {mailId:number;contractId:string|null;label:string;reason:string;historical?:boolean;}
const norm=(s:string)=>s.normalize('NFKC').replace(/[\u00ad\u034f\u200b-\u200f\ufeff]/g,'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const clean=(s:string)=>norm(s.replace(/https?:\/\/\S+/g,' '));
const phrase=(s:string,p:string)=>(' '+s.replace(/[^\p{L}\p{N}+]+/gu,' ')+' ').includes(' '+norm(p).replace(/[^\p{L}\p{N}+]+/gu,' ')+' ');
export const mailAccount=(s:string)=>s.replace(/-history$/,'');
export function senderAddress(s:string):string|null {
 const m=s.trim().match(/^(?:[^<>]*<)?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+)>?$/i);return m?.[1].toLowerCase()??null;
}
export function validDay(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const deMonths=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember'];
export function parseContractDay(raw:string):string|null {
 const s=norm(raw).replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag),?\s+/,'');
 let parts=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|$)/);let day:string|null=parts?parts[0].slice(0,10):null;
 if(!day){parts=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);if(parts)day=`${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;}
 if(!day){parts=s.match(/^(\d{1,2})\.\s+([a-zä]+)\s+(\d{4})\b/);if(parts){const month=deMonths.indexOf(parts[2]);if(month>=0)day=`${parts[3]}-${String(month+1).padStart(2,'0')}-${parts[1].padStart(2,'0')}`;}}
 if(!day){parts=s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);if(parts){const month=months.findIndex(m=>m===parts![1]||m.slice(0,3)===parts![1]);if(month>=0)day=`${parts[3]}-${String(month+1).padStart(2,'0')}-${parts[2].padStart(2,'0')}`;}}
 return day&&validDay(day)?day:null;
}
function labelledDate(body:string,kind:string):string|null {
 const re=kind==='cancelled'?/(?:will expire on|access (?:will )?ends on|access (?:to .{1,50}? )?until|active until|expires on|endet (?:am|zum)|läuft (?:am|zum)|läuft bis|gültig bis|zum ende (?:des|der) .{0,20}? am)\s*:?[ \t]*/g:/(?:next (?:billing|renewal|payment) date|renews on|verlängerungsdatum|nächste (?:zahlung|verlängerung)|fällig am|due (?:date|on))\s*:?[ \t]*/g;
 const dates=[...body.matchAll(re)].map(m=>parseContractDay(body.slice(m.index!+m[0].length,m.index!+m[0].length+70))).filter((v):v is string=>!!v);
 return new Set(dates).size===1?dates[0]:null;
}
function amountIn(body:string):string|null {
 // Only explicitly labelled totals; never add line items, mix currencies, or infer a bank payment.
 const matches=[...body.matchAll(/\b(?:gesamtbetrag|planpreis|amount due|amount paid|invoice total|total(?!\s+excluding))\s*:?\s*(?:(CHF|EUR|USD|GBP|\$|€|£)\s*)?([0-9]+(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(CHF|EUR|USD|GBP|\$|€|£)?/gi)];
 const values=matches.flatMap(m=>{const c=m[1]??m[3];if(!c||c==='$')return [];const currency=({'€':'EUR','£':'GBP'} as Record<string,string>)[c]??c.toUpperCase();return [`${m[2]} ${currency}`];});
 return new Set(values).size===1?values[0]:null;
}
const cancellation=/(?:subscription|membership|abonnement|mitgliedschaft|abo|vertrag).{0,90}?(?:has been (?:successfully )?cancelled|has been (?:successfully )?canceled|was cancel[le]{1,3}d|is (?:now )?cancel[le]{1,3}d|wurde (?:erfolgreich )?gekündigt|wird gekündigt|wurde beendet)|(?:we(?:'ve| have) cancel[le]{1,3}d|wir haben (?:dein|ihr|ihre|deine)).{0,85}?(?:subscription|membership|abonnement|mitgliedschaft|abo|gekündigt)|(?:ihre|deine) kündigung.{0,60}?(?:bestätigt|bearbeitet)|(?:wir bestätigen|hiermit bestätigen wir) (?:ihre|deine|die) kündigung|auto(?:matic)?[ -]renewal (?:has been |is )(?:turned off|disabled)/;
const candidateSubject=/(?:kündigung|cancel[la]{1,3}tion|subscription.{0,40}cancel|(?:abo|abonnement|vertrag).{0,60}gekündigt|mitgliedschaft.{0,40}beendet|invoice|rechnung|receipt|zahlungsbeleg|abonnement.{0,60}verlängert|subscription.{0,60}renewed|refund|rückerstattung)/;
export function contractMailCandidate(subject:string){return candidateSubject.test(norm(subject));}

export function detectContractEvent(mail:ContractMailInput,profiles:ContractMailProfile[]):Omit<ContractMailEvent,'id'>|null {
 if(!mail.eligible||!contractMailCandidate(mail.subject))return null;
 const subject=clean(mail.subject),body=clean(mail.body),text=subject+' '+body;
 const cancel=/(?:cancel|kündig|gekündigt|beendet)/.test(subject)&&(cancellation.test(subject)||cancellation.test(body.slice(0,1500)));
 const refund=/refund|rückerstattung/.test(subject);
 const renewal=/(?:subscription|abonnement).{0,60}(?:has been renewed|was renewed|wurde verlängert)/.test(subject);
 const invoice=/\b(?:invoice|rechnung|receipt|zahlungsbeleg)\b/.test(subject);
 const pendingCancellation=/(?:subscription|membership|abonnement|abo|vertrag).{0,60}(?:cancel|gekündigt|beendet)|cancellation (?:confirmation|request)|kündigungsbestätigung|bestätigung.{0,40}kündigung/.test(subject);
 if(!cancel&&!refund&&!renewal&&!invoice&&!pendingCancellation)return null;
 const address=senderAddress(mail.sender),domain=address?.split('@')[1];
 const vendor=profiles.filter(p=>!!address&&(p.senders.includes(address)||!!domain&&p.domains.includes(domain)));
 // Prefer a named product in the subject; cross-selling in a footer must not change identity.
 const identity=vendor.some(p=>p.products.some(t=>phrase(subject,t)))?subject:text;
 const matches=vendor.filter(p=>p.accounts.includes(mailAccount(mail.account))&&p.products.some(t=>phrase(identity,t))&&!p.exclude.some(t=>phrase(identity,t)));
 // Unknown invoices are not enough to invent a new subscription. Clear, unbound cancellations are visible exceptions.
 if(!vendor.length&&!cancel)return null;
 const p=matches.length===1?matches[0]:null;
 let reason=p?null:matches.length>1?'Mehrere Verträge passen.':vendor.length?'Produkt oder Mailkonto nicht eindeutig zugeordnet.':'Anbieter noch nicht sicher zugeordnet.';
 if(p?.reviewOnly)reason='Dieser Posten kann mehrere Verträge umfassen; Änderung bitte zuordnen.';
 if(!mail.complete)reason='Vollständiger Mailtext fehlt; keine automatische Änderung.';
 if(!Number.isFinite(Date.parse(mail.date))||Date.parse(mail.date)>Date.now()+86_400_000)reason='Maildatum fehlt oder liegt in der Zukunft.';
 if(/^(?:re:|fw:|fwd:|aw:|wg:)/.test(subject)||/original message|ursprüngliche nachricht|forwarded message/.test(body))reason='Weitergeleitete oder zitierte Nachricht prüfen.';
 if(/(?:not|never|nicht).{0,25}(?:cancelled|canceled|gekündigt)|could not cancel|konnte.{0,20}nicht.{0,20}kündigen/.test(body.slice(0,1500)))reason='Widersprüchliche Kündigungsaussage.';
 if(cancel&&/(?:if|when|wenn) (?:your|dein|ihr|sie).{0,80}(?:cancelled|canceled|gekündigt)/.test(body.slice(0,1500)))reason='Bedingte Kündigungsaussage statt eindeutiger Bestätigung.';
 if(!cancel&&!invoice&&!renewal&&!refund)reason='Kündigungsanfrage ist noch keine eindeutige Bestätigung.';
 const kind=reason?'review':cancel?'cancelled':refund?'refund':renewal?'renewal':'invoice';
 return {mailId:mail.id,sourceHash:mail.hash,date:mail.date,contractId:p?.id??(vendor.length===1?vendor[0].id:null),kind,reason,until:labelledDate(body,kind),amount:amountIn(body),subject:mail.subject.slice(0,240)};
}

export function projectContractEvents(base:ContractInventory,events:ContractMailEvent[]) {
 const inventory=structuredClone(base),notices:ContractMailNotice[]=[],changed=new Set<string>();
 const cutoff=new Map(inventory.items.map(i=>[i.id,Math.max(...i.evidence.map(e=>Date.parse(e.date+'T23:59:59Z')))]));
 const byId=new Map(inventory.items.map(i=>[i.id,i]));
 const ordered=[...events].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
 for(const e of ordered){
  const item=e.contractId?byId.get(e.contractId):null;
  const note=(reason:string)=>notices.push({mailId:e.mailId,contractId:item?.id??null,label:item?.label??e.subject,reason,historical:!item&&Date.parse(e.date)<Date.parse(base.as_of+'T00:00:00Z')});
  // Reviewed base sources are already accounted for; late arrival time is never chronology.
  if(base.items.some(i=>i.evidence.some(p=>p.kind==='mail'&&p.id===String(e.mailId))))continue;
  if(item&&Date.parse(e.date)<=(cutoff.get(item.id)??0)){
   if(item.status==='cancelled'&&e.kind==='cancelled')item.evidence.push({kind:'mail',id:String(e.mailId),sha256:e.sourceHash,label:e.subject,date:e.date.slice(0,10),note:'Ältere Kündigungsbestätigung ergänzt den Belegverlauf. Der neuere Prüfstand bleibt erhalten.'});
   continue;
  }
  if(e.kind==='review'||!item){note(e.reason??'Vertrag noch nicht zugeordnet.');continue;}
  if(e.kind==='refund'){note('Erstattung belegt; Vertragsstatus und Bankabgleich gesondert prüfen.');continue;}
  const evidence={kind:'mail' as const,id:String(e.mailId),sha256:e.sourceHash,label:e.subject,date:e.date.slice(0,10),note:e.kind==='cancelled'?'Kündigungsbestätigung; Laufzeitende nur soweit ausdrücklich belegt.':'Anbieterbeleg; noch kein Abgleich mit einer Kontobuchung.'};
  item.evidence.unshift(evidence);
  if(e.kind==='cancelled'){
   const knownEnd=item.status==='cancelled'&&item.timing?.basis==='documented'?item.timing:null;
   item.status='cancelled';item.priority='low';item.summary='Kündigung per Mail bestätigt.';
   item.timing=e.until?{date:e.until,label:'Bestätigtes Laufzeitende',basis:'documented'}:knownEnd;
   item.next_step=item.timing?'Restlaufzeit nutzen; spätere Abbuchungen gegenprüfen.':'Laufzeitende im Anbieterkonto prüfen; in der Bestätigung nicht eindeutig datiert.';
   item.unknowns=item.unknowns.filter(q=>!/kündigungsstatus|kündigung bestätigt|ob.*gekündigt/i.test(q));
  }else if(item.status==='cancelled'){
   note('Neuer Abrechnungsbeleg trotz Kündigung; kann Restlaufzeit oder Nutzung betreffen. Kündigung bleibt erhalten.');
  }else{
   if(e.amount)item.cost=e.amount+' laut Anbieterbeleg';
   item.summary=e.kind==='renewal'?'Verlängerung per Mail belegt.':'Neuer Abrechnungsbeleg eingegangen.';
   if(e.until)item.timing={date:e.until,label:'Datum laut Anbieterbeleg',basis:'documented'};
   item.next_step='Anbieterbeleg mit Kontobewegung abgleichen; eine Mail allein bestätigt keine Bankzahlung.';
  }
  cutoff.set(item.id,Date.parse(e.date));changed.add(item.id);
 }
 return {inventory,notices,changed:[...changed]};
}
