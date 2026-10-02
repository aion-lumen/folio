import {createHash} from 'node:crypto';
/** Source spans, not model assertions, authorize normalized search fields. */
export interface ClaimField { value:string; quote:string; }
export interface ClaimDraft {
 kind:'invoice'|'receipt'|'announcement'|'refund'|'transfer';
 amount:ClaimField; currency:ClaimField; counterparty:ClaimField;
 date:ClaimField; due_date:ClaimField; reference:ClaimField;
}
/** Common source structures, independent of merchant names. Unknown layouts
 * fall through to local extraction; values always keep their original spans. */
export function structuredPaymentClaim(source:string,excerpt:string):ClaimDraft|null {
 const text=normalizeSource(source),ex=normalizeSource(excerpt),empty={value:'',quote:''};
 if(!ex||!text.includes(ex))return null;
 const money=ex.match(/(?:EUR|CHF|USD|GBP|€)\s*(\d+[,.]\d{2})|(\d+[,.]\d{2})\s*(?:€\s*)?(EUR|CHF|USD|GBP|Euro|€)/iu);
 if(!money)return null;
 const amount=sourceMoney(money[1]??money[2]);if(!amount)return null;
 const currency=/CHF/i.test(money[0])?'CHF':/GBP/i.test(money[0])?'GBP':/USD/i.test(money[0])?'USD':'EUR';
 const paid=text.match(/Sie haben [\d., €]+(?:EUR|CHF|USD|GBP)?\s+an\s+(.+?)\s+gezahlt/iu);
 const beneficiary=text.match(/Zugunsten von:\s*([^,\r\n]+?)(?:,| \*)/iu);
 const receipt=text.match(/Receipt from ([\p{L}\d .&-]{1,80}?)\s+(?:CHF|EUR|USD|GBP)\s*\d/iu);
 const legal=text.match(/©[^\n]*?\b((?:[A-Z][\p{L}\d.-]*\s+){1,5}(?:SA|GmbH|AG|Ltd|Limited))\b/u);
 const party=paid?.[1]??beneficiary?.[1]??receipt?.[1]??legal?.[1];
 if(!party)return null;
 const kind:ClaimDraft['kind']=paid||receipt?'receipt':/rückerstattung|refund/iu.test(ex)?'refund':'invoice';
 let invoiceDate:ClaimField|undefined;try{if(kind==='invoice')invoiceDate=invoiceDateField(source);}catch{return null;}
 const dt=text.match(/(?:Transaktionsdatum|Rechnungsdatum|Invoice date)\s*:?\s*(\d{1,2}\.\d{1,2}\.20\d{2}|20\d{2}-\d{2}-\d{2})/iu);
 const due=text.match(/(?:Fälligkeitsdatum|zahlender Betrag bis zum|due date)\s*:?\s*(\d{1,2}\.\d{1,2}\.20\d{2}|20\d{2}-\d{2}-\d{2})/iu);
 const ref=text.match(/(?:Transaktionscode|Invoice number|Rechnungsnummer|Referenz)\s*:?\s*([A-Z0-9][A-Z0-9/-]{5,})/iu);
 return {kind,amount:{value:amount,quote:money[0]},currency:{value:currency,quote:money[0]},counterparty:{value:party,quote:party},date:invoiceDate??(dt?{value:sourceDate(dt[1])??'',quote:dt[1]}:empty),due_date:due?{value:sourceDate(due[1])??'',quote:due[1]}:empty,reference:ref?{value:ref[1],quote:ref[0]}:empty};
}
export const normalizeSource=(s:string)=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
export function paymentProduct(source:string):string {
 const label=source.match(/(?:Abonnement|Subscription):[ \t]*([^\r\n]{5,100})/iu)?.[1];
 const announcement=source.match(/Ihr ([^\r\n]{5,100}?)-Abonnement/iu)?.[1];
 const receipt=source.match(/Zahlungsdetails anzeigen (.{5,100}?) Menge:/iu)?.[1];
 return normalizeSource(label??announcement??receipt??'').toLowerCase();
}
/** Distinct document roles can describe one purchase. Two invoices or two
 * receipts remain distinct even at an identical price. */
export function samePaymentBundle(invoices:{document_key?:string;original_document?:{kind:string;invoice_date:string};kind?:string;product?:string;counterparty:string;invoice_number:string;invoice_date:string;amount:string;currency:string}[]):boolean {
 if(invoices.length<2)return true;const first=invoices[0];
 if(invoices.some(i=>i.amount!==first.amount||i.currency!==first.currency))return false;
 if(first.document_key&&invoices.every(i=>i.document_key===first.document_key&&i.counterparty===first.counterparty)){
  const originals=invoices.map(i=>i.original_document??i);
  const dates=new Set(originals.filter(i=>i.kind==='invoice').map(i=>i.invoice_date));
  return dates.size<=1&&originals.filter(i=>i.kind==='receipt').length<=1;
 }
 if(invoices.some(i=>i.invoice_date!==first.invoice_date))return false;
 if(first.invoice_number&&invoices.every(i=>i.invoice_number===first.invoice_number&&i.counterparty===first.counterparty))return true;
 const brand=(s:string)=>s.toLowerCase().match(/^[\p{L}\d]+/u)?.[0]??'';
 return invoices.length<=3&&!!first.product&&first.product.length>=8&&brand(first.counterparty).length>=5&&invoices.every(i=>i.product===first.product&&brand(i.counterparty)===brand(first.counterparty)&&['invoice','receipt','announcement'].includes(i.kind??''))&&new Set(invoices.map(i=>i.kind)).size===invoices.length&&invoices.some(i=>i.kind==='receipt');
}
/** Only unambiguous decimal conventions; a grouped integer needs its locale
 * evidence (e.g. a German CHF source) supplied by the caller. */
export function sourceMoney(s:string,groupedInteger=false):string|null {
 let text=s.replace(/[’'\s]/gu,'');
 if(!text||/^[+-]/.test(text))return null;
 text=text.replace(/\.(?:–|—|-{1,2})$/u,'.00');
 if(/^\d+$/.test(text))text+='.00';
 else if(groupedInteger&&/^\d{1,3}(?:\.\d{3})+$/.test(text))text=text.replace(/\./g,'')+'.00';
 else if(/^\d+[.,]\d{2}0{2,6}$/.test(text))text=text.slice(0,text.indexOf(text.includes(',')?',':'.')+3);
 if(!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)[.,]\d{2}$/.test(text))return null;
 const n=text.slice(0,-3).replace(/[.,]/g,'')+'.'+text.slice(-2);
 return Number(n)>0&&Number(n)<1e9?Number(n).toFixed(2):null;
}
const moneyToken=String.raw`\d+(?:[.'’]\d{3})*(?:[,.]\d{2}(?:0{1,6})?|\.(?:–|—|--?))?`;
/** Currency-bound whole amounts are safe; bare integer IDs and dates are not. */
export function sourceAmounts(quote:string,currency:string):string[]{
 const marker=currency==='CHF'?'CHF|Fr\\.':currency==='EUR'?'EUR|Euro|€':currency==='GBP'?'GBP|£':'USD|US\\$';
 const rx=new RegExp(`(?:${marker})\\s*(${moneyToken})(?![\\d.,])|(?<![\\d.,+-])(${moneyToken})\\s*(?:€\\s*)?(?:${marker})`,'giu');
 const unsigned=(m:RegExpMatchArray)=>{
  if(/[+\-−–—]\s*$/u.test(quote.slice(0,m.index)))return false;
  const tail=quote.slice(m.index!+m[0].length);
  if(!/^\s*[+\-−–—]/u.test(tail))return true;
  // A spaced dash introducing prose is punctuation, not an amount sign.
  // Attached signs, a mathematical minus and signs before currency stay invalid.
  return /^[ \t]+[-–—][ \t]+\p{L}/u.test(tail)&&!new RegExp(`^[ \\t]+[-–—][ \\t]+(?:${marker})(?!\\p{L})`,'iu').test(tail);
 };
 const matches=[...quote.matchAll(rx)];
 const explicit=matches.filter(unsigned).map(m=>sourceMoney(m[1]??m[2],currency==='CHF'&&/Eingezahlt|Betrag|bezahlt|Total|Rechnung|Fr\./iu.test(quote)));
 const bare=matches.length?explicit:[...quote.matchAll(/(?<![\d.,])\d+(?:[.'’]\d{3})*[,.]\d{2}(?![\d.,])/gu)].filter(unsigned).map(m=>sourceMoney(m[0]));
 return [...new Set(bare.filter((v):v is string=>!!v))];
}
/** Legacy model drafts sometimes encoded an amount object as a string.
 * Decode only that bounded shape; the quoted source still proves the amount. */
function proposedMoney(value:string,currency:string):string|null {
 const simple=sourceMoney(value)??sourceMoney(value.replace(/^[>}\$]+/u,''));
 if(simple)return simple;
 try{
  const object=JSON.parse(value);
  if(!object||Array.isArray(object)||typeof object!=='object'||Object.keys(object).some(k=>!['amount','value','currency'].includes(k))||(object.currency!==undefined&&object.currency!==currency))return null;
  const values=[object.amount,object.value].filter(v=>v!==undefined);
  if(!values.length||values.some(v=>!['string','number'].includes(typeof v)))return null;
  const amounts=values.map(v=>sourceMoney(String(v)));
  return amounts.every(a=>a!==null&&a===amounts[0])?amounts[0]:null;
 }catch{return null;}
}
export function sourceDate(s:string):string|null {
 const iso=s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
 const de=s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|\d{2})\b/);
 const months=['januar|january','februar|february','märz|maerz|march','april','mai|may','juni|june','juli|july','august','september','oktober|october','november','dezember|december'];
 let parts=iso?[+iso[1],+iso[2],+iso[3]]:de?[de[3].length===2?2000+Number(de[3]):+de[3],+de[2],+de[1]]:null;
 if(!parts)for(let i=0;i<months.length;i++){
  const a=s.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(?:${months[i]})\\s+(20\\d{2})\\b`,'iu'));
  const b=s.match(new RegExp(`(?:${months[i]})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`,'iu'));
  const m=a??b;if(m){parts=[+m[2],i+1,+m[1]];break;}
 }
 if(!parts)return null;const value=parts.map((p,i)=>String(p).padStart(i?2:4,'0')).join('-');
 const parsed=new Date(value+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:null;
}
export function paymentWindow(date:string,due:string,kind:ClaimDraft['kind'],source:string){
 const start=date.slice(0,7)+'-01';let endDate=due||date;
 // An announced later bank debit belongs to its actual settlement month.
 if(kind==='receipt'&&/innerhalb von ein bis zwei Werktagen|within (?:one to two|two) business days/iu.test(source)){
  const d=new Date(date+'T00:00:00Z');for(let n=0;n<2;){d.setUTCDate(d.getUTCDate()+1);if(![0,6].includes(d.getUTCDay()))n++;}endDate=d.toISOString().slice(0,10);
 }
 const d=new Date(endDate+'T00:00:00Z');const to=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);
 if(to<start||Date.parse(to)-Date.parse(start)>370*86400000)throw Error('payment_window_invalid');
 return {from:start,to};
}
/** Versioned settlement policy: full statement coverage is deliberately wider
 * than the dates eligible to settle this particular claim. */
export const PAYMENT_PROFILE = 'source-payment/v2';
const monthEnd=(d:string)=>new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7),0)).toISOString().slice(0,10);
function addDays(d:string,n:number,business=false){
 const t=new Date(d+'T00:00:00Z');for(let i=0;i<n;){t.setUTCDate(t.getUTCDate()+1);if(!business||![0,6].includes(t.getUTCDay()))i++;}return t.toISOString().slice(0,10);
}
const dateExpression=String.raw`(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.(?:20\d{2}|\d{2})\b|\d{1,2}\.?\s+[\p{L}]+\s+20\d{2}|[\p{L}]+\s+\d{1,2},?\s+20\d{2})`;
function labelledDateField(source:string,label:string):ClaimField|undefined{
 const matches=[...source.matchAll(new RegExp('(?:'+label+')\\s*:?\\s*('+dateExpression+')','giu'))];
 const dates=[...new Set(matches.map(m=>sourceDate(m[1])).filter((d):d is string=>!!d))];
 if(dates.length>1)throw Error('payment_date_ambiguous');
 return dates[0]?{value:dates[0],quote:matches.find(m=>sourceDate(m[1])===dates[0])![0]}:undefined;
}
function labelledDate(source:string,label:string){return labelledDateField(source,label)?.value??'';}
/** Invoice dates share one role-specific vocabulary across source checks. */
export function invoiceDateField(source:string){return labelledDateField(source,'Rechnungsdatum|Invoice date|Rechnung vom');}
export function paymentFundingIssue(source:string):string|null {
 const t=normalizeSource(source);
 if(/(?:bezahlt|gezahlt|autorisiert|paid|authorized)\s+(?:mit|with)\s*:?\s*(?:Zusätzliches\s+)?PayPal[- ]Guthaben|paid\s+(?:with|using)\s+(?:your\s+)?PayPal balance/iu.test(t))return 'payment_paypal_statement_required';
 if(/(?:bezahlt|gezahlt|autorisiert|paid|charged|payment method|Zahlungsmethode)\s*(?:(?:mit|with|to)\s*)?:?\s*(?:Kreditkarte|Debitkarte|Visa|Mastercard|Master card|American Express|card)\b/iu.test(t))return 'payment_card_statement_required';
 if(/\b(?:IBKR|Interactive Brokers|eToro|Kraken)\b/iu.test(t)&&/\b(?:Dividende|dividend|Devisenkauf|FX trade|Aktienkauf|shares purchased|(?:EUR\.CHF|BTC|USDC) (?:purchase|Kauf))\b/iu.test(t))return 'payment_broker_statement_required';
 return null;
}
/** Keep sentence/line boundaries and only accept a payment instruction.
 * Refund and cancellation conditions cannot widen the search interval. */
function relativePaymentDays(source:string):number[]{
 return source.split(/\r?\n|(?<=[.!?])\s+(?=[A-ZÄÖÜ])/u).flatMap(line=>{
  if(/zurück|Rück(?:erstatt|gabe|tritt)|refund/iu.test(line))return [];
  return [...line.matchAll(/(?<!\p{L})(?:überweisen Sie|bezahlen Sie|zahlen Sie|zahlbar)\s[^!?\r\n]{0,120}?(?:innert|innerhalb von)\s+(\d{1,2})\s+Tagen/giu)].map(m=>+m[1]);
 });
}
function settlementTiming(kind:ClaimDraft['kind'],source:string,hint:string,date:string,due:string,quotedDate:boolean,quotedDue:boolean){
 let base=quotedDate?date:hint.slice(0,7)+'-01',origin=quotedDate?'source':'memory-search-month';
 let from=base,to=quotedDue?due:monthEnd(base),basis=quotedDue?'source-due-date':'search-month';
 let purchase='',expected='';
 if(kind==='refund'){
  purchase=labelledDate(source,'(?:ursprünglich am|originally (?:paid )?on)');
  expected=labelledDate(source,'(?:Gutschrift auf (?:dein|Ihr) Bankkonto erfolgt am|werden bis|expected (?:on|by)|refund (?:arrives|by))');
  // The purchase is the earliest possible refund, the announced arrival an
  // upper bound, never a lower bound. Retain the roles in the reviewed input.
  if(purchase){base=purchase;origin='source-purchase';from=purchase;}
  else if(expected){base=hint.slice(0,7)+'-01';origin='memory-search-month';from=base;}
  to=expected|| (quotedDue?due:monthEnd([from,hint,date].sort().at(-1)!));basis=expected?'source-expected-credit':'refund-search-month';
 }else if(quotedDue){
  to=addDays(due,2,true);basis='due-plus-two-weekdays';
 }else if(kind==='invoice'&&quotedDate){
  const days=relativePaymentDays(source);
  if(new Set(days).size>1)throw Error('payment_date_ambiguous');
  const term=days.length&&days[0]>0&&days[0]<=90?days[0]:0;
  to=term?addDays(addDays(date,term),2,true):addDays(date,7);basis=term?'source-relative-due-plus-two-weekdays':'invoice-seven-day-search-limit';
 }else if(kind==='receipt'&&quotedDate){
  const explicit=/innerhalb von ein bis zwei Werktagen|within (?:one to two|two) business days/iu.test(source);
  to=addDays(date,explicit?2:7,explicit);basis=explicit?'source-business-days':'receipt-seven-day-search-limit';
 }
 if(!sourceDate(from)||!sourceDate(to)||to<from||Date.parse(to)-Date.parse(from)>370*86400000)throw Error('payment_window_invalid');
 return {date:base,date_origin:origin,due:expected||(quotedDue?due:base),dates:{original_purchase:purchase,expected_credit:expected},
  settlement_window:{from,to},settlement_basis:basis,window:{from:from.slice(0,7)+'-01',to:monthEnd(to)}};
}
export function normalizePaymentClaim(raw:unknown,source:string,sourceDateHint:string,accounts:string[]){
 const r=raw as ClaimDraft, text=normalizeSource(source);
 if(!r||!['invoice','receipt','announcement','refund','transfer'].includes(r.kind))throw Error('payment_claim_invalid');
 const fundingIssue=paymentFundingIssue(source);if(fundingIssue)throw Error(fundingIssue);
 if(!r.amount?.value)throw Error('payment_amount_unproven');
 if(!r.currency?.value)throw Error('payment_currency_missing');
 if(!accounts.length)throw Error('payment_account_coverage_missing');
 const bound=(f:ClaimField,optional=false)=>{
  if(!f||typeof f.value!=='string'||typeof f.quote!=='string'||f.value.length>200||f.quote.length>1000)throw Error('payment_claim_invalid');
  if(optional&&!f.value&&!f.quote)return '';
  if(!f.value||!f.quote||!text.includes(normalizeSource(f.quote)))throw Error('payment_claim_quote_missing');
  return normalizeSource(f.quote);
 };
 if(!r.amount?.value)throw Error('payment_amount_unproven');
 const aq=bound(r.amount),cq=bound(r.currency),pq=bound(r.counterparty);
 const currency=r.currency.value;
 const unique=sourceAmounts(aq,currency);
 const proposed=proposedMoney(r.amount.value,currency);
 const amount=unique.length===1?unique[0]:null;if(!amount||proposed!==amount)throw Error('payment_amount_unproven');
 if(!/^(EUR|CHF|USD|GBP)$/.test(currency)||!new RegExp(currency==='EUR'?'EUR|Euro|€':currency==='GBP'?'GBP|£':currency==='USD'?'USD|US\\$':'CHF|Fr\\.','iu').test(cq))throw Error('payment_currency_unproven');
 const quotedCurrencies=[...new Set([...aq.matchAll(/\b(?:EUR|CHF|USD|GBP|Euro)\b|€|£/giu)].map(m=>/EUR|Euro|€/iu.test(m[0])?'EUR':/GBP|£/iu.test(m[0])?'GBP':m[0].toUpperCase()))];
 if(quotedCurrencies.length&&(quotedCurrencies.length!==1||quotedCurrencies[0]!==currency))throw Error('payment_currency_unproven');
 const party=normalizeSource(r.counterparty.value);if(party.length<1||!pq.includes(party))throw Error('payment_counterparty_unproven');
 const dateQuote=bound(r.date,true),dueQuote=bound(r.due_date,true),refQuote=bound(r.reference,true);
 const date=r.date.value?sourceDate(dateQuote):sourceDate(sourceDateHint);
 const due=r.due_date.value?sourceDate(dueQuote):date;
 if(!date||!due||(r.date.value&&date!==r.date.value)||(r.due_date.value&&due!==r.due_date.value))throw Error('payment_date_unproven');
 const reference=r.reference.value;if(reference&&(!refQuote.includes(reference)||reference.length<6))throw Error('payment_reference_unproven');
 if(r.kind==='invoice')invoiceDateField(source);
 const timing=settlementTiming(r.kind,source,sourceDateHint,date,due,!!dateQuote,!!dueQuote);
 const deposit=r.kind==='transfer'&&(/Auf dein(?:em)? .{1,60}Konto wurde eine Einzahlung getätigt/iu.test(text)&&/Eingezahlt\s*\d/iu.test(text)
  || /Wir haben Ihre Einzahlung von [^!?\r\n]{1,100} auf Ihr Konto bei [^!?\r\n]{1,100} erhalten/iu.test(source));
 if(r.kind==='transfer'&&!deposit)throw Error('payment_transfer_direction_unproven');
 const direction=deposit?'debit':r.kind==='refund'?'credit':'debit';
 const documentKey=invoiceDocumentKey(source);
 return {...(documentKey?{document_key:documentKey}:{}),profile:PAYMENT_PROFILE,kind:r.kind,product:paymentProduct(source),date_origin:timing.date_origin,dates:timing.dates,settlement_basis:timing.settlement_basis,funding_route:'bank-or-unspecified',counterparty:party,amount,currency,invoice_date:timing.date,due_date:timing.due,invoice_number:reference,
  match_request:{require_reference:!dateQuote&&!dueQuote&&!timing.dates.original_purchase&&!timing.dates.expected_credit,target:direction==='debit'?'participant_payment_to_provider':'reimbursement_to_participant',direction,amount,currency,counterparty:party,references:reference?[reference]:[],account_refs:[...new Set(accounts)].sort(),window:timing.window,settlement_window:timing.settlement_window,claim_kind:r.kind,not_before:timing.settlement_window.from,not_after:timing.settlement_window.to,reference_profile:PAYMENT_PROFILE}};
}

/** An undated claim needs a reference actually present on the bank transaction.
 * Boundaries prevent INV123 from matching INV1234 in a free-text descriptor. */
export function bankReferenceMatches(references:string[],entry:{references?:string[];counterparty?:string|null;purpose?:string}):boolean {
 const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const bank=new Set((entry.references??[]).map(norm));
 const description=((entry.counterparty??'')+' '+(entry.purpose??'')).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return references.some(ref=>{const n=norm(ref);return n.length>=6&&(bank.has(n)||new RegExp('(?<![a-z0-9])'+[...n].join('[^a-z0-9]*')+'(?![a-z0-9])').test(description));});
}
/** Exact original payment paragraph binds a copied invoice to its original.
 * No grouping by vendor/price alone. Formatting of quote prefixes is ignored. */
export function invoiceDocumentKey(source:string):string|undefined{
 const plain=source.replace(/^\s*>\s?/gm,'').replace(/[*_]/g,'').replace(/(^|\s)\/([^/\r\n]+)\/(?=\s|$)/g,'$1$2');
 const blocks=[...plain.matchAll(/(?:Gemäss|Gemäß) unserer Vereinbarung[\s\S]{0,100}?Rechnung[\s\S]{0,30}?stellen:\s*([\s\S]{150,1600}?)(?=Bei Fragen|freundliche Grüsse|Mit freundlichen|$)/giu)].map(m=>m[1]);
 if(!blocks.length||blocks.some(block=>!/Total/iu.test(block)||!/lautend auf:/iu.test(block)||!/\b[A-Z]{2}\d{2}(?:\s*[A-Z0-9]){12,30}/u.test(block)))return;
 let date='';try{date=invoiceDateField(plain)?.value??'';}catch{return;}
 const keys=blocks.map(block=>{
  const period=/(?:Steuererklärung|Steuerperiode|Steuerjahr|Jahresabschluss)\s+(?:für\s+)?20\d{2}\b/iu.test(block)
   || /(?:Leistungszeitraum|Leistungsperiode|Abrechnungsperiode)\s*:?\s*(?:20\d{2}\b|\d{1,2}\.\d{1,2}\.20\d{2}|[\p{L}]+\s+20\d{2}\b)/iu.test(block)
   || /Rechnungsnummer\s*:?\s*(?=[A-Z0-9/-]*\d)[A-Z0-9/-]{6,}\b/iu.test(block);
  if(!period&&!date)return undefined;
  return createHash('sha256').update(normalizeSource(block)+(date?'|invoice-date:'+date:'')).digest('hex');
 });
 if(keys.some(k=>!k))return;
 return new Set(keys).size===1?keys[0]:undefined;
}
