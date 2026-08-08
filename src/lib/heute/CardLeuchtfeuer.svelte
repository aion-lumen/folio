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
	const hasVerifiedVisits = $derived(data.verifiedThrough !== null);
	const siteRows = $derived(
		data.sites
			.filter((site) => site.dates.length > 0)
			.map((site) => ({ site: site.site, total: site.visits.reduce((a, b) => a + b, 0) }))
			.sort((a, b) => b.total - a.total)
	);
	const siteMax = $derived(Math.max(1, ...siteRows.map((row) => row.total)));
	const siteLabel: Record<string, string> = {
		'mirhamed.ch': 'Karriere',
		'aion-lumen.ch': 'Werkstatt',
		'noblecause.ai': 'Experiment',
		'frag-shifu.ch': 'Lernprodukt'
	};

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
		<div class="resonance">
			<div class="primary-signal">
				<span><strong>{hasVerifiedVisits ? visits7Sum : '—'}</strong> geprüfte Aufrufe · 7 Tage</span>
				<svg class="spark" viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">
					<polyline points={sparklinePoints(visits7, 160, 34, 3)} />
				</svg>
			</div>
			<div class="site-bars">
				{#each siteRows as row (row.site)}
					<div><span>{siteLabel[row.site] ?? row.site}</span><i><b class={row.site.replaceAll('.', '-')} style={`width:${(row.total / siteMax) * 100}%`}></b></i></div>
				{/each}
			</div>
		</div>
		<p class="hint">
			{#if data.verifiedThrough}
				GitHub: ★ {starsNow} · {views7Sum} interessierte Aufrufe · geprüft bis {data.verifiedThrough}
			{:else}
				Site-Zählung wartet auf den ersten gehärteten Tageslauf.
			{/if}
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
	.resonance { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; align-items: end; }
	.primary-signal { display: flex; flex-direction: column; gap: 6px; color: var(--color-muted-foreground); font-size: 11px; }
	.primary-signal strong { color: var(--color-foreground); font-size: 21px; }
	.spark {
		width: 100%;
		height: 34px;
	}
	.spark polyline {
		fill: none;
		stroke: var(--color-lumen-warm, hsl(28 92% 58%));
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.site-bars { display: flex; flex-direction: column; gap: 5px; }
	.site-bars > div { display: grid; grid-template-columns: 62px 1fr; gap: 7px; align-items: center; font-size: 9px; color: var(--color-muted-foreground); }
	.site-bars i { display: block; height: 6px; overflow: hidden; border-radius: 999px; background: var(--color-muted); }
	.site-bars b { display: block; height: 100%; border-radius: inherit; background: hsl(28 92% 58%); }
	.site-bars b.mirhamed-ch { background: hsl(158 62% 38%); }
	.site-bars b.noblecause-ai { background: hsl(268 58% 58%); }
	.site-bars b.frag-shifu-ch { background: hsl(210 72% 52%); }
	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
