/** Local evidence discovery only. These links are not payment confirmations. */
export interface BankEvidence { observation_id:string; account_ref:string; booking_date:string; amount:string; currency:string; direction:string; purpose:string; counterparty:string|null; references:string[]; }
export interface MailEvidence { id:number; ref:string; date:string; subject:string; sender:string; body:string; truncated:boolean; sha256:string; }
export interface EvidenceLink { id:string; bank_id:string; mail_id:number; reasons:string[]; status:'possible_match'; }
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const words=(s:string):string[]=>s.toLowerCase().match(/[\p{L}]{5,}/gu)??[];
const stop=new Set(['zahlung','rechnung','lastschrift','gutschrift','kontoinhaber','payment','invoice','deutschland','germany','schweiz','online','service','services','limited','referenz','gmbh','kunden','betrag','konto','debit','credit','banking','sparkasse','postfinance']);
export function amountKeys(text:string):Set<string> {
 const out=new Set<string>();
 const number="(?:\\d{1,3}(?:[.'’ ,]\\d{3})+|\\d+)[,.]\\d{2}";
 const add=(currency:string,value:string)=>{const digits=value.replace(/[^0-9]/g,'');if(digits.length<=12)out.add(`${currency==='€'?'EUR':currency.toUpperCase()}:${Number(digits)}`);};
 for(const m of text.matchAll(new RegExp(`(EUR|CHF|€)\\s*(${number})(?!\\d)`,'gi')))add(m[1],m[2]);
 for(const m of text.matchAll(new RegExp(`(?<![\\d,.])(${number})\\s*(EUR|CHF|€)`,'gi')))add(m[2],m[1]);
 return out;
}
function referenceTokens(s:string):string[]{
 return [...new Set((s.match(/[\p{L}\p{N}][\p{L}\p{N}_./-]{5,70}/gu)??[]).filter(x=>/\d{4}/.test(x)).map(normalize))];
}
export function discoverLinks(banks:BankEvidence[],mails:MailEvidence[]):EvidenceLink[]{
 const amountIndex=new Map<string,MailEvidence[]>(),refIndex=new Map<string,MailEvidence[]>();
 for(const m of mails){for(const key of amountKeys(m.body))amountIndex.set(key,[...(amountIndex.get(key)??[]),m]);for(const key of referenceTokens(m.subject+' '+m.body))refIndex.set(key,[...(refIndex.get(key)??[]),m]);}
 const links:EvidenceLink[]=[];
 for(const b of banks){
  const cents=Math.round(Math.abs(Number(b.amount))*100),key=`${b.currency}:${cents}`;
  const refs=referenceTokens((b.references??[]).join(' ')+' '+b.purpose);
  const pool=new Map<number,MailEvidence>();
  for(const m of amountIndex.get(key)??[])pool.set(m.id,m);
  for(const ref of refs)for(const m of refIndex.get(ref)??[])pool.set(m.id,m);
  for(const m of pool.values()){
   const days=(Date.parse(b.booking_date)-Date.parse(m.date.slice(0,10)))/86400000;
   if(!Number.isFinite(days)||days < -10 || days > 100)continue;
   const text=m.subject+' '+m.sender+' '+m.body;
   const matchRefs=new Set(referenceTokens(text));
   const reference=refs.some(r=>matchRefs.has(r));
   const amount=amountKeys(m.body).has(key);
   const vendor=words(b.counterparty??b.purpose.slice(0,180)).filter(w=>!stop.has(w)).some(w=>words(text).includes(w));
   // Amount alone, time alone or vendor alone is never a proposed link.
   if(!(reference&&amount) && !(amount&&vendor))continue;
   links.push({id:`${b.observation_id}:${m.id}`,bank_id:b.observation_id,mail_id:m.id,reasons:[...(reference?['reference']:[]),'amount_currency',...(vendor?['counterparty']:[])],status:'possible_match'});
  }
 }
 return links;
}
export function coverageGaps(sources:{account_ref:string;declared_period?:{from:string;to:string};control_result?:{complete:boolean}}[]){
 const result:{account:string;from:string;to:string}[]=[];
 for(const account of new Set(sources.map(s=>s.account_ref))){
  const periods=sources.filter(s=>s.account_ref===account&&s.control_result?.complete&&s.declared_period).map(s=>s.declared_period!).sort((a,b)=>a.from.localeCompare(b.from));
  let end='';for(const p of periods){if(end){const next=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);if(next<p.from)result.push({account,from:next,to:new Date(Date.parse(p.from)-86400000).toISOString().slice(0,10)});}if(p.to>end)end=p.to;}
 }
 return result;
}
