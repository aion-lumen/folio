import type {HouseholdEntry,HouseholdSettings,HouseholdView,TransferFee} from '$lib/ledger-household.js';

/** Ownership and completed linkage are separate claims. A missing bank side
 * does not turn an evidenced own-account transfer into household income. */
export function ownTransfer(e:HouseholdEntry,settings:HouseholdSettings):boolean {
 const t=e.transfer;if(!t||['ambiguous','external_payment'].includes(t.status))return false;
 return Boolean(t.record?.own&&['paired','provider_evidenced'].includes(t.status)) ||
  (t.status==='bank_leg'&&Boolean(settings.own_transfer_providers?.includes(t.provider)));
}
/** Display projection only: source entries and journal remain immutable.
 * A fee component retains its bank entry ID so drill-down reaches the original. */
export function householdViewEntries(raw:HouseholdEntry[],settings:HouseholdSettings,fees:Map<string,TransferFee>,convert:(n:number,currency:string)=>number,view:HouseholdView):HouseholdEntry[]{
 if(view==='accounts')return raw;
 if(view==='transfers')return raw.filter(e=>e.transfer&&e.transfer.status!=='external_payment');
 const rows=raw.filter(e=>!ownTransfer(e,settings));
 const anchors=new Map<string,HouseholdEntry>();
 for(const e of raw){if(!ownTransfer(e,settings)||!e.transfer?.record)continue;const key=e.transfer.record.id,old=anchors.get(key);if(!old||e.amount<0&&old.amount>0||Math.sign(e.amount)===Math.sign(old.amount)&&e.date<old.date)anchors.set(key,e);}
 for(const [key,e] of anchors){const fee=fees.get(key);if(!fee||fee.status==='unknown')continue;const total=fee.components.reduce((n,c)=>n+convert(c.amount,c.currency),0);if(total<=0)continue;
  rows.push({...e,amount:-total,display_amount:-total,currency:settings.currency,title:`Wise · Umtauschgebühr${fee.status==='estimated'?' (geschätzt)':''}`,category:'transfer_fees',fee_component:fee,purpose:e.purpose});
 }
 return rows;
}
