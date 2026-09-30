export interface StatementSource { account_ref:string; source_sha256?:string; declared_period?:{from:string;to:string}; control_result?:{complete:boolean}; }
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
/** Only full months of validated coverage, scoped to a specific account. */
export function coveredStatementMonths(sources:StatementSource[],account:string):Set<string>{
 const ranges=sources.filter(s=>s.account_ref===account&&s.control_result?.complete&&s.declared_period&&date(s.declared_period.from)&&date(s.declared_period.to)&&s.declared_period.from<=s.declared_period.to).map(s=>s.declared_period!).sort((a,b)=>a.from.localeCompare(b.from));
 const merged:{from:string;to:string}[]=[];
 for(const r of ranges){const last=merged.at(-1);if(last&&Date.parse(r.from)<=Date.parse(last.to)+86400000)last.to=last.to>r.to?last.to:r.to;else merged.push({...r});}
 const result=new Set<string>();
 for(const r of merged){let d=new Date(r.from+'T00:00:00Z');d.setUTCDate(1);for(let n=0;n<1200&&d.toISOString().slice(0,10)<=r.to;n++){const from=d.toISOString().slice(0,10),next=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)),to=new Date(next.getTime()-86400000).toISOString().slice(0,10);if(from>=r.from&&to<=r.to)result.add(from.slice(0,7));d=next;}}
 return result;
}
