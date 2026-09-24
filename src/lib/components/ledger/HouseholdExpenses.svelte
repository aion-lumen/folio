<script lang="ts">
 import HouseholdExpenseTree from './HouseholdExpenseTree.svelte';
 import HouseholdAttention from './HouseholdAttention.svelte';
 import {expenseCategories,incomeCategories,expensePie,type HouseholdMonth,type ExpenseKind,type HouseholdDirection,type HouseholdTreeData,type HouseholdView} from '$lib/ledger-household.js';
 let {view='household',months,money,batch,direction='debit',initialCategory=''}:{view?:HouseholdView;months:HouseholdMonth[];money:(value:number)=>string;batch:string;direction?:HouseholdDirection;initialCategory?:string}=$props();
 let openCategory=$state(''),group=$state<ExpenseKind|''>(''),result=$state<HouseholdTreeData|null>(null),loading=$state(true),failure=$state('');
 function selectCategory(id:string){group='';openCategory=openCategory===id?'':id;}
 function selectGroup(id:ExpenseKind){group=group===id?'':id;openCategory='';}
 let width=$state(440);
 const from=$derived(months[0]?.month??''),to=$derived(months.at(-1)?.month??'');
 const cats=$derived((direction==='debit'?expenseCategories:incomeCategories).map(c=>({...c,amount:result?.categories.find(b=>b.id===c.id)?.amount??0})).filter(c=>c.amount>.005));
 const W=$derived(Math.max(220,width||440)),pie=$derived(expensePie(cats,W));
 const groups=[{id:'fixed',label:'Fixkosten',color:'blue'},{id:'variable',label:'Variabel',color:'orange'},{id:'unknown',label:'Nicht zugeordnet',color:'gray'},{id:'transfer',label:'Überträge',color:'purple'}] as const;
 $effect(()=>{
  const controller=new AbortController();loading=true;failure='';result=null;openCategory=(direction==='credit'?incomeCategories:expenseCategories).some(c=>c.id===initialCategory)?initialCategory:'';group='';
  fetch('/api/ledger/household/expenses?'+new URLSearchParams({view,from,to,batch,direction}),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Kategorien nicht verfügbar. Bitte die Übersicht neu laden.');return r.json();}).then(r=>{if(!controller.signal.aborted)result=r;}).catch(e=>{if(!controller.signal.aborted)failure=e.message;}).finally(()=>{if(!controller.signal.aborted)loading=false;});
  return()=>controller.abort();
 });
</script>
<div aria-busy={loading}>
 {#if loading}<p class="hh-small-note">Kategorien laden …</p>{:else if failure}<p class="hh-small-note" role="alert">{failure}</p>{:else if result}
 <div class="hh-chart hh-pie" bind:clientWidth={width}>
  <svg viewBox={`0 0 ${W} ${pie.height}`} role="img" aria-label={direction==='debit'?'Ausgaben nach Kategorien, Fixkosten blau und variable Kosten ocker':'Einnahmen und weitere Zugänge nach Kategorien'}>
   <ellipse cx={pie.cx} cy={pie.cy+26} rx={pie.rx*.98} ry={pie.ry*.94} fill="var(--hh-shadow)"/>
   {#each pie.slices as slice}{#each slice.sides as d}<path {d} fill={`color-mix(in srgb,var(--hh-${slice.color}) 75%,var(--hh-text))`}/>{/each}{/each}
   {#each pie.slices as slice}<a href="#household-expense-tree" aria-label={`${cats.find(c=>c.id===slice.id)?.label}: ${money(slice.amount)}, Kategorie aufklappen`} onclick={(e)=>{e.preventDefault();selectCategory(slice.id);}}><title>{cats.find(c=>c.id===slice.id)?.label} · {money(slice.amount)}</title><path class="hh-slice" d={slice.top} fill={`var(--hh-${slice.color})`}/></a>{/each}
   {#each pie.slices as slice}{#if slice.share>=.095}<text class="hh-strong-label" x={slice.x} y={slice.y+4} text-anchor="middle" style="pointer-events:none;fill:var(--hh-pie-ink)">{Math.round(slice.share*100)} %</text>{/if}{/each}
   {#if !cats.length}<text x={W/2} y={pie.height/2} text-anchor="middle">Keine Buchungen im Zeitraum</text>{/if}
  </svg>
 </div>
 {#if direction==='debit'}<div class="hh-groups">{#each groups.filter(g=>cats.some(c=>c.kind===g.id)||(view!=='transfers'&&g.id!=='transfer')) as g}<button class="hh-group" aria-pressed={group===g.id} onclick={()=>selectGroup(g.id)}><i class="hh-dot" style={`--swatch:var(--hh-${g.color})`}></i>{g.label}<strong>{money(cats.filter(c=>c.kind===g.id).reduce((s,c)=>s+c.amount,0))}</strong></button>{/each}</div>{:else}<p class="hh-small-note">{view==='household'?'Einkommen und Erstattungen · ohne bestätigte Eigenüberträge.':view==='transfers'?'Erkannte Transferbewegungen · fehlende Gegenbuchungen bleiben offen.':'Bruttozugänge inklusive Erstattungen und Überträgen.'}</p>{/if}
 {#if view!=='transfers'}<HouseholdAttention {batch} notices={result.notices} {direction} today={result.as_of} observed={result.observed_through}/>{/if}
 <div id="household-expense-tree"><HouseholdExpenseTree {view} {months} {money} {batch} {group} {direction} branches={result.categories} notices={result.notices} bind:openCategory/></div>
 {/if}
</div>
<style>.hh-group[aria-pressed=true]{outline:1px solid var(--hh-line);outline-offset:4px;border-radius:4px}</style>
