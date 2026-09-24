import { addMonth, expenseCategories, incomeCategories, validMonth, type HouseholdView } from '$lib/ledger-household.js';
import { contextViewEntries, readHouseholdContext } from '../modules/ledger-books/household.js';
import { incomeBranch } from '../modules/ledger-books/household-hierarchy.js';

export interface LedgerQuery {
 months: string[];
 metric: 'expenses' | 'income' | 'cashflow';
 view: HouseholdView;
 category?: string;
 explain?: boolean;
}
export type LedgerIntent = { query: LedgerQuery } | { clarification: string };
export const LEDGER_QUERY_HELP = 'Ich kann die erfassten monatlichen Ausgaben, Einnahmen und den Cashflow direkt in Ledger abfragen und Monate vergleichen. Nenne bitte den Monat und gegebenenfalls das Jahr oder eine Kategorie. Einzelne Anbieter, Konten, Tageszeiträume und Prognosen unterstützt diese direkte Abfrage noch nicht.';
const help=LEDGER_QUERY_HELP;
const financial = /ausgab|ausgeb|ausgegeb|einnahm|eingenomm|cashflow|haushalt|kontobeweg|übertr[aä]g|uebertr|versicherung|\bkosten\b|\b(?:spen[dt]|expenses?|income|insurance|cash flow|transfers?)\b/i;
const monthNames = [['januar','january','jan'],['februar','february','feb'],['märz','maerz','march'],['april','apr'],['mai','may'],['juni','june','jun'],['juli','july','jul'],['august','aug'],['september','sep','sept'],['oktober','october','okt','oct'],['november','nov'],['dezember','december','dez','dec']];
const monthPattern = new RegExp(`\\b(${monthNames.flat().join('|')})\\b(?:\\s+(20\\d{2}))?`, 'giu');
const continuationPattern=new RegExp(`^(?:und|and)\\b|^(?:im |in )?(?:${monthNames.flat().join('|')})(?: 20\\d{2})?[?!.]*$|\\bmonat (?:davor|danach)\\b|\\bmonth (?:before|after)\\b`,'iu');
const categoryPatterns: [string, RegExp][] = [
 ['home',/wohnen|energie|wohnkosten|housing/], ['insurance',/versicherung|insurance/],
 ['subscriptions',/abos?\b|telefon|subscriptions?/], ['tax',/abgaben|steuern|taxes/],
 ['equipment',/technik|anschaffungen|equipment/], ['food',/lebensmittel|drogerie|groceries|food/],
 ['leisure',/freizeit|gastronomie|leisure/], ['mobility',/mobilität|mobilitaet|mobility/],
 ['shopping',/einkauf|persönlich|shopping/], ['transfer_fees',/gebühren|gebuehren|fees/], ['unknown',/zuordnung offen|unkategorisiert|uncategorized/]
];
/** The planner may translate wording but may not silently broaden a category. */
export function ledgerRequestedCategories(message:string,history:{role:string;content:string}[]=[]):string[] {
 const expense=categoryPatterns.filter(([,pattern])=>pattern.test(message.toLowerCase())).map(([id])=>id);
 const income=incomeCategories.filter(c=>c.id==='income_rental'?/mieteinnahmen|rental income/i.test(message):message.toLowerCase().includes(c.label.toLowerCase())).map(c=>c.id);
 const own=[...expense,...income];
 if(own.length||/gesamt|total|insgesamt/i.test(message))return own;
 const previous=history.filter(h=>h.role==='user').at(-1);
 return continuationPattern.test(message)&&previous?ledgerRequestedCategories(previous.content):[];
}

/** Deliberately closed, read-only query vocabulary. Never interprets file content
 * or an assistant's previous claims as a request. Unsupported filters fail closed. */
export function ledgerQueryIntent(message: string, history: {role:string;content:string}[] = [], now = new Date()): LedgerIntent | null {
 const text = message.normalize('NFKC').trim();
 const userHistory=history.filter(h=>h.role==='user').slice(-6);
 const previous=userHistory.at(-1);
 const relative=/\bmonat (davor|danach)\b|\bmonth (before|after)\b/i.exec(text);
 const continuation=continuationPattern.test(text);
 const basis=continuation&&previous?ledgerQueryIntent(previous.content,userHistory.slice(0,-1),now):null;
 // A free-form prior question needs the language planner to retain its metric.
 if(continuation&&previous&&!basis&&looksLikeLedgerQuestion(previous.content))return null;
 const followup=Boolean(continuation&&basis);
 if (!financial.test(text) && !followup) return null;
 if (unsupportedLedgerScope(text)) return {clarification:help};
 const inherited = basis && 'query' in basis ? basis.query : undefined;
 const categoryMatches=ledgerRequestedCategories(text);
 const metric = /cash\s?flow|saldo|überschuss|surplus|übrig|uebrig|\bblieb\b|left over|\bremain(?:ed|ing)?\b|\bsave[ds]?\b/i.test(text) || /(?:einnahm|income).*(?:ausgab|expenses)|(?:ausgab|expenses).*(?:einnahm|income)/i.test(text)
  ? 'cashflow' : /einnahm|eingenomm|income/i.test(text) ? 'income' : /ausgab|ausgegeb|kosten|spen[dt]|expenses|versicherung|insurance/i.test(text) ? 'expenses' : inherited?.metric ?? 'cashflow';
 if (categoryMatches.length > 1 || categoryMatches.some(id=>metric==='cashflow'||(id.startsWith('income_')?metric!=='income':metric!=='expenses'))) return {clarification:help};
 const category = categoryMatches[0] ?? (!/gesamt|total|insgesamt/i.test(text)&&inherited?.metric===metric?inherited?.category:undefined);
 const view: HouseholdView = /brutto|kontobeweg|gross|account movements/i.test(text) ? 'accounts' : /übertr[aä]g|uebertr|transfers?/i.test(text) && category !== 'transfer_fees' ? 'transfers' : inherited?.view ?? 'household';
 // Never answer a merchant/account-specific request with an unfiltered total.
 const filterText=text.replace(monthPattern,'Monat').replace(/\b20\d{2}-(?:0[1-9]|1[0-2])\b/g,'Monat');
 if (/\b(?:an|für|for|to|von|from|aus)\s+(?!(?:den\s+|the\s+)?(?:monat|month|einnahmen|income)\b)/i.test(filterText) && !category || /\b(?:swica|wise|postfinance|sparkasse|chase|saxo|ib|rav|netflix|lidl|aldi)\b/i.test(text)) return {clarification:help};
 const current = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'Europe/Zurich'}).format(now);
 const year = Number(current.slice(0,4)), currentMonth = Number(current.slice(5,7));
 const years = [...text.matchAll(/\b(20\d{2})\b/g)].map(m=>m[1]);
 const sharedYear = new Set(years).size === 1 ? Number(years[0]) : null;
 const months = [...text.matchAll(/\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/g)].map(m=>m[1]);
 for (const match of text.matchAll(monthPattern)) {
  const m = monthNames.findIndex(names=>names.includes(match[1].toLowerCase()))+1;
  const inheritedYear=inherited?.months.length===1?Number(inherited.months[0].slice(0,4)):null;
  const y = match[2] ? Number(match[2]) : sharedYear ?? inheritedYear ?? (m > currentMonth ? year-1 : year);
  months.push(`${y}-${String(m).padStart(2,'0')}`);
 }
 if (/letzten? monat|last month/i.test(text)) months.push(addMonth(current,-1));
 else if (/diesen? monat|this month/i.test(text)) months.push(current);
 if(relative){if(!inherited||inherited.months.length!==1)return {clarification:'Auf welchen einzelnen Monat bezieht sich „davor“ oder „danach“?'};months.push(addMonth(inherited.months[0],/danach|after/i.test(relative[0])?1:-1));}
 const selected = [...new Set(months.length?months:inherited?.months??[])];
 if (!selected.length || selected.some(m=>!validMonth(m)) || selected.length > 2 || /20\d{2}-(?:00|1[3-9]|[2-9]\d)\b/.test(text)) return {clarification:help};
 if (/\bbis\b|\bthrough\b|\bbetween\b/.test(text)) return {clarification:'Bitte frage einzelne Monate oder einen Vergleich von zwei Monaten ab. Zeitraumsummen unterstützt diese direkte Abfrage noch nicht.'};
 const explain=/warum|weshalb|wieso|why|höher|teurer|gestiegen|higher/i.test(text);
 if(explain&&selected.length===1)selected.unshift(addMonth(selected[0],-1));
 return {query:{months:selected,metric,view,...(category?{category}:{}),...(explain?{explain:true}:{})}};
}

/** These requests cannot be reduced to the available monthly sums. They never
 * reach a planner or a general file agent as a substitute for the missing operation. */
export function unsupportedLedgerScope(text:string):boolean {
 const namedDay=new RegExp(`(?:\\b\\d{1,2}\\.?\\s+(?:${monthNames.flat().join('|')})\\b|\\b(?:${monthNames.flat().join('|')})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)`,'iu');
 return text.length>600 || namedDay.test(text)
  || /\b(?:bei|at)\s+\S|\bgehalt\b|\blohn\b|\bsalary\b|(?:vor)?letzte[snm]? jahr|\blast year\b|\bprevious year\b|\b(?:nach|after)\s+(?!allen\s+ausgaben|all\s+expenses)|prämie|praemie|premium|vertrag|verträge|contract|tarif|erfunden|invented|fake amount/i.test(text)
  || /lösch|delete|überweis|ueberweis|bezahle|\bpay\b|buche|umbuch|korrigier|ändere|aendere|\bchange\b|\bsend\b|\bsende\b|upload|search_files|execute|prognos|forecast|werde.*ausgeb|will.*spend|morgen|tomorrow|\bohne\b|\bnur\b|\bnicht\b|\bonly\b|excluding|except|mindestens|höchstens|höher als|größer als|kleiner als|more than|less than|wie viele|how many|anzahl|prozent|percent|anteil|kontostand|kontosal[d]?o|balance|\bUSD\b|\bGBP\b|dollar|\d{1,2}\.\d{1,2}\.|\d{4}-\d{2}-\d{2}/i.test(text);
}

/** Month authority stays in code even when a model interprets the metric. */
export function ledgerPeriodHint(message:string,history:{role:string;content:string}[],now:Date):string[]|null {
 const original=ledgerQueryIntent(message,history,now);
 if(original&&'query' in original)return original.query.months;
 if(continuationPattern.test(message)){
  // Resolve dates after a free-form financial question, without assuming its
  // metric. Non-financial intervening messages deliberately break the chain.
  const periodHistory=history.map(h=>h.role==='user'&&looksLikeLedgerQuestion(h.content)?{...h,content:'Ausgaben '+h.content}:h);
  const continued=ledgerQueryIntent(message,periodHistory,now);
  return continued&&'query' in continued?continued.query.months:null;
 }
 // Prefix only a metric, never a date; retain all user filters and date guards.
 const hinted=ledgerQueryIntent('Ausgaben '+message,history,now);
 return hinted&&'query' in hinted?hinted.query.months:null;
}

export function looksLikeLedgerQuestion(text:string,history:{role:string;content:string}[]=[]):boolean {
 return financial.test(text)||categoryPatterns.some(([,p])=>p.test(text.toLowerCase()))||/\bgeld\b|übrig|uebrig|überschuss|ueberschuss|gekostet|kostete|buchungen|vermietung|\bleft over\b|\bmoney\b|\bcame in\b|kontostand|\bbalance\b|\brental\b|\bsave[ds]?\b|\bging\b.*\braus\b/i.test(text)||Boolean(ledgerQueryIntent(text,history))||(continuationPattern.test(text)&&history.filter(h=>h.role==='user').slice(-1).some(h=>looksLikeLedgerQuestion(h.content)));
}

type Context = ReturnType<typeof readHouseholdContext>;
const cents = (v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function queryLedgerHousehold(query:LedgerQuery, c:Context) {
 if (!query.months.length || query.months.length>2 || new Set(query.months).size!==query.months.length || query.months.some(m=>!validMonth(m)) || !['income','expenses','cashflow'].includes(query.metric) || !['household','accounts','transfers'].includes(query.view) || query.explain!==undefined&&typeof query.explain!=='boolean' || query.category&&(query.metric==='cashflow'||!(query.metric==='income'?incomeCategories:expenseCategories).some(x=>x.id===query.category))) throw Error('ledger_query_invalid');
 const entries = contextViewEntries(c,query.view);
 const bankAccounts = [...new Set([...c.batch.sources.map(s=>s.account_ref),...c.wealth.accounts.filter(a=>a.kind==='bank').map(a=>a.id)])];
 const months = query.months.map(month=>{
  const first=month+'-01',next=addMonth(month,1)+'-01';
  const last=new Date(Date.parse(next+'T12:00:00Z')-86400000).toISOString().slice(0,10);
  const coverage=bankAccounts.map(id=>{
   const sources=c.batch.sources.filter(s=>s.account_ref===id&&s.control_result?.complete&&s.declared_period&&s.declared_period.from<=last&&s.declared_period.to>=first);
   let cursor=first;
   for(const s of sources.sort((a,b)=>a.declared_period!.from.localeCompare(b.declared_period!.from))){const p=s.declared_period!;if(p.from>cursor)break;if(p.to>=cursor)cursor=new Date(Date.parse(p.to+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
   return {account:c.wealth.accounts.find(a=>a.id===id)?.label??'Kontoauszug',complete:cursor>last};
  });
  const all=entries.filter(e=>e.date.slice(0,7)===month),rows=all.filter(e=>!query.category||(query.metric==='income'?incomeBranch(e,c.settings.income_sources).category:e.category)===query.category);
  const incoming=cents(rows.filter(e=>e.display_amount>0).reduce((s,e)=>s+e.display_amount,0));
  const outgoing=cents(-rows.filter(e=>e.display_amount<0).reduce((s,e)=>s+e.display_amount,0));
  const groups=new Map<string,number>();
  for(const e of rows.filter(e=>query.metric==='income'?e.display_amount>0:e.display_amount<0)){
   const id=query.metric==='income'?incomeBranch(e,c.settings.income_sources).category:e.category;
   groups.set(id,(groups.get(id)??0)+Math.abs(e.display_amount));
  }
  const categories=[...groups].map(([id,value])=>({id,label:[...expenseCategories,...incomeCategories].find(x=>x.id===id)?.label??id,amount:cents(value)})).sort((a,b)=>b.amount-a.amount);
  const complete=coverage.length>0&&coverage.every(a=>a.complete);
  // An empty month is zero only when source coverage proves it. A covered
  // category with no entries is likewise different from missing statements.
  const known=complete||all.length>0;
  const amount=!known?null:query.metric==='expenses'?outgoing:query.metric==='income'?incoming:cents(incoming-outgoing);
  const leaders=rows.filter(e=>query.metric==='income'?e.display_amount>0:e.display_amount<0).sort((a,b)=>Math.abs(b.display_amount)-Math.abs(a.display_amount)).slice(0,3).map(e=>({date:e.date,amount:cents(Math.abs(e.display_amount)),title:e.title.slice(0,100)}));
  return {month,status:complete?'covered':known?'partial':'missing',amount,incoming:known?incoming:null,outgoing:known?outgoing:null,categories,coverage,leaders:query.explain?leaders:[],estimated_fees:cents(rows.reduce((s,e)=>s+(e.fee_component?.status==='estimated'?-e.display_amount:0),0)),link:'/ledger/wealth?'+new URLSearchParams({from:month,to:month,view:query.view,direction:query.metric==='income'?'credit':'debit',...(query.category?{category:query.category}:{})})+'#household-categories'};
 });
 return {schema:'folio/ledger-household-query/v1',query,currency:c.settings.currency,batch_sha256:c.batch.batch_sha256,fx_date:c.wealth.conversion?.date??null,stale:c.stale,months,policy:{read_only:true,calculation:'ledger-household',uses_booking_date:true}};
}
export function renderLedgerHousehold(result:ReturnType<typeof queryLedgerHousehold>) {
 const money=(v:number)=>Math.abs(v)>0&&Math.abs(v)<100?`${v<0?'−':''}unter 100 ${result.currency}`:`ca. ${new Intl.NumberFormat('de-CH').format(Math.round(v/100)*100)} ${result.currency}`;
 const label=(m:string)=>new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));
 const metric=result.query.metric==='expenses'?'Ausgaben':result.query.metric==='income'?'Einnahmen':'Cashflow';
 const category=[...expenseCategories,...incomeCategories].find(c=>c.id===result.query.category)?.label;
 const lines=result.months.flatMap(m=>{
  if(m.amount===null)return [`**${label(m.month)}:** Für diesen Monat fehlen ausreichende Daten. Das bedeutet nicht 0 ${result.currency}.`];
  const out=[`**${label(m.month)}: ${money(m.amount)} ${category??metric}**${m.status==='partial'?' im erfassten Bestand':''}.`];
  if(result.query.metric==='cashflow')out.push(`Einnahmen ${money(m.incoming!)} · Ausgaben ${money(m.outgoing!)}.`);
  else if(m.categories.length)out.push(m.categories.slice(0,4).map(c=>`${c.label}: ${money(c.amount)}`).join(' · ')+'.');
  if(result.query.explain&&m.leaders.length)out.push('Größte erfasste Buchungen: '+m.leaders.map(e=>`${e.date} · ${e.title.replace(/[\[\]()`<>*_!\\\n\r]/g,' ')} · ${money(e.amount)}`).join('; ')+'.');
  if(m.status==='partial')out.push(`Abdeckung nicht vollständig: ${m.coverage.filter(a=>!a.complete).map(a=>a.account).join(', ')}. Die Summe kann weitere Buchungen nicht berücksichtigen.`);
  if(m.estimated_fees>0)out.push(`Enthält ${money(m.estimated_fees)} geschätzte Umtauschgebühren.`);
  out.push(`[${label(m.month)} im Haushaltsbuch öffnen](${m.link})`);return out;
 });
 if(result.months.length===2&&result.months.every(m=>m.amount!==null))lines.push(`Differenz (${label(result.months[1].month)} minus ${label(result.months[0].month)}): ${money(result.months[1].amount!-result.months[0].amount!)}${result.months.some(m=>m.status!=='covered')?' · nur erfasste Bestände':''}.`);
 if(result.query.explain)lines.push('Verglichen werden Buchungsbeträge. Ein höherer Monatsabgang beweist keine Beitragserhöhung; Nachzahlungen oder mehrere Zahlungsperioden müssen am Beleg geprüft werden.');
 lines.push(result.query.view==='household'?'Haushaltsansicht nach Buchungsdatum: zugeordnete Eigenüberträge herausgerechnet; Gebühren bleiben enthalten. Kategorien sind vorläufig.':result.query.view==='accounts'?'Bruttobewegungen nach Buchungsdatum, einschließlich Eigenüberträgen.':'Überträge nach Buchungsdatum; kein Haushaltseinkommen oder Verbrauch.');
 if(result.fx_date)lines.push(`Umrechnung wie im Dashboard, Kursstand ${result.fx_date}.`);
 if(result.stale)lines.push('Der Vermögensstand ist gegenüber den Kontoauszügen veraltet; dies ist keine aktuelle Gesamtbilanz.');
 return lines.join('\n\n');
}
