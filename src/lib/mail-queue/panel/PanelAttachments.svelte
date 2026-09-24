<script lang="ts">
 let { feedbackId }:{feedbackId:number}=$props();
 let result=$state<{check:{status:string;parts:number;ready:number;reason:string|null}|null;items:{id:string;filename:string;available:boolean;state:string;knowledge:string;proposal_id:string|null}[]}|null>(null);
 const knowledge:Record<string,string>={confirmed:'Wissen lokal geprüft',needs_review:'Wissen braucht Klärung',rejected:'Wissensvorschlag verworfen',needs_ocr:'Texterkennung nötig',general_reference:'Allgemeines Dokument',example:'Muster · keine persönlichen Fakten',no_personal_fact:'Keine persönlichen Fakten',duplicate_only:'Wissen bereits vorhanden',missed_facts:'Wissensextraktion unvollständig'};
 const status:Record<string,string>={unsupported_type:'Dateityp noch nicht unterstützt',blocked_active_content:'Aktiver Inhalt gesperrt',blocked_archive:'Archiv bleibt geschlossen',part_budget:'Außerhalb des Verarbeitungslimits',invalid_pdf:'Ungültiges PDF',blocked:'Sicherheitsprüfung nicht bestanden',error:'Prüfung fehlgeschlagen',not_scanned:'Scan ausstehend'};
 $effect(()=>{
  const id=feedbackId;result=null;const controller=new AbortController();
  if(Number.isSafeInteger(id)&&id>0)fetch(`/api/mail/attachments/${id}`,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)result=data;}).catch(()=>{});
  return ()=>controller.abort();
 });
</script>
{#if result}
 <details class="attachments">
  <summary>Anhänge{#if result.check?.status==='checked'} · {result.items.length}{:else} · noch nicht vollständig geprüft{/if}</summary>
  {#each result.items as item (item.id)}
   <div class="attachment">
    {#if item.available}<a href={`/api/mail/attachments/${feedbackId}/${item.id}`} download>{item.filename}</a><span>{knowledge[item.knowledge]??'Geprüft · Text verfügbar'}{#if item.knowledge==='needs_review'&&item.proposal_id} · <a href={`/memory?view=review&proposal=${item.proposal_id}#proposal-${item.proposal_id}`}>Prüfen</a>{/if}</span>
    {:else}<span>{item.filename}</span><span>{status[item.state]??'Prüfnachweis fehlt'}</span>{/if}
   </div>
  {/each}
  {#if !result.items.length}<p>{result.check?.status==='checked'?'Keine Dateianhänge gefunden.':'Die Anhangserfassung steht für diese Mail noch aus.'}</p>{:else}<p>Die Dateiprüfung bestätigt keine Aussagen im Gedächtnis.</p>{/if}
 </details>
{/if}
<style>
 .attachments{padding:12px 16px;border-top:1px solid var(--color-border);font-size:12px}summary{cursor:pointer;font-weight:600}.attachment{display:flex;flex-wrap:wrap;justify-content:space-between;gap:5px 12px;margin-top:10px}.attachment a{overflow-wrap:anywhere;color:var(--color-foreground);text-decoration:underline}.attachment>span:last-child,p{color:var(--color-muted-foreground);font-size:11px}p{margin-top:10px}
</style>
