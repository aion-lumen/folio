<script lang="ts">
 import {ChevronRight,ArrowLeft,ArrowRight} from 'lucide-svelte';
 import HouseholdEntryEvidence from './HouseholdEntryEvidence.svelte';
 import {monthLabel,type HouseholdDirection,type HouseholdEntry,type HouseholdView} from '$lib/ledger-household.js';
 let {view='household',from,to,batch,category,subcategory,partner,direction}:{view?:HouseholdView;from:string;to:string;batch:string;category:string;subcategory:string;partner:string;direction:HouseholdDirection}=$props();
 let entries=$state<HouseholdEntry[]>([]),total=$state(0),offset=$state(0),loading=$state(true),failure=$state(''),selected=$state('');
 const money=(e:HouseholdEntry)=>new Intl.NumberFormat('de-CH',{style:'currency',currency:e.currency}).format(Math.abs(e.amount));
 const date=(e:HouseholdEntry)=>e.aggregate?monthLabel(e.date,true):new Date(e.date+'T12:00:00Z').toLocaleDateString('de-CH',{timeZone:'UTC'});
 $effect(()=>{
  const controller=new AbortController();loading=true;failure='';selected='';
  fetch('/api/ledger/household/entries?'+new URLSearchParams({view,from,to,batch,category,subcategory,partner,offset:String(offset),direction}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Buchungen nicht verfügbar. Bitte die Übersicht neu laden.');return r.json();}).then(r=>{if(controller.signal.aborted)return;entries=r.entries;total=r.total;}).catch(e=>{if(!controller.signal.aborted)failure=e.message;}).finally(()=>{if(!controller.signal.aborted)loading=false;});
  return()=>controller.abort();
 });
</script>
<div class="leaf-list" aria-busy={loading}>
 {#if loading}<p class="status">Buchungen laden …</p>{:else if failure}<p class="status" role="alert">{failure}</p>{:else}
  {#each entries as e}<div class="leaf">
   <button class="leaf-row" aria-expanded={selected===e.id} aria-controls={`expense-evidence-${e.id}`} onclick={()=>selected=selected===e.id?'':e.id}><ChevronRight size={13} class={selected===e.id?'expanded':''}/><span><time>{date(e)}</time><small>{e.account}{e.fee_component?.status==='estimated'?' · geschätzt':''}</small></span><strong>{money(e)}</strong></button>
   {#if selected===e.id}<div id={`expense-evidence-${e.id}`} class="leaf-proof"><HouseholdEntryEvidence id={e.id} fee={Boolean(e.fee_component)} {batch}/></div>{/if}
  </div>{/each}
  {#if total>25}<div class="paging"><button aria-label="Vorherige Buchungen in dieser Gruppe" disabled={offset===0} onclick={()=>offset=Math.max(0,offset-25)}><ArrowLeft size={14}/></button><span>{offset+1}–{Math.min(offset+25,total)} / {total}</span><button aria-label="Weitere Buchungen in dieser Gruppe" disabled={offset+25>=total} onclick={()=>offset+=25}><ArrowRight size={14}/></button></div>{/if}
 {/if}
</div>
<style>
 .leaf-list{padding:2px 0 6px}.leaf+.leaf{border-top:1px solid var(--hh-line)}.leaf-row{display:flex;width:100%;align-items:center;gap:8px;padding:10px 4px;text-align:left;font-size:12px}.leaf-row>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.leaf-row small{font-size:10px;color:var(--hh-muted)}.leaf-row>strong{white-space:nowrap;font-variant-numeric:tabular-nums}.leaf-row :global(svg){flex:none;color:var(--hh-muted);transition:transform .15s}.leaf-row :global(svg.expanded){transform:rotate(90deg)}.leaf-proof{padding:12px 0 15px;border-top:1px dashed var(--hh-line)}.paging{display:flex;justify-content:space-between;align-items:center;font-size:11px}.paging button{padding:10px}.paging button:disabled{opacity:.3}.status{font-size:12px;padding:10px;color:var(--hh-muted)}
</style>
