<script lang="ts">
 import {onMount} from 'svelte';
 import {invalidateAll} from '$app/navigation';
 import type {financeRunView} from '$lib/server/modules/ledger-books/finance-run-state.js';
 let {run}=$props<{run:ReturnType<typeof financeRunView>}>();
 const labels:Record<string,string>={running:'Läuft',paused:'Pausiert',failed:'Angehalten',completed:'Lokaler Durchlauf fertig'};
 const counts:Record<string,string>={bank_entries:'Kontobewegungen',local_mail_sources:'Lokale Mailquellen',attachments_cleared:'Geprüfte PDF-Anhänge',payment_new_confirmations:'Neue bankbelegte Bestätigungen',possible_links:'Mögliche Belegzuordnungen',links_reviewed:'Davon mit zwei Modellen geprüft',links_supported:'Von beiden Modellen gestützt · noch unbestätigt',links_uncertain:'Uneinige oder unsichere Zuordnungen',statements_blocked:'Auszüge mit Prüfproblem',statement_gaps:'Lücken zwischen Auszügen',bank_without_mail:'Bewegungen ohne gefundenen Mailbeleg',financial_mail_without_bank:'Finanzmails ohne gefundene Bewegung'};
 onMount(()=>{const t=setInterval(()=>{if(run?.status==='running'||run?.status==='paused')void invalidateAll();},30000);return()=>clearInterval(t);});
</script>
{#if run}
 <section class="finance-run" aria-label="Kontrollierter Finanzabgleich">
  <header><div><small>FINANZABGLEICH</small><h2>{labels[run.status]}{#if run.status==='running'&&!run.alive} · Prozess nicht aktiv{/if}</h2></div>
   {#if run.alive&&['running','paused'].includes(run.status)}<form method="POST" action="?/financePause"><input type="hidden" name="pause" value={run.status==='paused'?'false':'true'}/><button>{run.status==='paused'?'Fortsetzen':'Nach Prüfblock pausieren'}</button></form>{/if}
  </header>
  <p role="status">{run.message}</p>
  <progress value={run.statementDone} max={run.statementTotal}></progress><small>{run.statementDone}/{run.statementTotal} Auszüge bearbeitet · Start {new Date(run.started_at).toLocaleString('de-CH')}</small>
  <dl>{#each Object.entries(counts) as [key,label]}{#if run.counts[key]!==undefined}<div><dt>{label}</dt><dd>{run.counts[key]}</dd></div>{/if}{/each}</dl>
  <p class="note">Fehlende Belege bedeuten nicht „unbezahlt“. Modellgestützte Zuordnungen bleiben Vorschläge. Nur der bestehende Bankbeleg-Prüfpfad bestätigt Zahlungen im Memory.</p>
  {#if run.blocked.length}<details><summary>{run.blocked.length} Auszüge benötigen eine technische Prüfung</summary>{#each run.blocked as item}<p>{item.name.slice(0,16)}… · {item.reason}</p>{/each}</details>{/if}
  {#if run.error}<p class="error">Prüfgrund: {run.error}</p>{/if}
  <small>Stand {new Date(run.updated_at).toLocaleString('de-CH')} · Kontrolle alle 30 Minuten; sechs Stunden sind ein Zwischenstand.</small>
 </section>
{/if}
<style>
 .finance-run{border:1px solid var(--color-border,#dce5ed);border-radius:16px;padding:24px;margin:24px 0;background:var(--color-background,#fff)}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h2{margin:6px 0;font-size:24px}small,.note,dt{color:#687890}.note{font-size:13px;line-height:1.5}progress{display:block;width:100%;height:8px;accent-color:#48627c;margin:16px 0 8px}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}dl>div{border-top:1px solid #e5eaf0;padding-top:12px}dt{font-size:13px}dd{margin:5px 0;font-size:24px;font-weight:600}button{padding:10px 14px;border:1px solid #ced8e3;border-radius:9px;background:#f7f9fc;color:#24364b;font:inherit;cursor:pointer}.error{color:#a13f37}details p{font-size:12px;overflow-wrap:anywhere}@media(max-width:600px){header{align-items:start;flex-direction:column}}
</style>
