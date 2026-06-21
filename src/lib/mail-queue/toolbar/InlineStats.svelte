<!--
  F.9 BUG-K2 — Stats (read-only Mono-Text mit klickbarem Disagreement-Pill).
  Architekt-Q1: Disagreement-Pill bleibt klickbar als Shortcut für Disagreement-Filter.
  Andere Stats (bestätigt%, sender count, heartbeat) sind aus dem konsolidierten
  Design entfernt — fokussiert auf das Wesentliche im Triage-Workflow.
-->
<script lang="ts">
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';

	const unreviewed = $derived(mailQueueStore.unreviewedCount);
	const disagreements = $derived(mailQueueStore.disagreementCount);
	const disagreementActive = $derived(mailQueueStore.filters.disagreementOnly);

	function toggleDisagreement(): void {
		mailQueueStore.setFilter('disagreementOnly', !disagreementActive);
	}
</script>

<div class="flex items-center gap-2 text-xs text-muted-foreground">
	<span>
		<span class="font-mono font-semibold text-foreground">{unreviewed}</span> offen
	</span>
	<span class="opacity-40">·</span>
	<button
		type="button"
		class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono transition-colors
			{disagreementActive
			? 'bg-foreground text-background'
			: 'hover:bg-muted'}"
		style={disagreementActive ? '' : 'color: var(--color-lumen-warm);'}
		onclick={toggleDisagreement}
		title={disagreementActive ? 'Disagreement-Filter aktiv (klick zum Aufheben)' : 'Nur Disagreements zeigen'}
	>
		≠ {disagreements}
	</button>
</div>
