<script lang="ts">
 import {ChevronRight} from 'lucide-svelte';
 import HouseholdExpenseEntries from './HouseholdExpenseEntries.svelte';
 import HouseholdNoticeList from './HouseholdNoticeList.svelte';
 import {expenseCategories,incomeCategories,type ExpenseKind,type HouseholdMonth,type HouseholdExpenseBranch,type HouseholdNotice,type HouseholdDirection,type HouseholdView} from '$lib/ledger-household.js';
 let {view='household',months,batch,money,branches,notices,direction,openCategory=$bindable(''),group=''}:{view?:HouseholdView;months:HouseholdMonth[];batch:string;money:(n:number)=>string;branches:HouseholdExpenseBranch[];notices:HouseholdNotice[];direction:HouseholdDirection;openCategory:string;group:ExpenseKind|''}=$props();
 let subcategory=$state(''),partner=$state(''),partnerLimit=$state(20);
 const cats=$derived((direction==='debit'?expenseCategories:incomeCategories).map(c=>({...c,amount:branches.find(b=>b.id===c.id)?.amount??0})).filter(c=>c.amount>.005&&(!group||c.kind===group)));
 const summary=(n:number)=>n>0&&n<50?'< '+money(100):money(n);
 const total=$derived(branches.reduce((n,c)=>n+c.amount,0));
 const from=$derived(months[0]?.month??''),to=$derived(months.at(-1)?.month??'');
 const hints=(category:string,child='',provider='')=>notices.filter(n=>n.category===category&&(!child||n.subcategory===child)&&(!provider||!n.partner||n.partner===provider));
 const ownHints=(category:string,child='',provider='')=>hints(category,child,provider).filter(n=>provider?true:child?!n.partner:!n.subcategory);
 const urgent=(category:string,child='',provider='')=>hints(category,child,provider).some(n=>n.urgent);
 $effect(()=>{openCategory;subcategory='';partner='';partnerLimit=20;});
</script>
<div class="expense-tree" aria-label={direction==='debit'?'Ausgabenkategorien aufklappen':'Einnahmekategorien aufklappen'}>
 {#each cats as c}<div class="category" class:opened={openCategory===c.id}>
  <button class="tree-row category-row" class:attention-row={urgent(c.id)} aria-expanded={openCategory===c.id} aria-controls={`expense-category-${c.id}`} onclick={()=>openCategory=openCategory===c.id?'':c.id}><ChevronRight size={14} class={openCategory===c.id?'expanded':''}/><i class="hh-dot" style={`--swatch:var(--hh-${c.color})`}></i><span>{c.label}<small>{Math.round(c.amount/total*100)} %</small>{#if urgent(c.id)}<small class="hint">Zeit- / Betragshinweis</small>{/if}</span><strong>{summary(c.amount)}</strong></button>
  {#if openCategory===c.id}<div id={`expense-category-${c.id}`} class="branch">
   <HouseholdNoticeList {batch} notices={ownHints(c.id)}/>
    {#each branches.find(b=>b.id===c.id)?.children??[] as child}<div class="subgroup">
     <button class="tree-row" class:attention-row={urgent(c.id,child.id)} aria-expanded={subcategory===child.id} aria-controls={`expense-subcategory-${c.id}-${child.id}`} onclick={()=>{subcategory=subcategory===child.id?'':child.id;partner='';partnerLimit=20;}}><ChevronRight size={13} class={subcategory===child.id?'expanded':''}/><span>{child.label}<small>{child.count} {child.count===1?'Buchung':'Buchungen'}</small></span><strong>{summary(child.amount)}</strong></button>
     {#if subcategory===child.id}<div id={`expense-subcategory-${c.id}-${child.id}`} class="branch"><HouseholdNoticeList {batch} notices={ownHints(c.id,child.id)}/>
      {#each child.partners.slice(0,partnerLimit) as p}<div class="partner">
       <button class="tree-row" class:attention-row={urgent(c.id,child.id,p.id)} aria-expanded={partner===p.id} aria-controls={`expense-partner-${p.id}`} onclick={()=>partner=partner===p.id?'':p.id}><ChevronRight size={13} class={partner===p.id?'expanded':''}/><span>{p.label}<small>{p.count} {p.count===1?'Buchung':'Buchungen'}{p.tentative?' · Zuordnung offen':''}</small></span><strong>{summary(p.amount)}</strong></button>
       {#if partner===p.id}<div id={`expense-partner-${p.id}`} class="branch leaf-branch"><HouseholdNoticeList {batch} notices={ownHints(c.id,child.id,p.id)}/><HouseholdExpenseEntries {view} {direction} {from} {to} {batch} category={c.id} subcategory={child.id} partner={p.id}/></div>{/if}
      </div>{/each}
      {#if partnerLimit<child.partners.length}<button class="more" onclick={()=>partnerLimit+=20}>Weitere {Math.min(20,child.partners.length-partnerLimit)} Buchungspartner</button>{/if}
     </div>{/if}
    </div>{/each}
  </div>{/if}
 </div>{/each}
</div>
<style>
 .tree-row.attention-row{background:#be5c6808;border-radius:6px;box-shadow:inset 2px 0 #be5c6844;padding-left:6px}.tree-row .hint{color:var(--hh-red);font-size:9px;display:block;margin-left:0}
 .category{border-bottom:1px solid var(--hh-line)}.category:last-child{border-bottom:0}.tree-row{display:flex;width:100%;align-items:center;gap:7px;padding:10px 0;text-align:left;font-size:12px;min-height:40px}.tree-row>span{flex:1;min-width:0;overflow-wrap:anywhere}.tree-row>strong{white-space:nowrap;font-variant-numeric:tabular-nums}.tree-row small{display:block;font-size:10px;color:var(--hh-muted);margin-top:3px}.category-row small{display:inline;margin-left:6px}.tree-row :global(svg){flex:none;color:var(--hh-muted);transition:transform .15s}.tree-row :global(svg.expanded){transform:rotate(90deg)}.branch{margin-left:6px;padding-left:10px;border-left:1px solid var(--hh-line)}.leaf-branch{margin-left:4px;padding-left:6px}.opened>.tree-row{color:var(--hh-blue)!important}.subgroup+.subgroup,.partner+.partner{border-top:1px solid var(--hh-line)}.more{font-size:11px;padding:12px 0;color:var(--hh-blue)!important}
</style>
