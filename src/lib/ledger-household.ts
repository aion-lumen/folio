/** Display-only household projection. Never a journal or a payment instruction. */
export const expenseCategories = [
 {id:'home',label:'Wohnen & Energie',kind:'fixed',color:'blue'},
 {id:'insurance',label:'Versicherungen',kind:'fixed',color:'blue2'},
 {id:'subscriptions',label:'Abos & Telefon',kind:'fixed',color:'blue3'},
 {id:'tax',label:'Abgaben',kind:'fixed',color:'blue4'},
 {id:'equipment',label:'Technik & Anschaffungen',kind:'variable',color:'orange'},
 {id:'food',label:'Lebensmittel & Drogerie',kind:'variable',color:'orange2'},
 {id:'leisure',label:'Freizeit & Gastronomie',kind:'variable',color:'orange3'},
 {id:'mobility',label:'Mobilität',kind:'variable',color:'orange4'},
 {id:'shopping',label:'Einkauf & Persönliches',kind:'variable',color:'orange5'},
 {id:'transfer_fees',label:'Umtauschgebühren',kind:'variable',color:'orange5'},
 {id:'transfers',label:'Überträge · Wise / IB',kind:'transfer',color:'purple'},
 {id:'unknown',label:'Zuordnung offen',kind:'unknown',color:'gray'}
] as const;
export const incomeCategories = [
 {id:'income_benefits',label:'Leistungen & Familie',kind:'income',color:'blue'},
 {id:'income_work',label:'Arbeit & Aufträge',kind:'income',color:'blue2'},
 {id:'income_rental',label:'Mieteinnahmen',kind:'income',color:'blue4'},
 {id:'income_capital',label:'Zinsen & Kapital',kind:'income',color:'purple'},
 {id:'income_refunds',label:'Rückerstattungen',kind:'income',color:'orange2'},
 {id:'income_transfers',label:'Überträge',kind:'income',color:'blue3'},
 {id:'income_other',label:'Weitere Zugänge · offen',kind:'income',color:'gray'}
] as const;
export type IncomeCategoryId = typeof incomeCategories[number]['id'];
export type HouseholdDirection = 'debit'|'credit';
export type HouseholdView = 'household'|'accounts'|'transfers';
export interface TransferFee {
 status:'documented'|'estimated'|'unknown';components:{amount:number;currency:string}[];method:string;
 samples:{id:string;date:string;gross:number;fee:number;currency:string}[];
 evidence:{feedback_id:number;date:string;subject:string;quote:string;sha256:string}[];
}
export interface FeeSummary {documented:number;estimated:number;estimated_count:number;documented_count:number;}

export interface HouseholdNotice {
 id:string;kind:'expiry'|'expected'|'unusual';label:string;detail:string;urgent:boolean;
 date?:string;amount?:number;category:string;subcategory?:string;partner?:string;
 explanations?:string[];
 evidence?:{id:string;date:string;label:string;amount:number;currency:string}[];
}
export interface HouseholdTreeData {
 categories:HouseholdExpenseBranch[];notices:HouseholdNotice[];currency:string;batch_sha256:string;observed_through:string;as_of:string;
}
export type CategoryId = typeof expenseCategories[number]['id'];
export type ExpenseKind = typeof expenseCategories[number]['kind'];
export interface HouseholdMonth {month:string;incoming:number;outgoing:number;net:number;count:number;expenses:Record<CategoryId,number>;income:Record<string,number>;coverage:string[];fees?:FeeSummary;}
export interface HouseholdSettings {
 schema:'folio/household-settings/v1';currency:'EUR'|'CHF';
 category_overrides:{contains:string;category:CategoryId}[];
 income_sources:{id:string;label:string;contains:string[];category?:IncomeCategoryId;end_date:string|null;date_source:string|null}[];
 own_transfer_providers?:('wise'|'ib')[];projection_exclude:string[];projection_equipment:string[];
 property:null|{label:string;price:number;property:number;inventory:number;paid:boolean;source:string;confirmed_at:string};
}
export interface HouseholdOverview {
 months:HouseholdMonth[];account_months?:HouseholdMonth[];transfer_months?:HouseholdMonth[];batch_sha256:string;currency:string;as_of:string;accounts:{id:string;label:string;as_of:string}[];
 income_sources:HouseholdSettings['income_sources'];property:HouseholdSettings['property'];
 liquid:number;assets_low:number;assets_high:number;after_purchase:number|null;
 fx_date:string|null;fx_source:string|null;stale:boolean;
 transfer_history?:{status:'missing'|'ready'|'invalid';source_count:number;records:number;bank_legs:number;paired_legs:number;matched_records?:number};
 forecast:null|{baseline:number;monthly_income:number;end_date:string|null;basis_months:string[];band:number};
}
export interface HouseholdEntry {
 id:string;date:string;amount:number;display_amount:number;currency:string;account:string;
 title:string;purpose:string;category:CategoryId;aggregate:boolean;fee_component?:TransferFee;income_source?:string;transfer?:{provider:'wise'|'ib';status:'bank_leg'|'provider_evidenced'|'paired'|'ambiguous'|'external_payment';counterpart_ids:string[];record?:{id:string;created:string;completed:string;source_amount:number;source_fee:number|null;source_currency:string;target_amount:number;target_fee:number|null;target_currency:string;rate:number|null;source_format?:'wise-csv'|'wise-ui-text';source_amount_basis?:'net'|'gross';recipient_name?:string;completed_from_group?:boolean;own:boolean;line:number;source_sha256:string;}};
}
export interface HouseholdDocument {kind:'statement'|'invoice';sha256:string;label:string;locator:string|null;url:string;}
export interface HouseholdEntryDetail {entry:HouseholdEntry;documents:HouseholdDocument[];invoice_status:'verified'|'unlinked';memory_url:string|null;warnings:string[];fee?:TransferFee;counterparts?:HouseholdEntry[];}
export interface HouseholdExpensePartner {id:string;label:string;amount:number;count:number;tentative:boolean;}
export interface HouseholdExpenseSubcategory {id:string;label:string;amount:number;count:number;partners:HouseholdExpensePartner[];}
export interface HouseholdExpenseBranch {id:CategoryId|IncomeCategoryId;amount:number;count:number;children:HouseholdExpenseSubcategory[];}
export function validMonth(v:string){return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);}
/** Shareable chat drill-down, bounded to existing months and closed UI views. */
export function householdSelection(params:URLSearchParams,months:HouseholdMonth[]) {
 const from=params.get('from')??'',to=params.get('to')??from;
 const start=months.findIndex(m=>m.month===from),last=months.findIndex(m=>m.month===to);
 if(!validMonth(from)||!validMonth(to)||start<0||last<start)return null;
 const requested=params.get('view'),view:HouseholdView=requested==='accounts'||requested==='transfers'?requested:'household';
 const direction=params.get('direction')==='credit'?'credit' as const:'debit' as const;
 const category=params.get('category')??'';
 return {start,end:last+1,view,direction,...((direction==='credit'?incomeCategories:expenseCategories).some(c=>c.id===category)?{category}:{})};
}
export function validDay(v:string){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
export function addMonth(m:string,n:number){if(!validMonth(m)||!Number.isInteger(n))throw Error('invalid_month');const d=new Date(m+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
export function monthLabel(m:string,year=false){return new Intl.DateTimeFormat('de-CH',{month:'short',...(year?{year:'numeric'} as const:{}),timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));}
export function categoryTotals(months:HouseholdMonth[]){return expenseCategories.map(c=>({...c,amount:months.reduce((s,m)=>s+(m.expenses[c.id]??0),0)}));}
export function viewMonths(data:HouseholdOverview,view:HouseholdView='household'){return view==='accounts'?(data.account_months??data.months):view==='transfers'?(data.transfer_months??[]):data.months;}
export function selectedMonths(data:HouseholdOverview,start:number,end:number,view:HouseholdView='household'){return viewMonths(data,view).slice(Math.max(0,start),Math.min(data.months.length,Math.max(start+1,end)));}
export function forecastValue(f:NonNullable<HouseholdOverview['forecast']>,month:string){
 if(!f.end_date)return f.baseline;
 // An explicit planning assumption: benefits paid the following month.
 const serviceMonth=addMonth(month,-1),endMonth=f.end_date.slice(0,7);
 if(serviceMonth<endMonth)return f.baseline;
 if(serviceMonth>endMonth)return f.baseline-f.monthly_income;
 const year=Number(serviceMonth.slice(0,4)),m=Number(serviceMonth.slice(5)),days=new Date(Date.UTC(year,m,0)).getUTCDate();
 return f.baseline-f.monthly_income*(1-Number(f.end_date.slice(8))/days);
}
export function householdTimeline(data:HouseholdOverview,start:number,end:number,horizon:number,view:HouseholdView='household'){
 const actual=selectedMonths(data,start,end,view).map(m=>({month:m.month,incoming:m.incoming,outgoing:m.outgoing,net:m.net,actual:true}));
 if(view!=='household'||end!==data.months.length||!data.forecast||!actual.length)return actual;
 return [...actual,...Array.from({length:Math.max(0,Math.min(6,horizon))},(_,i)=>{const month=addMonth(actual.at(-1)!.month,i+1);return {month,incoming:0,outgoing:0,net:forecastValue(data.forecast!,month),actual:false};})];
}
export function monthCenters(width:number,count:number){const left=48,right=10,step=(width-left-right)/Math.max(1,count);return {left,right,step,x:(i:number)=>left+(i+.5)*step};}
/** Elliptical top with front-facing extrusion; amounts determine actual angles. */
export function expensePie(items:{id:string;amount:number;color:string}[],width:number,depth=18){
 const height=Math.min(280,width*.65+32),cx=width/2,cy=height*.43,rx=width*.44,ry=Math.min(rx*.62,cy-10),total=items.reduce((s,c)=>s+c.amount,0);let angle=-Math.PI/2;
 const point=(a:number,dy=0)=>`${cx+rx*Math.cos(a)} ${cy+ry*Math.sin(a)+dy}`;
 const slices=items.filter(c=>c.amount>0).map(c=>{const a=angle,b=angle+c.amount/total*Math.PI*2;angle=b;const mid=(a+b)/2;
  // Two arcs also correctly render a single category occupying the full circle.
  const top=`M ${cx} ${cy} L ${point(a)} A ${rx} ${ry} 0 0 1 ${point(mid)} A ${rx} ${ry} 0 0 1 ${point(b)} Z`;
  const sides=[-2*Math.PI,0,2*Math.PI].flatMap(offset=>{const start=Math.max(a,offset),end=Math.min(b,offset+Math.PI);return end>start?[`M ${point(start)} A ${rx} ${ry} 0 0 1 ${point(end)} L ${point(end,depth)} A ${rx} ${ry} 0 0 0 ${point(start,depth)} Z`]:[];});
  return {...c,top,sides,share:c.amount/total,x:cx+rx*.64*Math.cos(mid),y:cy+ry*.64*Math.sin(mid)};
 });return {height,cx,cy,rx,ry,slices};
}
