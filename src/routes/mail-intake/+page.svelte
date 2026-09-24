<script lang="ts">
 import { onMount } from 'svelte';
 import { invalidateAll } from '$app/navigation';
 import ManualMailRun from '$lib/components/mail/ManualMailRun.svelte';
 import type { PageData } from './$types.js';
 let {data}:{data:PageData}=$props();
 let working=$state(false); let failure=$state('');
 const states:Record<string,string>={pending:'Wartet auf Fortsetzung',running:'In Arbeit',completed:'Verarbeitung abgeschlossen',failed:'Unterbrochen'};
 const phases:Record<string,string>={fetch:'Mails abrufen',validate:'Lokale Modellbewertung',memory:'Belege und Gedächtnis prüfen',career:'Bewerbungen mit Absagemails abgleichen'};
 const outcomes:Record<string,string>={excluded_source_folder:'Spam/Papierkorb · kein Memory-Import',confirmed:'Übernommen',candidate:'Vorschläge zur Klärung',domain_conflict:'Zuordnung offen',not_memory_domain:'Kein Memory-Bereich',source_incomplete:'Vollständiger Text fehlt',evidence_clarification:'Belege zur Klärung',already_present:'Bereits vorhanden',no_durable_fact:'Kein dauerhaftes Wissen'};
 const errors:Record<string,string>={primary_restore_failed:'Das primäre lokale Modell konnte nach dem Lauf nicht wieder geladen werden.',paused:'Die Automatik ist pausiert.',subprocess_failed:'Abruf oder Modellbewertung fehlgeschlagen. Einzelheiten stehen im Pipeline-Protokoll.',interrupted_subprocess:'Der lokale Prozess wurde unterbrochen.',incomplete_model_opinions:'Mindestens eine Modellbewertung fehlt. Memory wartet auf die vollständige Prüfung.',extraction_unavailable:'Das lokale Extraktionsmodell hat keine verwertbare Antwort geliefert.',local_processing_failed:'Die lokale Verarbeitung oder Belegprüfung konnte nicht abgeschlossen werden.',model_busy:'Ein anderer Modelllauf ist aktiv.',model_configuration:'Extraktions- und Prüfmodell müssen getrennt konfiguriert sein.'};
 async function action(action:string,run_id?:string) {
  working=true;failure='';
  try { const response=await fetch('/api/mail/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,run_id,authorization_ref:'Owner aktiviert den stündlichen Maileingang mit lokaler Triage und beleggebundener Memory-Prüfung in Folio.'})}); if(!response.ok)throw Error(); await invalidateAll(); }
  catch {failure='Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.';} finally {working=false;}
 }
 onMount(()=>{const timer=setInterval(()=>void invalidateAll(),10_000);return()=>clearInterval(timer);});
 const totals=(items:PageData['runs'][number]['items'])=>Object.entries(items.reduce<Record<string,number>>((counts,item)=>{const key=item.outcome??'waiting';counts[key]=(counts[key]??0)+1;return counts;},{}));
</script>
<svelte:head><title>Maileingang · Folio</title></svelte:head>
<main>
 <a class="back" href="/mobile?view=more">← Dein Folio</a>
 <p class="eyebrow">LOKAL VERBUNDEN</p><h1>Dein Maileingang.</h1>
 <p class="intro">Neue Nachrichten kommen bis zur belegten Erinnerung. Was unklar bleibt, wartet auf deinen Blick.</p>
 <section class="control">
  <div><span class="status" class:enabled={data.config?.enabled}>{data.config?.enabled?'Aktiv':'Pausiert'}</span><h2>{data.busy?'Folio verarbeitet neue Eingänge.':'Raum für die nächsten Eingänge.'}</h2><p>Neue Eingänge stündlich · {data.coverage.length} Quellen · bis zu {data.config?.batch_size??30} neue Mails je Konto</p>{#if data.historyWindow}<p>Historischer Gesamtlauf: {String(data.historyWindow.start_hour).padStart(2,'0')}:00–{String(data.historyWindow.end_hour).padStart(2,'0')}:00 Uhr · Europe/Zurich · {data.historyWindow.paused?'pausiert':data.historyWindow.open?'Fenster offen':'wartet auf Nachtfenster'} · laufende adaptive Tranche darf sauber enden</p>{/if}</div>
  <button disabled={working||!data.runtime} onclick={()=>action(data.config?.enabled?'pause':'enable')}>{data.config?.enabled?'Pausieren':'Aktivieren'}</button>
 </section>
 {#if data.config?.unread_first}<p class="explanation">Ungelesene neue Mails zuerst.{#if data.config.deferred_accounts?.length} Danach: {data.config.deferred_accounts.join(', ')}.{/if}</p>
 {/if}
 {#if data.config?.career_rejections}<p class="explanation"><a href="/career">Bewerbungen</a> werden nach dem Import mit den lokal erfassten Absagemails der letzten 14 Tage abgeglichen. Nur eindeutig belegte Zuordnungen werden automatisch erfasst; unklare Fälle warten in der Bewerbungsübersicht.</p>{/if}
 <ManualMailRun />
 {#if failure}<p class="notice" role="alert">{failure}</p>{/if}
 <div class="path"><span>1 · Eingang</span><span>2 · Modellbewertungen</span><span>3 · Belegte Erinnerung</span></div>
 <p class="explanation">Deine Korrekturen haben Vorrang. Eindeutige Vorschläge prüft ein zweites lokales Modell vor der Übernahme. Der Auftrag stammt von dir; die Prüfung wird dem Modell zugeschrieben. Pausieren stoppt neue Schritte und weitere automatische Bestätigungen. Ein laufender Abruf oder Modellaufruf kann noch auslaufen.</p>
 <nav><a href="/mail-queue">Mails und Bewertungen ↗</a><a href="/memory">Gedächtnis prüfen ↗</a><a href="/pipeline">Pipeline-Protokoll ↗</a></nav>
 <h2 class="history-title">Abdeckung</h2>
 <div class="coverage">
 {#each data.coverage as account (account.id)}
 <article><strong>{account.label}</strong>
 <p>{account.kind==='proton-export'?'Gesicherter Export · kein laufender Empfang':'Posteingang · weitere Ordner separat'}</p>
 {#if account.source}<p>{account.source.total} Nachrichten · {account.source.remaining} noch nicht vollständig abgerufen</p><p>Abruf: {new Date(account.source.checked_at).toLocaleString('de-CH')}</p>{:else}<p>Bestandsmessung steht aus · Umfang noch unbekannt</p>{/if}
 {#if account.historyEnabled&&!account.historical}<p>Gesamtlauf vorgemerkt · Ordnerbestand noch offen</p>{/if}
 {#if account.historical}<p>Gesamtbestand: {account.historical.remaining} von {account.historical.total} Ordnernachweisen offen · gleiche Mails werden zusammengeführt</p>{/if}
 <p>{account.processing} in Verarbeitung · {account.queued} wartet auf Fortsetzung · {account.failed} in festgehaltenem Fehler-Checkpoint</p>
 <p>{account.confirmedFacts} bestätigte Fakten · <a href="/memory">{account.humanReview} wartet auf menschliche Prüfung</a></p>
 <p>{account.lastCompleted?'Zuletzt abgeschlossen: '+new Date(account.lastCompleted).toLocaleString('de-CH'):'Noch kein vollständiger Verarbeitungslauf'}</p>
 {#if account.error}<p class="notice">{errors[account.error]??'Die Verarbeitung benötigt eine Prüfung.'}</p>{/if}
 </article>
 {/each}
 </div>
 <h2 class="history-title">Letzte Durchläufe</h2>
 {#if !data.runs.length}<p class="empty">Noch kein automatischer Durchlauf. Nach der Aktivierung startet Folio mit neuen Eingängen.</p>{/if}
 {#each data.runs as run (run.id)}
  <article><div class="run-heading"><div><span class="eyebrow">{run.account}{run.history?' · Gesamtlauf':''}</span><h3>{states[run.state]}</h3></div><time>{new Date(run.started_at).toLocaleString('de-CH',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div>
   {#if run.state!=='completed'}<p>{phases[run.phase]}</p>{/if}
   {#if run.error}<p class="notice">{errors[run.error]??'Der Lauf benötigt eine erneute lokale Prüfung.'}{run.attempts>=3?' Nach drei Versuchen wartet Folio auf einen bewussten Neustart.':''}</p>{/if}
   <div class="counts">{#each totals(run.items) as [key,count]}<span><strong>{count}</strong> {outcomes[key]??'In Prüfung'}</span>{/each}{#if !run.items.length && run.state==='completed'}<span>Keine neuen Mails</span>{/if}</div>
   {#if run.career}<p>Bewerbungen abgeglichen · {run.career.applied} neue Absagen erfasst</p>{/if}
   {#if run.state==='failed'}<button class="retry" disabled={working||data.busy||!data.config?.enabled} onclick={()=>action('retry',run.id)}>Fortsetzen</button>{/if}
  </article>
 {/each}
 <p class="foot">Der Mac und Folio müssen laufen und die Konten erreichbar sein. Mailtexte bleiben lokal. PDF-Anhänge werden geprüft und lokal gesichert; andere Dateitypen bleiben vorerst in der Quelle. Dateiinhalte gelten erst nach gesonderter Belegprüfung als Wissen. Der Export ist eine Momentaufnahme.</p>
</main>
<style>
 .coverage{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.coverage article{margin:0;overflow-wrap:anywhere}.coverage p{color:#64748b} main{max-width:900px;margin:0 auto;padding:32px 28px 90px;color:#283d3c}a{color:#35665c;text-decoration:none}.back{font-size:13px}.eyebrow{font-size:10px;font-weight:750;letter-spacing:.15em;text-transform:uppercase;color:#68847c;margin:36px 0 12px}h1{font-size:clamp(34px,6vw,54px);font-weight:500;letter-spacing:-.045em;margin:0 0 18px}.intro{font-size:18px;line-height:1.6;color:#718079;max-width:590px}.control{display:flex;justify-content:space-between;align-items:center;gap:22px;background:#eef3ed;border:1px solid #d7e2d5;border-radius:20px;padding:26px;margin:30px 0 20px}.control h2{font-size:21px;font-weight:550;margin:12px 0}.control p,.explanation{font-size:13px;line-height:1.7;color:#66756d}.status{font-size:11px;background:#e3e4de;padding:6px 10px;border-radius:20px}.status.enabled{background:#d8e9d7;color:#315e41}button{background:#315e50;border:0;border-radius:12px;padding:13px 19px;color:white;font:inherit;font-size:13px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.path{display:flex;gap:12px;justify-content:space-between;font-size:12px;color:#547568;padding:20px 0;border-bottom:1px solid #dce1d9}.explanation{margin:20px 0}nav{display:flex;flex-wrap:wrap;gap:18px;font-size:12px;margin:26px 0 40px}.history-title{font-size:22px;font-weight:500}article{background:#fffefa;border:1px solid #e2e5dc;border-radius:16px;padding:23px;margin:13px 0}.run-heading{display:flex;justify-content:space-between;gap:16px}.run-heading .eyebrow{margin:0}.run-heading h3{margin:8px 0;font-size:17px;font-weight:550}time{font-size:11px;color:#7e887f;white-space:nowrap}article p{font-size:13px}.counts{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.counts span{background:#f1f3ed;border-radius:8px;padding:8px 10px;font-size:12px;color:#6c786d}.counts strong{color:#315e50;margin-right:4px}.notice{background:#fbf0dd;border-radius:10px;padding:13px;font-size:13px;line-height:1.5;color:#806633}.retry{margin-top:17px;background:transparent;color:#315e50;border:1px solid #cbdacf}.foot,.empty{font-size:12px;color:#81897f;line-height:1.7;margin-top:28px}@media(max-width:560px){main{padding:25px 18px 85px}.control{padding:21px;align-items:stretch;flex-direction:column}.control button{align-self:flex-start}.path{flex-direction:column;gap:12px}.run-heading{flex-direction:column;gap:2px}article{padding:19px}}
</style>
