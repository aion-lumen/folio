import { join } from 'node:path';
import { getSessionExchangePath } from '../../env.js';
import { documentBytes, sha256 } from '../../file-intake/document-security.js';
import { canonicalJson } from './reconciliation.js';
import type { WealthOverview } from '$lib/ledger-wealth.js';

export function validateWealth(value:unknown): WealthOverview {
 const x=value as WealthOverview;
 if(!x||x.schema!=='ledger/wealth-overview/v1'||x.status!=='partial_source_bound_projection'||!/^\d{4}-\d{2}-\d{2}T/.test(x.generated_at))throw Error('schema');
 const {projection_sha256,...body}=x;
 if(projection_sha256!==sha256(canonicalJson(body)))throw Error('digest');
 if(x.bookkeeping?.ledger_db_touched!==false||x.bookkeeping?.orders_possible!==false||x.bookkeeping?.payments_changed!==false)throw Error('effects');
 const money=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=1e12;
 const currency=(v:unknown)=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
 const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
 const array=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max;
 if(!array(x.accounts,50)||!array(x.cashflows,10000)||!array(x.currency_totals,30)||!array(x.native_cash,30)||!array(x.valuations,100)||!array(x.estimates,100)||!array(x.gaps,100))throw Error('bounds');
 if(new Set(x.accounts.map(a=>a.id)).size!==x.accounts.length)throw Error('duplicate');
 for(const a of x.accounts){
  if(!/^acct_[a-f0-9]{20}$/.test(a.id)||!['bank','broker'].includes(a.kind)||!currency(a.currency)||!day(a.as_of)||![a.total,a.cash,a.invested].every(money)||!array(a.history,5000)||!array(a.positions,500)||!array(a.checks,100)||!array(a.gaps,100)||!array(a.cash_by_currency,30)||!a.evidence?.sha256)throw Error('account');
  if(Math.abs(Number(a.total)-Number(a.cash)-Number(a.invested))>.011)throw Error('balance');
  if(a.history.some(p=>!day(p.date)||!money(p.amount)))throw Error('history');
  if(a.positions.some(p=>!currency(p.currency)||![p.quantity,p.value,p.cost,p.unrealized,p.base_value].every(money)))throw Error('position');
 }
 for(const t of x.currency_totals)if(!currency(t.currency)||![t.total,t.cash,t.invested].every(money))throw Error('totals');
 for(const c of x.native_cash)if(!currency(c.currency)||!money(c.amount))throw Error('cash');
 for(const f of x.cashflows)if(!currency(f.currency)||![f.incoming,f.outgoing,f.net].every(money)||!/^\d{4}-\d{2}$/.test(f.month)||f.basis!=='gross_account_movements')throw Error('flow');
 for(const e of x.estimates)if(!currency(e.currency)||!money(e.low)||!money(e.high)||e.basis!=='owner_estimate')throw Error('estimate');
 for(const v of x.valuations)if(!currency(v.currency)||!money(v.amount)||!day(v.date)||v.method!=='visual_transcription')throw Error('valuation');
 if(x.conversion&&(!currency(x.conversion.base)||!money(x.conversion.total)||!day(x.conversion.date)))throw Error('conversion');
 return x;
}

export function readWealthOverview() {
 try {
  const root=join(getSessionExchangePath(),'ledger');
  const overview=validateWealth(JSON.parse(documentBytes(join(root,'wealth','overview.json'),2*1024*1024).toString('utf8')));
  const batch=JSON.parse(documentBytes(join(root,'manual-statements','statement-batch.json'),64*1024*1024).toString('utf8'));
  const current=sha256(canonicalJson({sources:batch.sources,entries:batch.entries,issues:batch.issues}));
  if(current!==batch.batch_sha256)throw Error('bank_batch_changed');
  return {overview,stale:current!==overview.bank_batch_sha256,error:null};
 } catch {return {overview:null,stale:false,error:'Die beleggebundene Vermögensübersicht ist noch nicht verfügbar oder ihre Prüfung ist fehlgeschlagen.'};}
}
