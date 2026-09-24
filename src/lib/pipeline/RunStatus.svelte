<script lang="ts">
 import type { PipelineStatus } from './run-status.js';
 let {status, models}: {status:PipelineStatus; models:{id:string;role:string}[]} = $props();
 const phases = ['Maileingang', 'Modellprüfung', 'Memory'];
</script>

<section class="run-status" aria-label="Gesamtlauf">
 <div class="heading"><div><span class="eyebrow">GESAMTLAUF{status.account ? ` · ${status.account}` : ''}</span><h2>{status.state}{status.active ? ` · ${status.phase}` : ''}</h2></div><span class="count">{status.phasesDone}/3 Phasen abgeschlossen</span></div>
 <div class="track" role="progressbar" aria-label="Gesamtlauf nach abgeschlossenen Phasen" aria-valuemin="0" aria-valuemax="3" aria-valuenow={status.phasesDone} aria-valuetext={`${status.phasesDone} von 3 Phasen abgeschlossen; ${status.state}`}>
  {#each phases as phase, i}<span class:done={i < status.phasesDone} class:active={status.active && i === status.phasesDone}></span>{/each}
 </div>
 <ol>{#each phases as phase, i}<li class:current={status.active && i === status.phasesDone}>{i+1} · {phase}</li>{/each}</ol>
 <p class="note">Phasenfortschritt, keine Zeitschätzung. Modellwechsel und bedingte Nachprüfungen gehören zum Lauf; abgeschlossen ist er erst nach Memory und Modell-Rückkehr.</p>
 {#if status.active}
  <div class="activity" aria-live="polite"><strong>{status.activity?.task ?? (status.phase === 'Maileingang' ? 'Abruf und regelbasierte Vorsortierung · ohne LLM' : 'Übergang / Status wird ermittelt')}</strong><span>{status.activity?.model ?? 'Kein aktives Modell bestätigt'}</span></div>
 {/if}
 {#if status.itemsTotal !== null}<p class="note">{status.itemsTotal} Mails in dieser Tranche · {status.itemsDone} abschließend bearbeitet</p>{/if}
 {#if status.error}<p class="error">{status.state}: {status.error}</p>{/if}
 <div class="models">{#each models as model}<div class:working={status.activity?.model === model.id && status.active}><span>{model.role}</span><strong>{model.id}</strong><small>{status.activity?.model === model.id && status.active ? status.activity.task : 'Bereit · nicht als aktiv gemeldet'}</small></div>{/each}</div>
 {#if status.id}<p class="note run-id">Lauf {status.id}{status.endedAt && !status.active ? ` · Stand ${status.endedAt}` : ''}</p>{/if}
</section>

<style>
 .run-status{background:var(--card,#fff);border:1px solid var(--border,#dbe0e7);border-radius:16px;padding:24px;display:grid;gap:16px;color:var(--foreground,#17202e)}
 .heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.eyebrow,.count{font:12px ui-monospace,monospace;color:var(--muted-foreground,#657284)}h2{font-size:21px;margin:6px 0 0}.track{display:flex;gap:5px;height:10px}.track span{flex:1;background:#dde1e6;border-radius:4px}.track span.done{background:#7d945c}.track span.active{background:linear-gradient(90deg,#d4a37350,#d4a373,#d4a37350);background-size:200% 100%;animation:pulse 2s linear infinite}ol{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);padding:0;margin:0;gap:10px;font-size:13px}li.current{color:#936337;font-weight:600}.note{font-size:12px;line-height:1.6;color:var(--muted-foreground,#657284);margin:0}.activity{display:grid;gap:6px;padding:16px;background:#d4a37312;border-left:3px solid #d4a373}.activity span{font:13px ui-monospace,monospace;overflow-wrap:anywhere}.models{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.models>div{display:grid;gap:8px;border:1px solid var(--border,#dbe0e7);padding:14px;border-radius:10px}.models>div.working{border-color:#d4a373;background:#d4a37312}.models span,.models small{font-size:12px;color:var(--muted-foreground,#657284)}.models strong{font:13px ui-monospace,monospace;overflow-wrap:anywhere}.error{color:#aa442a}.run-id{overflow-wrap:anywhere}@keyframes pulse{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.track span.active{animation:none}}@media(max-width:600px){.run-status{padding:16px}.models{grid-template-columns:1fr}}
</style>
