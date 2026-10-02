import {createHash} from 'node:crypto';
import {normalizeSource,normalizePaymentClaim,sourceDate,sourceAmounts,invoiceDateField,type ClaimDraft} from './payment-claim-policy.js';

export const EXTRACTION_POLICY='payment-extraction/v5';
const empty=()=>({value:'',quote:''});
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Classification concerns the selected claim, not a cancellation link in a footer. */
export function paymentSourceRoute(source:string,excerpt:string):'payment_context_only'|'payment_broker_statement_required'|null{
 const text=normalizeSource(source),ex=normalizeSource(excerpt);
 if(!ex||!text.includes(ex))return null;
 if(/\bBOUGHT\s+[\d.,]+\s+[A-Z]{3}\.[A-Z]{3}\b/u.test(ex)
  || /(?:Symbol|Währungspaar):?\s*[A-Z]{3}\.[A-Z]{3}/u.test(ex)
  || /(?:\b(?:BTC|USDC|ETH)\b[\s\S]{0,300}mit Kontoguthaben bezahlt|mit Kontoguthaben bezahlt)/iu.test(ex))return 'payment_broker_statement_required';
 if(/(?:Mitgliedschaft wurde beendet|Abonnement wird nicht verlängert, sondern gekündigt)/iu.test(ex))return 'payment_context_only';
 if(/Probeabo/iu.test(ex)&&/Gesamt:\s*0[,.]00\s*(?:€|EUR|CHF)/iu.test(ex))return 'payment_context_only';
 if(/Offerte:/.test(ex)&&/Vertrag sowie die dazugehörigen Allgemeinen Geschäftsbedingungen/iu.test(text))return 'payment_context_only';
 if(/Jahresbeitrag/iu.test(ex)&&/Versicherungsbeiträge.*(?:Ehefrau|Ehemann)/iu.test(text)&&/Erklärung\s+(?:gerne\s+)?einreichen/iu.test(text))return 'payment_context_only';
 return null;
}
/** Cache entries are usable only after source, extraction version and all fields
 * have been checked. Invalid entries never suppress a new extraction. */
export function currentClaimCache(cached:any,source:string,factHash:string):boolean{
 return cached?.policy===EXTRACTION_POLICY&&cached.source_sha256===digest(source)&&cached.fact_sha256===factHash;
}

export function validatedCachedClaim(cached:any,source:string,factHash:string,dateHint:string,accounts:{ref:string;currency:string}[]):ClaimDraft|undefined{
 if(!currentClaimCache(cached,source,factHash))return;
 try{normalizePaymentClaim(cached.draft,source,dateHint,accounts.filter(a=>a.currency===cached.draft?.currency?.value).map(a=>a.ref));return cached.draft;}catch{return;}
}

/** Additional layouts with exact source spans. Unknown layouts remain model work. */
export function explicitPaymentClaim(source:string,excerpt:string):ClaimDraft|null{
 if(!normalizeSource(source).includes(normalizeSource(excerpt))||!excerpt)return null;
 const text=normalizeSource(source), field=(value:string,quote:string)=>({value,quote});
 const result=(kind:ClaimDraft['kind'],amountQuote:string,party:string,currency:string,dateQuote='',referenceQuote='',reference=''):ClaimDraft|null=>{
  const values=sourceAmounts(amountQuote,currency);if(values.length!==1||!text.includes(normalizeSource(party)))return null;
  const date=dateQuote?sourceDate(dateQuote):null;
  return {kind,amount:field(values[0],amountQuote),currency:field(currency,amountQuote),counterparty:field(party,party),date:date?field(date,dateQuote):empty(),due_date:empty(),reference:reference?field(reference,referenceQuote):empty()};
 };
 const amount=String.raw`[\d][\d.,'’]*(?:[–—-]{1,2})?\s*(?:€\s*)?(?:EUR|CHF|USD|GBP|€)`;
 const refund=normalizeSource(excerpt).match(new RegExp(`([\\p{L}][\\p{L}\\d .&-]{1,100}?) hat Ihnen (${amount}) für Ihren Einkauf vom (.{5,30}?) zurückgezahlt`,'iu'));
 if(refund){
  const date=text.match(/Transaktionsdatum\s+(.{5,35}?20\d{2})/iu);
  const ref=text.match(/Transaktionscode\s+([A-Z0-9]{6,})/iu);
  const currency=/CHF/.test(refund[2])?'CHF':/USD/.test(refund[2])?'USD':/GBP/.test(refund[2])?'GBP':'EUR';
  return result('refund',refund[2],refund[1],currency,date?.[1]??'',ref?.[0]??'',ref?.[1]??'');
 }
 const authorization=text.match(new RegExp(`Sie haben (${amount}) an (.{1,100}?) autorisiert`,'iu'));
 if(authorization){
  const date=text.match(/Transaktionsdatum\s+(\d{1,2}\.\d{1,2}\.20\d{2})/iu),ref=text.match(/Bestellnummer\s+([A-Z0-9][A-Z0-9-]{5,})/iu);
  const currency=/CHF/.test(authorization[1])?'CHF':/USD/.test(authorization[1])?'USD':/GBP/.test(authorization[1])?'GBP':'EUR';
  return result('announcement',authorization[1],authorization[2],currency,date?.[1]??'',ref?.[0]??'',ref?.[1]??'');
 }
 const received=text.match(new RegExp(`Eingang Ihrer Zahlung von (${amount})`,'iu'));
 const paidDate=text.match(/Ihre Zahlung vo[mn]\s+(\d{1,2}\.\d{1,2}\.(?:20)?\d{2})\s+per\s+Twint\s+erhalten/iu);
 const signature=text.match(/Mit freundlichen Grüssen\s+([\p{L}\d .&-]{1,60}?)\s*\|/iu);
 if(received&&paidDate&&signature)return result('receipt',received[1],signature[1],'CHF',paidDate[1]);
 const deposit=text.match(/Auf dein(?:em)? (.{1,60}?) Konto wurde eine Einzahlung getätigt/iu);
 const deposited=text.match(/Eingezahlt\s*([\d.,]+\s*CHF)/iu),depositDate=text.match(/Datum:\s*(\d{1,2}\.\d{1,2}\.20\d{2})/iu);
 if(deposit&&deposited&&depositDate)return result('transfer','Eingezahlt'+deposited[1],deposit[1],'CHF',depositDate[1]);
 // Swiss invoice total, including a copy quoted in later correspondence.
 const payables=[...text.matchAll(/(?:Betrag von|Rechnung über)\s*\*?((?:CHF|Fr\.)\s*\d+[.,](?:\d{2}|–|—|--?))/giu)];
 const beneficiaries=[...text.matchAll(/lautend auf:\s*([^,]{2,100}),/giu)];
 const values=new Set(payables.flatMap(m=>sourceAmounts(m[1],'CHF')));
 // A chain with multiple amounts or recipients needs contextual extraction.
 if(values.size>1||new Set(beneficiaries.map(m=>m[1])).size>1)return null;
 const payable=payables[0],beneficiary=beneficiaries[0];
 if(payable&&beneficiary){
  const paid=excerpt.match(/am\s+(\d{1,2}\.\d{1,2}\.(?:20)?\d{2})\s+bereits\s+beglichen/iu);
  let date;try{date=invoiceDateField(source);}catch{return null;}
  return result(paid?'receipt':'invoice',payable[1],beneficiary[1],'CHF',paid?.[1]??date?.quote??'');
 }
 return null;
}

