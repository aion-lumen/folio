<script lang="ts">
 import {ArrowRight,FileText,ExternalLink,Download,Check,LoaderCircle} from 'lucide-svelte';
 import HouseholdEntryEvidence from './HouseholdEntryEvidence.svelte';
 import HouseholdDocumentPreview from './HouseholdDocumentPreview.svelte';
 import type {HouseholdEntryDetail,HouseholdDocument} from '$lib/ledger-household.js';
 let {id,batch,showCounterparts=true,fee=false}:{id:string;batch:string;showCounterparts?:boolean;fee?:boolean}=$props();
 let detail=$state<HouseholdEntryDetail|null>(null),document=$state<HouseholdDocument|null>(null),detailLoading=$state(true),detailFailure=$state('');
 const money=(n:number,c:string)=>new Intl.NumberFormat('de-CH',{style:'currency',currency:c}).format(n);
 $effect(()=>{
  const controller=new AbortController();detail=null;document=null;detailLoading=true;detailFailure='';
  fetch(`/api/ledger/household/entries/${id}?batch=${batch}&fee=${fee?1:0}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Der Beleg konnte nicht aktuell geprüft werden. Bitte die Übersicht neu laden.');return r.json();}).then((next:HouseholdEntryDetail)=>{if(controller.signal.aborted)return;detail=next;document=next.documents.find(d=>d.kind==='invoice')??next.documents[0]??null;}).catch(e=>{if(!controller.signal.aborted)detailFailure=e instanceof Error?e.message:'Beleg nicht verfügbar.';}).finally(()=>{if(!controller.signal.aborted)detailLoading=false;});
  return()=>controller.abort();
 });
</script>
<div class="entry-evidence" aria-live="polite" aria-busy={detailLoading}>
  {#if detailLoading}<p class="loading"><LoaderCircle size={16}/> Belegverknüpfung prüfen …</p>{:else if detailFailure}<p role="alert">{detailFailure}</p>{:else if detail}
   <div class="evidence-head"><strong>{detail.entry.title}</strong><span>{money(detail.entry.amount,detail.entry.currency)}</span></div>
   <small>{detail.entry.date} · {detail.entry.account}</small>
   <details><summary>Buchungstext</summary><pre>{detail.entry.purpose}</pre></details>
   <p class="proof-status">{#if detail.entry.transfer}Bewegung über {detail.entry.transfer.provider==='wise'?'Wise':'Interactive Brokers'} · {detail.entry.transfer.status==='paired'?'beide Bankseiten abgeglichen':detail.entry.transfer.status==='provider_evidenced'?'Transferbeleg zugeordnet · zweite Bankseite fehlt':detail.entry.transfer.status==='external_payment'?'Zahlung mit anderem Beteiligten · kein bestätigter Eigenübertrag':detail.entry.transfer.status==='ambiguous'?'Zuordnung mehrdeutig':'Bankbewegung erkannt · Transferkette noch offen'}{:else if detail.entry.amount>0}{detail.documents.some(d=>d.kind==='statement')?'Eingang im Kontoauszug belegt':'Eingang · Originalbeleg derzeit nicht verfügbar'}{:else if detail.invoice_status==='verified'}<Check size={15}/> Rechnung und Zahlung systembestätigt{:else}Rechnung noch nicht verknüpft · kein Hinweis auf Nichtzahlung{/if}</p>
   {#if detail.entry.transfer?.record}{@const r=detail.entry.transfer.record}<div class="transfer-proof"><strong>{money(r.source_amount_basis==='gross'?r.source_amount:r.source_amount+(r.source_fee??0),r.source_currency)} → {money(r.target_amount,r.target_currency)}</strong><small>Wise · {r.completed}{#if r.source_format==='wise-ui-text'} · eigene Aktivitätskopie{:else} · Transfer {r.id}{/if}</small><a href={`/api/ledger/transfers/sources/${r.source_sha256}`}>{r.source_format==='wise-ui-text'?'Textquelle · Zeile':'CSV-Originalbeleg · Datensatz'} {r.line} <Download size={12}/></a></div>{/if}
   {#if detail.fee}
    {#if detail.fee.status==='documented'}<p class="proof-status">Belegte Gebühr: {detail.fee.components.map(c=>money(c.amount,c.currency)).join(' + ')||'0'}</p>{/if}
    <details open={Boolean(detail.entry.fee_component)}><summary>{detail.fee.status==='estimated'?'Geschätzte Gebühr · '+detail.fee.components.map(c=>money(c.amount,c.currency)).join(' + '):detail.fee.status==='unknown'?'Gebührenbasis offen':'Gebührenbelege'}</summary>
     <p>{detail.fee.method} {#if detail.entry.fee_component}Anzeigeanteil der Überweisung; der Kontoauszug enthält den gesamten Übertrag.{/if}</p>
     {#each detail.fee.evidence as proof}<p>{proof.date} · {proof.subject}<br/>{proof.quote}<small> · Mail #{proof.feedback_id}</small></p>{/each}
     {#each detail.fee.samples as sample}<p>{sample.date}: {money(sample.fee,sample.currency)} bei {money(sample.gross,sample.currency)}</p>{/each}
    </details>
   {/if}
   {#if showCounterparts}{#each detail.counterparts??[] as other}<details><summary>Gegenbuchung · {other.date} · {money(other.amount,other.currency)} · {other.account}</summary><HouseholdEntryEvidence id={other.id} {batch} showCounterparts={false}/></details>{/each}{/if}
   {#each detail.warnings as warning}<p role="status">{warning}</p>{/each}
   {#if detail.documents.length}<div class="document-choices" aria-label="Belege zu dieser Buchung">{#each detail.documents as d}<button class:active={document?.url===d.url} onclick={()=>document=d}><FileText size={14}/>{d.kind==='invoice'?'Rechnung':'Kontoauszug'}</button>{/each}</div>
    {#if document}<div class="document-header"><span>{document.label}</span><div><a href={document.url} target="_blank" rel="noopener noreferrer" aria-label="Originalbeleg öffnen"><ExternalLink size={16}/></a><a href={document.url+'&download=1'} aria-label="Originalbeleg herunterladen"><Download size={16}/></a></div></div>{#key document.url}<HouseholdDocumentPreview url={document.url} label={document.label}/>{/key}{#if document.locator}<small>Fundstelle im Auszugstext: Zeile {document.locator}</small>{/if}{/if}
   {:else}<p>Zur Buchung ist aktuell kein unverändert geprüfter Originalbeleg verfügbar.</p>{/if}
   {#if detail.memory_url}<a class="memory-link" href={detail.memory_url}>Bestätigung im Gedächtnis <ArrowRight size={14}/></a>{/if}
  {/if}
</div>
<style>
.transfer-proof{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--hh-line);border-radius:8px;font-size:12px}.transfer-proof small{color:var(--hh-muted)}.transfer-proof a{display:flex;gap:5px;align-items:center;color:var(--hh-blue)}
.entry-evidence{min-width:0}.evidence-head{display:flex;gap:15px;justify-content:space-between;align-items:start;margin-bottom:5px}.evidence-head strong{overflow-wrap:anywhere}.evidence-head span{flex:none;font-variant-numeric:tabular-nums}.entry-evidence>small{font-size:11px;color:var(--hh-muted)}.entry-evidence details{margin-top:14px;font-size:12px}.entry-evidence summary{cursor:pointer;color:var(--hh-muted)}pre{font:12px/1.6 inherit;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--hh-soft);padding:12px;border-radius:8px}.proof-status{font-size:12px!important;display:flex;align-items:center;gap:6px;margin-bottom:15px!important}.proof-status :global(svg){flex:none}.document-choices{display:flex;flex-wrap:wrap;gap:8px}.document-choices button{display:flex;align-items:center;gap:6px;font-size:12px;padding:8px 10px;border-radius:8px;border:1px solid var(--hh-line)!important}.document-choices button.active{background:var(--hh-soft)!important}.document-header{display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:11px;margin:16px 0 10px;color:var(--hh-muted)}.document-header>div{display:flex;gap:12px}.document-header a{color:var(--hh-blue);padding:5px}.loading{display:flex;align-items:center;gap:8px;font-size:12px!important}.memory-link{display:flex;align-items:center;gap:5px;color:var(--hh-blue);font-size:12px;margin-top:16px}
</style>
