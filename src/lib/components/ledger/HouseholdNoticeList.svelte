<script lang="ts">
 import type {HouseholdNotice} from '$lib/ledger-household.js';
 import HouseholdEntryEvidence from './HouseholdEntryEvidence.svelte';
 let {notices,batch}:{notices:HouseholdNotice[];batch:string}=$props();
 let selected=$state('');
 const money=(n:number,currency:string)=>new Intl.NumberFormat('de-CH',{style:'currency',currency}).format(n);
</script>
{#if notices.length}<div class="notice-list">{#each notices as n}<details class:urgent={n.urgent}><summary>{n.label}</summary><p>{n.detail}</p>
 {#if n.explanations?.length}<ul>{#each n.explanations as explanation}<li>{explanation}</li>{/each}</ul>{/if}
 {#if n.evidence?.length}<details class="evidence"><summary>{n.kind==='expected'?'Buchungen der Prognose':'Auslösende Buchungen'}{n.evidence.length===12?' · grösste 12':''}</summary>{#each n.evidence as e}
  <button class="source" aria-expanded={selected===n.id+e.id} onclick={()=>selected=selected===n.id+e.id?'':n.id+e.id}><span>{e.date.split('-').reverse().join('.')} · {e.label}</span><strong>{money(e.amount,e.currency)}</strong></button>
  {#if selected===n.id+e.id}<HouseholdEntryEvidence id={e.id} {batch}/>{/if}
 {/each}</details>{/if}
 </details>{/each}</div>{/if}
<style>
 .notice-list{display:grid;gap:5px;margin:0 0 9px}.notice-list details{border-left:2px solid var(--hh-line);padding:5px 8px;background:var(--hh-soft);border-radius:0 5px 5px 0}.notice-list details.urgent{border-color:var(--hh-red);background:#be5c680b}.notice-list summary{cursor:pointer;font-size:11px;color:var(--hh-muted)}.notice-list .urgent summary{color:var(--hh-red)}.notice-list p{font-size:11px;line-height:1.55;color:var(--hh-muted);margin-top:6px}
 .notice-list ul{font-size:11px;line-height:1.55;color:var(--hh-muted);padding-left:17px;margin:8px 0}.notice-list li+li{margin-top:5px}.source{display:flex;gap:12px;justify-content:space-between;text-align:left;width:100%;padding:9px 0;font-size:11px}.source strong{white-space:nowrap}.source span{overflow-wrap:anywhere}.notice-list .evidence{margin-top:8px}
</style>
