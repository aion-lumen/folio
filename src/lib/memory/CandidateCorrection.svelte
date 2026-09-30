<script lang="ts">
	import { CORRECTION_KINDS } from './correction.js';
	let { fact, version }: {
		fact: { fact_id: string; predicate: string; value_text: string; source_excerpt: string | null; valid_from: string | null; proposal_id: string | null };
		version: string;
	} = $props();
</script>

<details class="correction">
	<summary>Diese Aussage korrigieren</summary>
	<!-- Use the browser's native POST: a fetch failure must not discard the review into a 500 page. -->
	<form method="POST" action="?/correct">
		<input type="hidden" name="fact_id" value={fact.fact_id} />
		<input type="hidden" name="expected_version" value={version} />
		<p>Ein neuer Vorschlag ersetzt diese Aussage. Noch nichts wird bestätigt. Quelle, Domäne und Vertraulichkeit bleiben erhalten.</p>
		{#if fact.proposal_id}<p>Die bisherige automatische Zusammenfassung wird von der Übernahme ausgeschlossen. Andere Aussagen bleiben unverändert.</p>{/if}
		{#if fact.source_excerpt}<blockquote><strong>Unveränderter Beleg</strong>{fact.source_excerpt}</blockquote>{/if}
		<label>Art der Aussage<select name="predicate">{#each CORRECTION_KINDS as kind}<option value={kind.predicate} selected={kind.predicate === fact.predicate}>{kind.label}</option>{/each}</select></label>
		<label>Korrigierte Aussage<textarea name="value" required maxlength="8000" rows="4" value={fact.value_text}></textarea></label>
		<label>Belegtes Ereignisdatum (für Zahlung und Termin erforderlich)<input name="valid_from" type="date" value={fact.valid_from?.slice(0, 10) ?? ''} /></label>
		<label>Grund der Korrektur<input name="reason" required maxlength="1000" placeholder="z. B. Bewilligung ist kein Zahlungsnachweis" /></label>
		<button type="submit">Korrektur als Vorschlag speichern</button>
	</form>
</details>

<style>
	.correction { margin-top: 0.8rem; font-size: 0.9rem; }
	summary { cursor: pointer; text-decoration: underline; }
	form { display: grid; gap: 0.8rem; margin-top: 0.8rem; max-width: 48rem; }
	p { margin: 0; line-height: 1.5; }
	label { display: grid; gap: 0.3rem; }
	input, select, textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 0.6rem; border: 1px solid #a8adb7; border-radius: 0.4rem; background: white; color: #182132; }
	blockquote { margin: 0; padding: 0.7rem; border-left: 3px solid #b68b5f; white-space: pre-wrap; }
	blockquote strong { display: block; }
	button { justify-self: start; padding: 0.7rem 1rem; border-radius: 0.4rem; background: #182132; color: white; cursor: pointer; }
</style>
