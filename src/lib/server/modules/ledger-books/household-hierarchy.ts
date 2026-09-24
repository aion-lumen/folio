import {createHash} from 'node:crypto';
import {expenseCategories,incomeCategories,type IncomeCategoryId,type HouseholdSettings,type HouseholdEntry,type HouseholdExpenseBranch} from '$lib/ledger-household.js';

// Presentation groups only. These never change accounting or paid status.
const merchants:[RegExp,string,string][]=[
 [/VODAFONE/,'Vodafone','telecom'],[/SALT MOBILE/,'Salt','telecom'],[/FRAENK/,'fraenk','telecom'],
 [/YOUTUBE/,'YouTube','streaming'],[/NETFLIX/,'Netflix','streaming'],
 [/INFOMANIAK/,'Infomaniak','hosting'],[/STRATO/,'STRATO','hosting'],
 [/OPENAI/,'OpenAI','software'],[/CURSOR/,'Cursor','software'],[/X CORP|X DEVELOPER/,'X','software'],
 [/SWICA/,'SWICA','health'],[/PAX.LEBEN/,'PAX','life'],[/TONI DIGITAL/,'TONI Digital','insurance_other'],
 [/DIGITEC/,'Digitec','electronics'],[/GALAXUS/,'Galaxus','electronics'],
 [/\bALDI\b/,'ALDI','groceries'],[/\bLIDL\b/,'Lidl','groceries'],[/\bPENNY\b/,'Penny','groceries'],[/\bCOOP[.\s]/,'Coop','groceries'],
 [/MIGROS (?:PARTNER|MP |MM )/,'Migros','groceries'],[/\bHUEL\b|H U E L/,'Huel','groceries'],
 [/AMAZON/,'Amazon','retail'],[/BARBERSHOP/,'Barbershop','personal'],[/VALVE/,'Valve','games'],
 [/SERAFE/,'Serafe','broadcast'],[/BANKPAKET|ENTGELTABRECHNUNG/,'Kontogebühren','bank_fees']
];
const subcategories:Record<string,Record<string,string>>={
 subscriptions:{telecom:'Telefon & Internet',streaming:'Streaming',hosting:'Hosting & Domains',software:'Software & Dienste',bank_fees:'Kontogebühren',other:'Weitere Abos'},
 insurance:{health:'Krankenversicherung',life:'Lebensversicherung',insurance_other:'Weitere Versicherungen',other:'Versicherung · offen'},
 home:{rent:'Miete & Nebenkosten',energy:'Energie',other:'Weitere Wohnkosten'},
 tax:{broadcast:'Rundfunk',vehicle_tax:'Fahrzeugabgaben',other:'Weitere Abgaben'},
 equipment:{electronics:'Elektronik & Geräte',other:'Weitere Anschaffungen'},
 food:{groceries:'Lebensmittel',drugstore:'Drogerie',bakery:'Bäckerei',other:'Weitere Einkäufe'},
 leisure:{dining:'Essen & Ausgehen',games:'Spiele',other:'Weitere Freizeit'},
 mobility:{parking:'Parken',other:'Weitere Mobilität'},
 shopping:{retail:'Onlinehandel',personal:'Persönliche Pflege',other:'Weitere Einkäufe'},
 transfer_fees:{documented:'Belegte Gebühren',estimated:'Geschätzte Gebühren',other:'Weitere Gebühren'},
 transfers:{wise:'Wise / TransferWise',ib:'Interactive Brokers',other:'Weitere Überträge'},
 unknown:{other:'Noch einzuordnen'}
};
const normalized=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
export function expenseBranch(entry:HouseholdEntry){
 const text=normalized(entry.title+' '+entry.purpose).toUpperCase();
 const merchant=entry.fee_component?[new RegExp(''),'Wise',entry.fee_component.status] as [RegExp,string,string]:entry.transfer&&entry.category==='transfers'?[new RegExp(''),entry.transfer.provider==='wise'?'Wise':'Interactive Brokers',entry.transfer.provider] as [RegExp,string,string]:merchants.find(([pattern])=>pattern.test(text));
 let sub=merchant?.[2]??'other';
 if(entry.category==='home')sub=/MIETE|NEBENKOSTEN/.test(text)?'rent':/STROM|ENERGIE|GASWERK/.test(text)?'energy':'other';
 if(entry.category==='food'&&!merchant)sub=/DROGERIE/.test(text)?'drugstore':/B.CKEREI/.test(text)?'bakery':'other';
 if(entry.category==='leisure'&&!merchant)sub=/RESTAURANT|DOENER|LOFT BAR/.test(text)?'dining':'other';
 if(entry.category==='mobility')sub=/PARKING|PARKHÄUSER/.test(text)?'parking':'other';
 if(entry.category==='tax'&&/KFZ.STEUER|MOTOR\s*FAHRZEUGKONTROLLE/.test(text))sub='vehicle_tax';
 if(!subcategories[entry.category][sub])sub='other';
 const generic=/^(LASTSCHRIFT|AUFTRAG|ÜBERWEISUNG|KAUF|TWINT|PF PAY|BELASTUNG|PREIS FÜR|ZUGÄNGE|ABGÄNGE|DAUERAUFTRAG)/i.test(entry.title);
 // Never combine unrelated unnamed merchants just because both use TWINT/PayPal.
 const intermediary=/PAYPAL|KLARNA/i.test(entry.title);
 const fallback=generic?'Buchungspartner offen':normalized(entry.title).slice(0,110);
 const label=merchant?.[1]??fallback;
 const identity=merchant?(label==='Kontogebühren'?label+entry.account:label):generic||intermediary?entry.id:normalized(entry.title).toUpperCase();
 return {subcategory:sub,label:subcategories[entry.category][sub],partner:{id:'p_'+createHash('sha256').update(identity).digest('hex').slice(0,24),label,tentative:!merchant}};
}
export function buildExpenseHierarchy(entries:HouseholdEntry[]):HouseholdExpenseBranch[]{
 const categories:HouseholdExpenseBranch[]=expenseCategories.map(c=>({id:c.id,amount:0,count:0,children:[]}));
 for(const entry of entries){
  if(entry.amount>=0)continue;
  const value=Math.abs(entry.display_amount),path=expenseBranch(entry),category=categories.find(c=>c.id===entry.category)!;
  category.amount+=value;category.count++;
  let child=category.children.find(c=>c.id===path.subcategory);
  if(!child){child={id:path.subcategory,label:path.label,amount:0,count:0,partners:[]};category.children.push(child);}
  child.amount+=value;child.count++;
  let partner=child.partners.find(p=>p.id===path.partner.id);
  if(!partner){partner={...path.partner,amount:0,count:0};child.partners.push(partner);}
  partner.amount+=value;partner.count++;
 }
 for(const c of categories){c.children.sort((a,b)=>b.amount-a.amount);for(const child of c.children)child.partners.sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label));}
 return categories.filter(c=>c.count);
}

/** Owner-configured rental sources still require rent evidence on each bank credit. */
export function matchingIncomeSource(entry:HouseholdEntry,sources:HouseholdSettings['income_sources']){
 const text=normalized(entry.title+' '+entry.purpose).toUpperCase();
 return sources.find(s=>{
  if(s.id!==entry.income_source&&!s.contains.some(v=>text.includes(normalized(v).toUpperCase())))return false;
  if(s.category!=='income_rental')return true;
  return entry.amount>0&&!entry.aggregate&&(!entry.transfer||entry.transfer.status==='external_payment')
   &&/\b(?:MIETE|MIETZAHLUNG(?:EN)?|MIETZINS(?:EN)?|KALTMIETE|WARMMIETE)\b/.test(text)
   &&!/KAUFPREIS|KAUTION|MIETSICHERHEIT|SICHERHEITSLEISTUNG|ERSTATTUNG|REFUND|RUECKZAHLUNG|RÜCKZAHLUNG|EIGEN[ÜU]BERTRAG|EIGENUEBERTRAG|UMBUCHUNG|KONTO[ÜU]BERTRAG/.test(text);
 });
}

/** Credits are classified independently of expense categories. Every credit is retained. */
export function incomeSourceCategory(source:HouseholdSettings['income_sources'][number]):IncomeCategoryId {
 return source.category??(['rav','family'].includes(source.id)?'income_benefits':source.id==='interest'?'income_capital':'income_other');
}
export function incomeBranch(entry:HouseholdEntry,sources:HouseholdSettings['income_sources']) {
 const text=normalized(entry.title+' '+entry.purpose).toUpperCase();
 const source=matchingIncomeSource(entry,sources);
 let category:IncomeCategoryId='income_other',sub='other',label='Noch einzuordnen';
 if(entry.transfer&&entry.transfer.status!=='external_payment'){category='income_transfers';sub=entry.transfer.provider;label=sub==='wise'?'Wise / TransferWise':'Interactive Brokers';}
 else if(source){
  category=incomeSourceCategory(source);
  sub='source_'+source.id;label=source.label;
 } else if(/\b(ZINSEN|ZINSGUTSCHRIFT|DIVIDENDE[N]?)\b/.test(text)){category='income_capital';sub=/DIVIDENDE/.test(text)?'dividends':'interest';label=sub==='interest'?'Zinsen':'Dividenden';}
 else if(/\b(LOHN|GEHALT|LOHNZAHLUNG|GEHALTSZAHLUNG|HONORAR)\b/.test(text)){category='income_work';sub=/HONORAR/.test(text)?'fees':'salary';label=sub==='fees'?'Honorare':'Gehalt & Lohn';}
 else if(/ERSTATTUNG|REFUND|RETOURE|RUECKZAHLUNG|RÜCKZAHLUNG/.test(text)){category='income_refunds';sub='refunds';label='Erstattungen & Rückzahlungen';}
 else if(/EIGEN[ÜU]BERTRAG|EIGENUEBERTRAG|UMBUCHUNG|KONTO[ÜU]BERTRAG/.test(text)){category='income_transfers';sub='transfers';label='Erkannte Überträge';}
 const generic=/^(GUTSCHRIFT|ÜBERWEISUNG|ZUGÄNGE|TWINT|PAYPAL|ZAHLUNGSEINGANG)(?:\s|$)/i.test(entry.title);
 const partnerLabel=entry.transfer&&entry.transfer.status!=='external_payment'?label:entry.aggregate?(source?.label??'Monatssumme · '+entry.account):source&&(source.category==='income_rental'||generic||/^OEFFENTLICHE$/i.test(entry.title))?source.label:normalized(entry.title).slice(0,110)||'Absender offen';
 const identity=entry.aggregate?partnerLabel+entry.account:generic&&!source?entry.id:partnerLabel.toUpperCase();
 return {category,subcategory:sub,label,partner:{id:'p_'+createHash('sha256').update(identity).digest('hex').slice(0,24),label:partnerLabel,tentative:!source&&!entry.transfer}};
}
export function buildIncomeHierarchy(entries:HouseholdEntry[],sources:HouseholdSettings['income_sources']):HouseholdExpenseBranch[]{
 const categories:HouseholdExpenseBranch[]=incomeCategories.map(c=>({id:c.id,amount:0,count:0,children:[]}));
 for(const entry of entries){
  if(entry.amount<=0)continue;
  const path=incomeBranch(entry,sources),category=categories.find(c=>c.id===path.category)!,value=entry.display_amount;
  category.amount+=value;category.count++;
  let child=category.children.find(c=>c.id===path.subcategory);
  if(!child){child={id:path.subcategory,label:path.label,amount:0,count:0,partners:[]};category.children.push(child);}
  child.amount+=value;child.count++;
  let partner=child.partners.find(p=>p.id===path.partner.id);
  if(!partner){partner={...path.partner,amount:0,count:0};child.partners.push(partner);}
  partner.amount+=value;partner.count++;
 }
 for(const c of categories){c.children.sort((a,b)=>b.amount-a.amount);for(const child of c.children)child.partners.sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label));}
 return categories.filter(c=>c.count);
}
