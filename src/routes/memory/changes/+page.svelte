<script lang="ts">
 import { enhance } from '$app/forms';
 import SlideToConfirm from '$lib/components/SlideToConfirm.svelte';
 let {data,form} = $props();
 let factId = $state('');
 let preparing = $state(false);
 const approvalNodes: Record<string, HTMLDivElement> = {};
 $effect(() => { if (data.selected) factId = data.selected; });
 const selected = $derived(data.facts.find(f => f.fact_id === factId));
 function approve(event: HTMLElement) {
  const review = event.closest('form');
  if (!review) return;
  (review.elements.namedItem('slide_approved') as HTMLInputElement).value = 'yes';
  review.requestSubmit();
 }
</script>

<svelte:head><title>Änderungen prüfen · Folio</title></svelte:head>
<main>
 <a href="/memory">← Gedächtnis</a>
 <p class="eyebrow">LOKALER AGENT · PERSÖNLICHE FREIGABE</p>
 <h1>Eine Aussage berichtigen</h1>
 <p>Beschreibe die Änderung. Das lokale Modell bereitet einen Vorschlag vor. Erst deine Slidefreigabe ersetzt den ausgewählten Fakt; Carta und andere öffentliche Auftritte werden nicht verändert.</p>
 {#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}
 <form method="GET"><label>Fakt oder Beleg suchen<input name="q" value={data.query} maxlength="200" placeholder="Name, Projekt oder Aussage"/></label><input type="hidden" name="fact" value={factId}/><button type="submit">Suchen</button><small>Bis zu 200 passende Fakten. Auswahl bleibt bei der Suche nach einem Beleg erhalten.</small></form>
 <form method="POST" action="?/prepare" use:enhance={() => {preparing=true; return async ({update}) => {try {await update({reset:false});} finally {preparing=false;}};}}>
  <label>Aussage<select name="fact_id" bind:value={factId} required><option value="">Bitte auswählen</option>{#each data.facts as fact}<option value={fact.fact_id}>{fact.subject} · {fact.value_text.slice(0,110)}</option>{/each}</select></label>
  {#if selected}<blockquote>{selected.value_text}<small>{selected.status === 'confirmed' ? 'Persönlich bestätigt' : 'Unbestätigter Kandidat'} · {selected.source_ref}</small></blockquote>{/if}
  <label>Deine Anweisung<textarea name="instruction" required maxlength="2000" rows="3" placeholder="Was soll sich ändern, und warum?"></textarea></label>
  <label>Zusätzlicher Beleg (optional)<select name="evidence_id"><option value="">Nur meine Anweisung — keine unabhängige Quelle</option>{#each data.facts.filter(f => f.domain === selected?.domain && f.fact_id !== factId) as evidence}<option value={evidence.fact_id}>{evidence.subject} · {evidence.value_text.slice(0,110)}</option>{/each}</select></label>
  <button disabled={preparing || !selected} type="submit">{preparing ? 'Lokales Modell prüft …' : 'Vorschlag vorbereiten'}</button>
 </form>
 <h2>Vorschläge und Entscheidungen</h2>
 {#each data.changes as change}
  <article>
   <p class="eyebrow">{change.status === 'pending' ? 'ZUR FREIGABE' : change.status === 'applied' ? 'ÜBERNOMMEN' : 'VERWORFEN'} · {change.model}</p>
   <h3>{change.snapshot.fact.subject}</h3>
   <div class="comparison"><section><h4>Bisher</h4><p>{change.snapshot.fact.value_text}</p><small>{change.snapshot.fact.predicate} · {change.snapshot.fact.valid_from ?? 'ohne Ereignisdatum'}</small></section><section><h4>Vorschlag</h4><p>{change.draft.value}</p><small>{change.draft.predicate} · {change.draft.valid_from ?? 'ohne Ereignisdatum'}</small></section></div>
   <p>{change.draft.reason}</p>
   <details><summary>Anweisung und Quellenbasis</summary><blockquote>{change.instruction}<small>Deine Anweisung</small></blockquote><p>Vorherige Quelle: {change.snapshot.fact.source_ref}</p>{#if change.snapshot.evidence}<blockquote>{change.snapshot.evidence.source_excerpt ?? change.snapshot.evidence.value_text}<small>{change.snapshot.evidence.source_ref} · {change.snapshot.evidence.status}</small></blockquote>{:else}<p>Kein zusätzlicher unabhängiger Beleg ausgewählt. Die Übernahme ist deine persönliche Entscheidung, keine automatische Quellenbestätigung.</p>{/if}<p>Betroffen: ein Fakt. Identität und Domäne bleiben erhalten, Vertraulichkeit wird nicht gesenkt. Zugehörige unbestätigte Zusammenfassungen werden nicht übernommen.</p></details>
   {#if change.status === 'pending'}
    {#if change.stale}<p class="notice">Fakt oder Beleg verändert. Bitte den Vorschlag verwerfen und neu vorbereiten.</p>{/if}
    <form method="POST" action="?/review">
     <input type="hidden" name="request_id" value={change.request_id}/><input type="hidden" name="version" value={change.version}/><input type="hidden" name="decision" value="apply"/><input type="hidden" name="slide_approved" value="no"/>
     <div class="approval" bind:this={approvalNodes[change.request_id]}><SlideToConfirm label="Diese Änderung persönlich freigeben" disabled={change.stale} resetKey={change.version} onconfirm={() => approve(approvalNodes[change.request_id])}/></div>
    </form>
    <form method="POST" action="?/review"><input type="hidden" name="request_id" value={change.request_id}/><input type="hidden" name="version" value={change.version}/><input type="hidden" name="decision" value="reject"/><button type="submit" class="secondary">Vorschlag verwerfen</button></form>
   {/if}
  </article>
 {:else}<p>Noch keine Änderungsvorschläge.</p>{/each}
</main>

<style>
 input:not([type="hidden"]){width:100%;box-sizing:border-box;border:1px solid var(--color-border);border-radius:8px;padding:.7rem;background:var(--color-background);color:inherit;font:inherit}h2{font-size:1.4rem}h3{font-size:1.15rem}h4{font-weight:600}
 main{max-width:960px;margin:0 auto;padding:2rem 1.25rem;color:var(--color-foreground)}h1{font-size:2rem;margin:.4rem 0}h2{margin-top:2rem}p{line-height:1.6}.eyebrow{font-size:.75rem;letter-spacing:.09em;color:var(--color-muted-foreground);margin-top:1.5rem}form,article{display:grid;gap:1rem;margin:1.25rem 0;padding:1.25rem;border:1px solid var(--color-border);border-radius:14px;background:var(--color-card)}article form{padding:0;border:0;margin:.4rem 0}label{display:grid;gap:.5rem}select,textarea{width:100%;padding:.7rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-background);color:inherit;font:inherit;box-sizing:border-box}button{justify-self:start;border:0;padding:.8rem 1rem;border-radius:8px;background:#1b3134;color:white;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.secondary{background:transparent;color:inherit;border:1px solid var(--color-border)}blockquote{margin:0;padding:1rem;border-left:3px solid #b38b60;white-space:pre-wrap}small{display:block;color:var(--color-muted-foreground);overflow-wrap:anywhere}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.comparison section{min-width:0;padding:1rem;background:var(--color-muted);border-radius:8px}.comparison p{white-space:pre-wrap;overflow-wrap:anywhere}.notice{padding:1rem;border:1px solid #b38b60;border-radius:8px}@media(max-width:600px){.comparison{grid-template-columns:1fr}main{padding:1.25rem .8rem}}
</style>
