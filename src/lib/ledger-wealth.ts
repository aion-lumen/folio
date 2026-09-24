export type WealthEvidence = { sha256:string; filename:string; profile:string; source_count?:number };
export type WealthAccount = {
 id:string; label:string; kind:'bank'|'broker'; currency:string; as_of:string; date_basis:string;
 period:{from:string;to:string}; total:string; cash:string; invested:string; investment_basis:string|null;
 cash_by_currency:{currency:string;amount:string}[];
 positions:{symbol:string;quantity:string;currency:string;value:string;cost:string;unrealized:string;base_value:string;line:number}[];
 history:{date:string;amount:string;basis:string}[]; history_kind:string; checks:string[]; gaps:string[]; evidence:WealthEvidence;
};
export type WealthOverview = {
 schema:'ledger/wealth-overview/v1'; generated_at:string; projection_sha256:string; bank_batch_sha256:string;
 bank_transaction_count:number; scope:string; status:'partial_source_bound_projection';
 accounts:WealthAccount[]; currency_totals:{currency:string;total:string;cash:string;invested:string}[];
 native_cash:{currency:string;amount:string}[];
 conversion:null|{date:string;base:string;rates:Record<string,string>;source:string;total:string;basis:string};
 cashflows:{account_id:string;currency:string;month:string;incoming:string;outgoing:string;net:string;count:number;basis:string}[];
 valuations:{label:string;date:string;currency:string;amount:string;method:string;condition:string;evidence:WealthEvidence}[];
 estimates:{label:string;currency:string;low:string;high:string;basis:string;source:string}[];
 gaps:string[]; bookkeeping:{ledger_db_touched:false;payments_changed:false;orders_possible:false};
};

/** Display-only scenario in whole cents. No persisted forecast, price feed or order. */
export function liquidityScenario(start:number,incoming:number,outgoing:number,oneOff:number,reserve:number,months=12) {
 const inputs=[start,incoming,outgoing,oneOff,reserve];
 if(inputs.some(n=>!Number.isFinite(n)||Math.abs(n)>100_000_000)||incoming<0||outgoing<0||reserve<0||!Number.isInteger(months)||months<1||months>60) return null;
 const [s,i,o,once,floor]=inputs.map(n=>BigInt(Math.round(n*100)));
 const points=Array.from({length:months+1},(_,m)=>({month:m,amount:Number(s+BigInt(m)*(i-o)+(m>0?once:0n))/100}));
 return {points,monthlyNet:Number(i-o)/100,end:points.at(-1)!.amount,belowReserve:points.find(p=>BigInt(Math.round(p.amount*100))<floor)?.month??null};
}
