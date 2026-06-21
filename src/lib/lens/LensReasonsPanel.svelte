<!--
  LensReasonsPanel — domain-agnostic Lens-Begruendungen-Anzeige.
  Direktive 2026-05-31 §A.1, Klausel 1.

  Pro Lens eine kollabierbare Karte via <details>. Default zu — User klickt
  zum Expandieren. Header: Persona-Label + Rank-Pille + Confidence-Pille.
  Body: Volltext-reason, Fallback "Keine Begruendung notiert".
-->
<script lang="ts">
	import type { LensReason } from '$lib/lens/types.js';

	let { reasons }: { reasons: LensReason[] } = $props();

	const CONFIDENCE_LABEL: Record<string, string> = {
		low: 'low',
		medium: 'mid',
		high: 'high'
	};
</script>

<div class="lens-reasons">
	{#each reasons as r (r.lens_id)}
		<details class="card">
			<summary>
				<span class="label">{r.label}</span>
				<span class="badges">
					{#if r.rank != null}
						<span class="rank">#{r.rank}</span>
					{/if}
					{#if r.confidence}
						<span class="conf conf-{r.confidence}">{CONFIDENCE_LABEL[r.confidence] ?? r.confidence}</span>
					{/if}
				</span>
				<span class="chev" aria-hidden="true">▾</span>
			</summary>
			<div class="body">
				{#if r.reason && r.reason.trim()}
					{r.reason}
				{:else}
					<span class="empty">Keine Begründung notiert.</span>
				{/if}
			</div>
		</details>
	{/each}
</div>

<style>
	.lens-reasons {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.card {
		border: 1px solid hsl(214 20% 88%);
		border-radius: 6px;
		background: white;
		overflow: hidden;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		cursor: pointer;
		font-size: 13px;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.label {
		font-weight: 500;
		color: hsl(222 30% 22%);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badges {
		display: inline-flex;
		gap: 5px;
		align-items: center;
	}
	.rank {
		font-family: var(--font-mono);
		font-size: 11px;
		color: hsl(222 47% 11%);
		font-weight: 500;
		padding: 1px 6px;
		background: hsl(214 24% 94%);
		border-radius: 999px;
	}
	.conf {
		font-family: var(--font-mono);
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1px solid;
	}
	.conf-low {
		color: hsl(0 0% 45%);
		background: hsl(0 0% 96%);
		border-color: hsl(0 0% 85%);
	}
	.conf-medium {
		color: hsl(45 60% 30%);
		background: hsl(45 80% 95%);
		border-color: hsl(45 60% 80%);
	}
	.conf-high {
		color: hsl(140 50% 28%);
		background: hsl(140 50% 96%);
		border-color: hsl(140 40% 75%);
	}
	.chev {
		font-size: 11px;
		color: hsl(215 16% 50%);
		transition: transform 120ms;
	}
	details[open] .chev {
		transform: rotate(180deg);
	}
	.body {
		padding: 6px 12px 12px;
		font-size: 12.5px;
		line-height: 1.5;
		color: hsl(222 30% 22%);
		border-top: 1px solid hsl(214 20% 92%);
		white-space: pre-wrap;
	}
	.empty {
		color: hsl(215 16% 50%);
		font-style: italic;
	}
</style>
