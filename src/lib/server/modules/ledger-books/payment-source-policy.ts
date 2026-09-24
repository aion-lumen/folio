/** Pure source checks. A date in the mail body is not required when the exact
 * attachment has already been scanned, bound and deterministically normalized. */
export function paymentSenderProfile(sender:string):'vodafone'|'unitymedia'|null {
 const value=sender.trim();
 const match=value.match(/^(?:[^<>\r\n]*<)?([^<>\s@]+@[^<>\s@]+)>?$/u);
 if(!match)return null;
 const address=match[1].toLowerCase();
 if(address==='nicht.antworten@kundenservice.vodafone.com')return 'vodafone';
 if(address==='rechnung@unitymedia.de')return 'unitymedia';
 return null;
}
export function memoryInvoiceBinding(fact:{value_text:string;valid_from:string|null;source_excerpt:string|null},mailBody:string,invoice:{amount:string;invoice_date:string},mailSubject='') {
 const amounts=[...fact.value_text.matchAll(/\b(\d+[,.]\d{2})\s*(?:Euro|EUR|€)/giu)].map(x=>x[1].replace(',','.'));
 const normalize=(s:string)=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
 const excerpt=normalize(fact.source_excerpt??'');
 const excerptBound=!!excerpt&&(normalize(mailBody).includes(excerpt)||normalize(mailSubject).includes(excerpt));
 return amounts.length===1&&amounts[0]===invoice.amount&&fact.valid_from===invoice.invoice_date&&excerptBound;
}
