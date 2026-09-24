<script lang="ts">
 import {ArrowLeft,ArrowRight,FileText,LoaderCircle} from 'lucide-svelte';
 import HouseholdEntryEvidence from './HouseholdEntryEvidence.svelte';
 import {monthLabel,type CategoryId,type ExpenseKind,type HouseholdEntry,type HouseholdView} from '$lib/ledger-household.js';
 let {view='household',from,to,batch,currency,category='',group='',direction='debit'}:{view?:HouseholdView;from:string;to:string;batch:string;currency:string;category?:CategoryId|'';group?:ExpenseKind|'';direction?:'debit'|'credit'|'all'}=$props();
 let offset=$state(0),entries=$state<HouseholdEntry[]>([]),total=$state(0),totalAmount=$state(0),limit=$state(25),loading=$state(false),failure=$state('');
 let selected=$state('');
 const money=(n:number,c=currency)=>new Intl.NumberFormat('de-CH',{style:'currency',currency:c}).format(n);
 const date=(e:HouseholdEntry)=>e.aggregate?monthLabel(e.date,true):new Date(e.date+'T12:00:00Z').toLocaleDateString('de-CH',{timeZone:'UTC'});
 $effect(()=>{const controller=new AbortController();const params=new URLSearchParams({view,from,to,batch,category,group,direction,offset:String(offset)});loading=true;failure='';
  fetch('/api/ledger/household/entries?'+params,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Die Auswahl ist nicht mehr aktuell. Bitte die Übersicht neu laden.');return r.json();}).then(result=>{if(controller.signal.aborted)return;entries=result.entries;total=result.total;totalAmount=result.total_amount;limit=result.limit;}).catch(e=>{if(!controller.signal.aborted)failure=e instanceof Error?e.message:'Buchungen nicht verfügbar.';}).finally(()=>{if(!controller.signal.aborted)loading=false;});return ()=>controller.abort();});
</script>
<div class="entries-summary"><span>{total} Buchungen</span><strong>{money(totalAmount)}</strong><span>{from} – {to}</span></div>
{#if failure}<p role="alert">{failure}</p>{/if}
<div class="entry-workspace">
 <div class="entry-list" aria-busy={loading}>
  {#if loading}<p class="loading"><LoaderCircle size={16}/> Buchungen laden …</p>{/if}
  {#each entries as e}<button class:selected={selected===e.id} onclick={()=>selected=e.id}><div><time>{date(e)}</time><strong>{e.title}</strong><small>{e.account}{e.aggregate?' · Monatssumme':''}</small></div><span>{money(e.amount,e.currency)}</span><FileText size={15}/></button>{/each}
  {#if !loading&&!entries.length&&!failure}<p>Keine Buchungen in dieser Auswahl.</p>{/if}
  {#if total>limit}<div class="pager"><button aria-label="Vorherige Buchungen" disabled={loading||offset===0} onclick={()=>offset=Math.max(0,offset-limit)}><ArrowLeft size={15}/></button><span>{offset+1}–{Math.min(total,offset+limit)} / {total}</span><button aria-label="Weitere Buchungen" disabled={loading||offset+limit>=total} onclick={()=>offset+=limit}><ArrowRight size={15}/></button></div>{/if}
 </div>
 <div class="entry-evidence">
  {#if selected}{#key selected}<HouseholdEntryEvidence id={selected} fee={Boolean(entries.find(e=>e.id===selected)?.fee_component)} {batch}/>{/key}
  {:else}<div class="select-hint"><FileText size={30}/><p>Buchung auswählen</p><small>Kontoauszug und verknüpfte Rechnung erscheinen hier.</small></div>{/if}
 </div>
</div>
<style>
 .entries-summary{display:flex;gap:15px;align-items:center;flex-wrap:wrap;margin-bottom:18px;font-size:12px;color:var(--hh-muted)}.entries-summary strong{color:var(--hh-text)}.entry-workspace{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:25px}.entry-list{min-width:0}.entry-list>button{display:flex;width:100%;align-items:center;text-align:left;gap:12px;padding:12px 9px;border-bottom:1px solid var(--hh-line)!important}.entry-list>button.selected{background:var(--hh-soft)!important;border-radius:8px}.entry-list>button>div{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.entry-list strong{font-size:12px;overflow-wrap:anywhere}.entry-list time,.entry-list small{font-size:11px;color:var(--hh-muted)}.entry-list>button>span{font-size:12px;flex:none;font-variant-numeric:tabular-nums}.entry-list>button>:global(svg){flex:none;color:var(--hh-muted)}.pager{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:12px}.pager button{padding:8px}.pager button:disabled{opacity:.35;cursor:default}.entry-evidence{min-width:0;border-left:1px solid var(--hh-line);padding-left:24px}.select-hint{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;min-height:210px;text-align:center;color:var(--hh-muted)}.select-hint p{margin:0!important}.select-hint small{font-size:12px;max-width:235px}.loading{display:flex;align-items:center;gap:8px;font-size:12px!important}
 @media(max-width:950px){.entry-workspace{grid-template-columns:1fr}.entry-evidence{border-left:0;border-top:1px solid var(--hh-line);padding:20px 0 0}.entry-list{max-height:400px;overflow-y:auto}}
</style>
