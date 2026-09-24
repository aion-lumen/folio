<script lang="ts">
 import { onMount } from 'svelte';
 import { chatStore } from '$lib/stores/chat.svelte.js';
 type Review={id:string;state:string;expiresAt:string;items:{company:string;title:string;date:string;feedbackId:number;requiresIdentityConfirmation:boolean}[];receipt:{appliedAt:string;count:number}|null};
 let {output}:{output:string}=$props();
 // Each event is immutable; only the approval receipt is refreshed.
 // svelte-ignore state_referenced_locally
 const report=JSON.parse(output) as {approval:Review|null;findings:{status:string;reasonCode:string;feedbackId?:number;mailTime:string}[]};
 let confirmed=$state<number[]>([]);
 let review=$state<Review|null>(report.approval),busy=$state(false),failure=$state(''),mail=$state<{id:number;text:string}|null>(null);
 const unclear=report.findings.filter(f=>!report.approval?.items.some(i=>i.feedbackId===f.feedbackId)&&['UNCLEAR','EVIDENCE_CONFLICT','STALE_REVISION','SOURCE_GAP'].includes(f.status));
 const reasons:Record<string,string>={local_model_evidence_unverified:'Das lokale Modell konnte diese Mail nicht verlässlich belegen',probable_match_requires_identity_confirmation:'Arbeitgeber oder Rolle nur ähnlich',multiple_position_matches:'Mehrere mögliche Bewerbungen',no_unique_position_match:'Keine eindeutige Bewerbung gefunden',matched_position_not_applied:'Tracker enthält keine versandte Bewerbung',forwarded_rejection_requires_review:'Weitergeleitete Absage: Empfängerzuordnung prüfen',tracker_changed_during_run:'Tracker zwischenzeitlich geändert'};
 async function action(action:'preview'|'approve') {
  if(!review)return;busy=true;failure='';
  try {
   const response=await fetch('/api/career/rejection-approval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:review.id,action,confirmedFeedbackIds:confirmed})});
   const data=await response.json();if(!response.ok)throw Error(data.message??'Freigabe fehlgeschlagen');review=data;
  }catch(e){failure=e instanceof Error?e.message:'Freigabe fehlgeschlagen';}finally{busy=false;}
 }
 async function source(id:number) {
  try{const response=await fetch(`/api/mail/body/${id}`);const data=await response.json();if(!response.ok)throw Error();mail={id,text:data.bodyText??'Kein vollständiger Mailtext verfügbar.'};}
  catch{failure='Die lokale Mailquelle konnte nicht geöffnet werden.';}
 }
 onMount(()=>{if(review)void action('preview');});
</script>

{#if review||unclear.length}
 <section class="review" aria-label="Absagenabgleich">
  {#if review}
   <strong>{review.state==='applied'?'Im Tracker erfasst':`${review.items.length} ${review.items.length === 1 ? 'Absage' : 'Absagen'} zur Freigabe`}</strong>
   <ul>{#each review.items as item}<li><b>{item.company}</b><br/>{item.title}<br/><span>{item.date} · Bewerbung bleibt als versandt erfasst</span> <button class="source" onclick={()=>source(item.feedbackId)}>Mail prüfen</button>{#if item.requiresIdentityConfirmation&&review.state!=='applied'}<label><input type="checkbox" bind:group={confirmed} value={item.feedbackId}/> Diese Mail gehört zu dieser Bewerbung. Die Stelle ist im Mailtext nicht eindeutig zugeordnet.</label>{/if}</li>{/each}</ul>
   {#if review.state==='applied'}<p role="status">{review.receipt?.count} Ergänzungen gespeichert. Die Sicherung und der Änderungsnachweis liegen lokal vor.</p>
   {:else}<button class="approve" disabled={busy||chatStore.loading||review.items.some(i=>i.requiresIdentityConfirmation&&!confirmed.includes(i.feedbackId))} onclick={()=>action('approve')}>{busy?'Wird geprüft …':'Absagen im Tracker bestätigen'}</button>{/if}
  {/if}
  {#if unclear.length}<details><summary>Klärungsbedarf · {unclear.length}</summary><ul>{#each unclear as finding}<li>{finding.mailTime.slice(0,10)} · {reasons[finding.reasonCode]??'Zuordnung bitte prüfen'} {#if finding.feedbackId}<button class="source" onclick={()=>source(finding.feedbackId!)}>Mail prüfen</button>{/if}</li>{/each}</ul></details>{/if}
  {#if mail}<div class="mail"><button class="source" onclick={()=>mail=null}>Mail schliessen</button><pre>{mail.text}</pre></div>{/if}
  {#if failure}<p class="error" role="alert">{failure}</p>{/if}
 </section>
{/if}

<style>
 label{display:flex;gap:8px;margin-top:8px}input{flex-shrink:0} .review{border:1px solid var(--color-border);border-radius:10px;padding:12px;font-size:13px;background:var(--color-background);line-height:1.5}.review ul{list-style:none;padding:0;margin:8px 0}.review li{border-bottom:1px solid var(--color-border);padding:8px 0}.review span{color:var(--color-muted-foreground);font-size:11px}.approve{background:var(--color-primary);color:var(--color-primary-foreground);border-radius:7px;padding:10px 12px;cursor:pointer}.approve:disabled{opacity:.5;cursor:wait}.source{text-decoration:underline;font-size:12px;cursor:pointer}.error{color:var(--color-destructive)}summary{cursor:pointer;margin-top:10px}.mail{margin-top:10px}.mail pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;font-size:12px}
</style>
