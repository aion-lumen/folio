<!--
  Leuchtfeuer card in the Heute hub — site & repo metrics from ~/.folio/metrics/ (Caddy server logs
  + GitHub API snapshots; no client-side tracking). Inline-SVG sparklines, no chart library.
  Degradation: when metric files are missing/stale, show the last state with its date — no spinner.

  08c migration note: built as a NORMAL card. When 08c ships the module-registry API, Leuchtfeuer
  becomes its second consumer (test, not blocker) — do not add that dependency now.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { RadioTower, ArrowRight } from 'lucide-svelte';
	import { sparklinePoints, lastN } from '$lib/util/sparkline.js';
	import type { LeuchtfeuerData } from '$lib/leuchtfeuer/types.js';

	let { data }: { data: LeuchtfeuerData } = $props();

	// Total visits across sites, aligned by date (dates differ per site → merge into a date→sum map).
	const totalVisits = $derived.by(() => {
		const byDate = new Map<string, number>();
		for (const s of data.sites) {
			s.dates.forEach((d, i) => byDate.set(d, (byDate.get(d) ?? 0) + (s.visits[i] ?? 0)));
		}
		return [...byDate.keys()].sort().map((d) => byDate.get(d) ?? 0);
	});
	const visits7 = $derived(lastN(totalVisits, 7));
	const visits7Sum = $derived(visits7.reduce((a, b) => a + b, 0));

	const door = $derived(
		data.sites.reduce(
			(acc, s) => ({ story: acc.story + s.door7.story, folio: acc.folio + s.door7.folio }),
			{ story: 0, folio: 0 }
		)
	);

	const starsTotal = $derived(data.github?.starsTotal ?? []);
	const starsNow = $derived(starsTotal.length ? starsTotal[starsTotal.length - 1] : 0);
	const views7 = $derived(lastN(data.github?.viewsTotal ?? [], 7));
	const views7Sum = $derived(views7.reduce((a, b) => a + b, 0));

	const hasData = $derived(data.generatedFrom !== null);
</script>

<button class="card" type="button" onclick={() => goto('/leuchtfeuer')}>
	<header class="card-head">
		<RadioTower size={18} class="icon" />
		<span class="title">Leuchtfeuer</span>
		<ArrowRight size={14} class="arrow" />
	</header>

	{#if !hasData}
		<p class="primary muted">Noch keine Metriken</p>
		<p class="hint">Tages-Aggregate landen unter ~/.folio/metrics/ (VPS-Pull)</p>
	{:else}
		<div class="metrics">
			<div class="metric">
				<span class="m-label">Server-Seitenaufrufe · 7 T</span>
				<span class="m-value">{visits7Sum}</span>
				<svg class="spark" viewBox="0 0 80 20" preserveAspectRatio="none" aria-hidden="true">
					<polyline points={sparklinePoints(visits7, 80, 20, 2)} />
				</svg>
			</div>
			<div class="metric">
				<span class="m-label">Tür · Story:System</span>
				<span class="m-value">{door.story} : {door.folio}</span>
				<div class="door" aria-hidden="true">
					<span class="door-a" style="flex:{door.story || 0.001}"></span>
					<span class="door-b" style="flex:{door.folio || 0.001}"></span>
				</div>
			</div>
			<div class="metric">
				<span class="m-label">Stars</span>
				<span class="m-value">{starsNow}</span>
				<svg class="spark" viewBox="0 0 80 20" preserveAspectRatio="none" aria-hidden="true">
					<polyline points={sparklinePoints(lastN(starsTotal, 30), 80, 20, 2)} />
				</svg>
			</div>
			<div class="metric">
				<span class="m-label">Repo-Views · 7 T</span>
				<span class="m-value">{views7Sum}</span>
				<svg class="spark" viewBox="0 0 80 20" preserveAspectRatio="none" aria-hidden="true">
					<polyline points={sparklinePoints(views7, 80, 20, 2)} />
				</svg>
			</div>
		</div>
		<p class="hint">
			Stand: {data.generatedFrom}{#if data.stale} · letzter verfügbarer Stand{/if}
		</p>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		text-align: left;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		cursor: pointer;
		transition: border-color 150ms, transform 150ms;
		font-family: inherit;
		color: var(--color-foreground);
	}
	.card:hover {
		border-color: var(--color-foreground);
		transform: translateY(-1px);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.card-head :global(.icon) {
		color: var(--color-foreground);
	}
	.title {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		flex: 1;
	}
	.card-head :global(.arrow) {
		opacity: 0.4;
		color: var(--color-muted-foreground);
		transition: opacity 150ms, transform 150ms;
	}
	.card:hover :global(.arrow) {
		opacity: 1;
		transform: translateX(2px);
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px 16px;
	}
	.metric {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.m-label {
		font-size: 11px;
		color: var(--color-muted-foreground);
	}
	.m-value {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-foreground);
	}
	.spark {
		width: 100%;
		height: 20px;
	}
	.spark polyline {
		fill: none;
		stroke: var(--color-lumen-warm, hsl(28 92% 58%));
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.door {
		display: flex;
		height: 6px;
		border-radius: 3px;
		overflow: hidden;
		gap: 1px;
	}
	.door-a {
		background: var(--color-lumen-warm, hsl(28 92% 58%));
	}
	.door-b {
		background: var(--color-muted-foreground);
		opacity: 0.5;
	}
	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
