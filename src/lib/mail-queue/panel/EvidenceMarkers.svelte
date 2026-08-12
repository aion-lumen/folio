<!--
  Panel-C Werkstatt §1.3 Karte 3: Marker-Wolke.
  Quellen:
   - heuristic_markers (JSON-Array aus feedback.heuristic_markers, schon
     in unified row als string[] geparst)
   - correction_marker (CSV aus latest correction; Panel-C-Append-Convention)
   - 2026-06-06 Bauteil 2: inseratMarkers (council.mail_inserat_markers,
     1:N pro feedback_id) — out_of_corridor:<plz>, expired:redirect_error,
     corridor_check_skipped:<portal>. Separater Block mit Haus-Glyph.
-->
<script lang="ts">
	import type { UnifiedMailRow } from '$lib/stores/mailQueue.svelte.js';

	let {
		row,
		inseratMarkers = []
	}: { row: UnifiedMailRow; inseratMarkers?: string[] } = $props();

	const heuristicMarkers = $derived<string[]>(row.heuristic_markers ?? []);
	const correctionMarkers = $derived<string[]>(
		row.correction?.correction_marker?.split(',').filter(Boolean) ?? []
	);

	// 2026-06-05 (Korrektur 3): final-blockers aus active_rules. Wenn
	// non-empty, sind alle „passt"-Marker (tier1:portal_domain,
	// tier2:location_whitelist, ...) effektiv überschrieben → visuell
	// gedämpft + Tag „überschrieben".
	const finalBlockers = $derived<string[]>(row.active_rules?.final_blockers ?? []);
	const blockersActive = $derived(finalBlockers.length > 0);

	function isOverridden(marker: string): boolean {
		// blocker-Marker selbst sind nicht „überschrieben" — sie sind die Ursache.
		if (finalBlockers.includes(marker)) return false;
		// Passt-Marker werden überschrieben wenn blockers aktiv.
		return blockersActive && (
			marker.startsWith('tier2:location_whitelist:') ||
			marker.startsWith('tier1:portal_domain:')
		);
	}
</script>

<div class="marker-wrap">
	{#if correctionMarkers.length > 0}
		<div class="grp">
			<span class="grp-label">User-Marker</span>
			<div class="chips">
				{#each correctionMarkers as m}
					<span class="chip user-chip">{m}</span>
				{/each}
			</div>
		</div>
	{/if}
	{#if heuristicMarkers.length > 0}
		<div class="grp">
			<span class="grp-label">Deterministische Signale</span>
			<div class="chips">
				{#each heuristicMarkers as m}
					<span class="chip" class:overridden={isOverridden(m)} class:blocker={finalBlockers.includes(m)}>
						{m}{#if isOverridden(m)} <span class="tag">überschrieben</span>{/if}
					</span>
				{/each}
			</div>
		</div>
	{:else if correctionMarkers.length === 0 && inseratMarkers.length === 0}
		<p class="muted">keine zusätzlichen Signale</p>
	{/if}
	{#if inseratMarkers.length > 0}
		<div class="grp">
			<span class="grp-label">🏠 Inserat-Marker (Council-Worker)</span>
			<div class="chips">
				{#each inseratMarkers as m}
					<span class="chip inserat-chip">{m}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.marker-wrap {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.grp-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chip {
		display: inline-block;
		padding: 2px 7px;
		border-radius: 3px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		font-family: var(--font-mono);
		font-size: 10.5px;
		line-height: 1.4;
	}
	.user-chip {
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
	}
	.inserat-chip {
		background: hsl(28 95% 96%);
		color: hsl(28 80% 32%);
		border: 1px solid hsl(28 60% 82%);
	}
	.chip.overridden {
		opacity: 0.45;
		text-decoration: line-through;
	}
	.chip.blocker {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		border: 1px solid var(--verdict-verwerfen-bd, hsl(0 60% 84%));
	}
	.tag {
		font-size: 9px;
		opacity: 0.8;
		margin-left: 3px;
		font-style: italic;
	}
	.muted {
		color: var(--color-muted-foreground);
		font-style: italic;
		font-size: 11.5px;
		margin: 0;
	}
</style>
