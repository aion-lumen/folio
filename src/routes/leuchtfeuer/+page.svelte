<!--
  Leuchtfeuer detail — per-site top paths + referrers, the /story vs /folio door measurement, and the
  GitHub snapshot. Data is read-only from ~/.folio/metrics/. Degrades gracefully (last state + date).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from 'lucide-svelte';

	let { data } = $props();
	const lf = $derived(data.leuchtfeuer);

	function visitsTotal(visits: number[]): number {
		return visits.reduce((a, b) => a + b, 0);
	}
</script>

<svelte:head><title>Folio · Leuchtfeuer</title></svelte:head>

<div class="page">
	<header class="page-header">
		<button class="back" type="button" onclick={() => goto('/')}>
			<ArrowLeft size={16} /> Heute
		</button>
		<h1>Leuchtfeuer</h1>
		<p class="sub">
			Server-Log-Aggregate · kein Client-Tracking.
			{#if lf.generatedFrom}
				Stand: {lf.generatedFrom}{#if lf.stale} (letzter verfügbarer Stand){/if}
			{:else}
				Noch keine Metriken.
			{/if}
		</p>
	</header>

	{#if lf.sites.length === 0 && !lf.github}
		<p class="empty">
			Sobald der VPS-Collector Tages-Aggregate nach <code>~/.folio/metrics/</code> liefert, erscheinen
			hier Besuche, Tür-Verhältnis und Repo-Metriken.
		</p>
	{:else}
		<section class="sites">
			{#each lf.sites as s (s.site)}
				<article class="site">
					<header class="site-head">
						<h2>{s.site}</h2>
						<span class="visits">{visitsTotal(s.visits)} Besuche · {s.dates.length} T</span>
					</header>
					<p class="door">Tür — Story {s.door7.story} : System {s.door7.folio} (7 T)</p>
					<div class="cols">
						<div>
							<h3>Top-Pfade</h3>
							<ul>
								{#each s.topPaths.slice(0, 10) as p (p.path)}
									<li><span class="k">{p.path}</span><span class="v">{p.hits}</span></li>
								{:else}
									<li class="none">—</li>
								{/each}
							</ul>
						</div>
						<div>
							<h3>Top-Referrer</h3>
							<ul>
								{#each s.topReferrers.slice(0, 10) as r (r.referrer)}
									<li><span class="k">{r.referrer || 'direkt'}</span><span class="v">{r.hits}</span></li>
								{:else}
									<li class="none">—</li>
								{/each}
							</ul>
						</div>
					</div>
				</article>
			{/each}
		</section>

		{#if lf.github?.latest}
			<section class="github">
				<h2>GitHub</h2>
				<ul class="repos">
					{#each Object.entries(lf.github.latest) as [repo, m] (repo)}
						<li>
							<span class="k">{repo}</span>
							<span class="v">★ {m.stars} · {m.views_unique} uniq views · {m.clones_unique} clones</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 1080px;
		margin: 0 auto;
		padding: 48px 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		color: var(--color-foreground);
	}
	.page-header {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		background: none;
		border: none;
		color: var(--color-muted-foreground);
		cursor: pointer;
		font: inherit;
		padding: 0;
	}
	.back:hover {
		color: var(--color-foreground);
	}
	h1 {
		margin: 0;
	}
	.sub {
		margin: 0;
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.empty {
		font-size: 14px;
		color: var(--color-muted-foreground);
	}
	.sites {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.site {
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 18px 20px;
		background: var(--color-card);
	}
	.site-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.site-head h2 {
		margin: 0;
		font-size: 16px;
	}
	.visits {
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.door {
		font-size: 13px;
		color: var(--color-muted-foreground);
		margin: 4px 0 12px;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	h3 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted-foreground);
		margin: 0 0 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
	}
	.k {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.v {
		color: var(--color-muted-foreground);
		flex-shrink: 0;
	}
	.none {
		color: var(--color-muted-foreground);
	}
	.github {
		border-top: 1px solid var(--color-border);
		padding-top: 16px;
	}
	.repos {
		gap: 6px;
	}
</style>
