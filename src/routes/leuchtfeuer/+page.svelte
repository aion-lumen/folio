<!-- Leuchtfeuer: a visual, privacy-first resonance view over verified server aggregates. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from 'lucide-svelte';
	import { sparklinePoints } from '$lib/util/sparkline.js';
	import type { SiteSeries } from '$lib/leuchtfeuer/types.js';

	let { data } = $props();
	const lf = $derived(data.leuchtfeuer);

	const META: Record<string, { role: string; tone: string }> = {
		'mirhamed.ch': { role: 'Karriereprofil', tone: 'career' },
		'aion-lumen.ch': { role: 'AI-Werkstatt', tone: 'workshop' },
		'noblecause.ai': { role: 'Öffentliches Experiment', tone: 'cause' },
		'frag-shifu.ch': { role: 'Lernprodukt', tone: 'learning' }
	};

	function total(site: SiteSeries): number {
		return site.visits.reduce((sum, value) => sum + value, 0);
	}

	function trend(values: number[]): 'steigt' | 'stabil' | 'ruhiger' | 'startet' {
		if (values.length < 4) return 'startet';
		const recent = values.slice(-3);
		const earlier = values.slice(-6, -3);
		const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
		const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
		if (earlierAvg === 0) return recentAvg > 0 ? 'steigt' : 'stabil';
		const change = (recentAvg - earlierAvg) / earlierAvg;
		if (change > 0.2) return 'steigt';
		if (change < -0.2) return 'ruhiger';
		return 'stabil';
	}

	function sourceGroups(site: SiteSeries) {
		let direct = 0;
		let search = 0;
		let social = 0;
		let other = 0;
		for (const item of site.topReferrers) {
			const ref = item.referrer.toLowerCase();
			if (!ref) direct += item.hits;
			else if (/google|bing|duckduckgo|ecosia/.test(ref)) search += item.hits;
			else if (/github|x\.com|twitter|reddit|linkedin/.test(ref)) social += item.hits;
			else other += item.hits;
		}
		return { direct, search, social, other, total: direct + search + social + other };
	}

	function sourcePie(site: SiteSeries): string {
		const groups = sourceGroups(site);
		if (!groups.total) return 'background:var(--color-muted)';
		const direct = (groups.direct / groups.total) * 100;
		const search = direct + (groups.search / groups.total) * 100;
		const social = search + (groups.social / groups.total) * 100;
		return `background:conic-gradient(hsl(215 18% 66%) 0 ${direct}%, hsl(158 55% 45%) ${direct}% ${search}%, hsl(28 92% 58%) ${search}% ${social}%, hsl(268 48% 62%) ${social}% 100%)`;
	}

	function sourceDescription(site: SiteSeries): string {
		const groups = sourceGroups(site);
		if (!groups.total) return `Keine Herkunftsdaten für ${site.site}`;
		return [
			['ohne Referrer', groups.direct],
			['Suche', groups.search],
			['Netzwerke', groups.social],
			['andere', groups.other]
		]
			.filter(([, value]) => Number(value) > 0)
			.map(([label, value]) => `${label} ${Math.round((Number(value) / groups.total) * 100)} Prozent`)
			.join(', ');
	}

	function contentPie(site: SiteSeries): string {
		const paths = site.topPaths.slice(0, 3);
		const sum = paths.reduce((total, path) => total + path.hits, 0);
		if (!sum) return 'background:var(--color-muted)';
		const first = (paths[0]?.hits ?? 0) / sum * 100;
		const second = first + (paths[1]?.hits ?? 0) / sum * 100;
		return `background:conic-gradient(hsl(28 92% 58%) 0 ${first}%, hsl(210 72% 52%) ${first}% ${second}%, hsl(268 48% 62%) ${second}% 100%)`;
	}

	function contentDescription(site: SiteSeries): string {
		const paths = site.topPaths.slice(0, 3);
		const sum = paths.reduce((value, path) => value + path.hits, 0);
		if (!sum) return `Keine Inhaltsdaten für ${site.site}`;
		return paths
			.map((path) => `${pathLabel(path.path)} ${Math.round((path.hits / sum) * 100)} Prozent`)
			.join(', ');
	}

	function storyShare(site: SiteSeries): number | null {
		const sum = site.door7.story + site.door7.folio;
		return sum ? Math.round((site.door7.story / sum) * 100) : null;
	}

	function pathLabel(path: string): string {
		if (path === '/') return 'Startseite';
		return path.replace(/^\//, '').replace(/\/$/, '') || 'Startseite';
	}

	const verifiedSites = $derived(lf.sites.filter((site: SiteSeries) => site.dates.length > 0));
	const maxSiteTotal = $derived(Math.max(1, ...verifiedSites.map((site: SiteSeries) => total(site))));
</script>

<svelte:head><title>Folio · Leuchtfeuer</title></svelte:head>

<div class="page">
	<header class="page-header">
		<button class="back" type="button" onclick={() => goto('/')}>
			<ArrowLeft size={16} /> Heute
		</button>
		<h1>Leuchtfeuer</h1>
		<p class="sub">
			Resonanz auf Karriereprofil, Werkstatt und öffentliche Projekte · kein Client-Tracking.
			{#if lf.verifiedThrough} Geprüft bis {lf.verifiedThrough}.{/if}
		</p>
	</header>

	{#if verifiedSites.length === 0}
		<p class="notice">
			Die vorhandenen Werte stammen noch aus der alten Zählregel. Mit dem ersten gehärteten
			Collector-Lauf beginnt hier eine belastbare, visuelle Reihe.
		</p>
	{:else}
		<section>
			<div class="section-head">
				<div><span class="eyebrow">7 Tage</span><h2>Resonanz auf einen Blick</h2></div>
				<span class="section-note">Trend vergleicht die letzten drei mit den drei Tagen davor</span>
			</div>
			<div class="signal-grid">
				{#each verifiedSites as site (site.site)}
					<article class="signal {META[site.site]?.tone ?? ''}">
						<header>
							<div><span class="role">{META[site.site]?.role ?? site.site}</span><h3>{site.site}</h3></div>
							<span class="trend {trend(site.visits)}">{trend(site.visits)}</span>
						</header>
						<svg class="trendline" viewBox="0 0 160 42" preserveAspectRatio="none" aria-label="Aufruftrend">
							<polyline points={sparklinePoints(site.visits, 160, 42, 3)} />
						</svg>
						<div class="signal-foot">
							<strong>{total(site)}</strong><span>geprüfte Aufrufe</span>
							{#if site.topPaths[0]}<span class="top">meistgesehen: {pathLabel(site.topPaths[0].path)}</span>{/if}
						</div>
						{#if site.site === 'aion-lumen.ch' && storyShare(site) !== null}
							<div class="story-mini">
								<span>The Story</span>
								<div><i style={`width:${storyShare(site)}%`}></i></div>
								<span>{storyShare(site)} %</span>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		</section>

		<section class="comparison">
			<div class="section-head"><div><span class="eyebrow">Reichweite</span><h2>Welche Fläche trägt?</h2></div></div>
			<div class="bars">
				{#each [...verifiedSites].sort((a, b) => total(b) - total(a)) as site (site.site)}
					<div class="bar-row">
						<span>{META[site.site]?.role ?? site.site}</span>
						<div class="bar-track"><i class={META[site.site]?.tone ?? ''} style={`width:${(total(site) / maxSiteTotal) * 100}%`}></i></div>
						<strong>{total(site)}</strong>
					</div>
				{/each}
			</div>
		</section>

		<div class="analysis-grid">
			<section class="panel">
				<div class="section-head"><div><span class="eyebrow">Kanäle</span><h2>Woher kam Aufmerksamkeit?</h2></div></div>
				<div class="pie-grid">
					{#each verifiedSites as site (site.site)}
						<div class="pie-card">
							<div class="pie" style={sourcePie(site)} role="img" aria-label={`Herkunftskanäle für ${site.site}: ${sourceDescription(site)}`}></div>
							<div><strong>{META[site.site]?.role ?? site.site}</strong><small>{site.site}</small></div>
						</div>
					{/each}
				</div>
				<div class="legend"><span class="direct">ohne Referrer</span><span class="search">Suche</span><span class="social">Netzwerke</span><span class="other">andere</span></div>
				<p class="caveat">„Ohne Referrer“ kann ein Direktaufruf sein, aber auch ein Browser, der die Herkunft nicht mitsendet.</p>
			</section>

			<section class="panel">
				<div class="section-head"><div><span class="eyebrow">Inhalte</span><h2>Was bekam Aufmerksamkeit?</h2></div></div>
				<div class="pie-grid">
					{#each verifiedSites as site (site.site)}
						<div class="pie-card content-pie-card">
							<div class="pie" style={contentPie(site)} role="img" aria-label={`Meistgesehene Inhalte für ${site.site}: ${contentDescription(site)}`}></div>
							<div>
								<strong>{META[site.site]?.role ?? site.site}</strong>
								{#each site.topPaths.slice(0, 3) as path, index (path.path)}
									<small class={`slice slice-${index}`}>{pathLabel(path.path)}</small>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>

		{#if lf.github?.latest}
			<section class="github panel">
				<div class="section-head"><div><span class="eyebrow">Öffentliche Arbeit</span><h2>GitHub-Signale</h2></div></div>
				<div class="repo-grid">
					{#each Object.entries(lf.github.latest) as [repo, metric] (repo)}
						<div><strong>{repo}</strong><span>★ {metric.stars}</span><div class="repo-bar"><i style={`width:${Math.min(100, metric.views_unique * 8)}%`}></i></div><small>{metric.views_unique} interessierte Besucher · {metric.clones_unique} Klone</small></div>
					{/each}
				</div>
			</section>
		{/if}

		<details class="evidence">
			<summary>Messqualität und Grenzen</summary>
			<p>Gezählt werden nur GET, HTTP 200, vorhandene Seitenroute und kein erkannter Bot. Folio kann weder eigene Besuche noch Regionen erkennen: dafür werden absichtlich keine Besucherkennungen oder Standortdaten gespeichert.</p>
			<ul>
				{#each verifiedSites as site (site.site)}
					<li><strong>{site.site}</strong><span>{site.excluded7.total} ausgeschlossen · Route {site.excluded7.missingRoute} · Status {site.excluded7.non200} · Nicht-GET {site.excluded7.nonGet} · Bots {site.excluded7.uaBot}</span></li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<style>
	.page { max-width: 1120px; margin: 0 auto; padding: 44px 32px 72px; display: flex; flex-direction: column; gap: 32px; color: var(--color-foreground); }
	.page-header { display: flex; flex-direction: column; gap: 6px; }
	.back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; color: var(--color-muted-foreground); cursor: pointer; padding: 0; font: inherit; }
	h1, h2, h3, p { margin: 0; }
	h1 { font-size: 28px; }
	h2 { font-size: 17px; }
	.sub, .section-note, .caveat { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.5; }
	.notice { padding: 14px 16px; border-radius: 12px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 13px; }
	.section-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 13px; }
	.eyebrow, .role { display: block; color: var(--color-muted-foreground); font-size: 10px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
	.signal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	.signal, .panel, .comparison { border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-card); }
	.signal { position: relative; overflow: hidden; padding: 16px; }
	.signal::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--signal, hsl(28 92% 58%)); }
	.signal.career { --signal: hsl(158 62% 38%); } .signal.workshop { --signal: hsl(28 92% 58%); } .signal.cause { --signal: hsl(268 58% 58%); } .signal.learning { --signal: hsl(210 72% 52%); }
	.signal header { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
	.signal h3 { margin-top: 2px; font-size: 14px; }
	.trend { border-radius: 999px; padding: 3px 7px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 10px; }
	.trend.steigt { background: hsl(147 42% 92%); color: hsl(150 55% 28%); }
	.trend.ruhiger { background: hsl(36 70% 93%); color: hsl(30 60% 34%); }
	.trendline { width: 100%; height: 46px; margin: 14px 0 8px; }
	.trendline polyline { fill: none; stroke: var(--signal, hsl(28 92% 58%)); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.signal-foot { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; color: var(--color-muted-foreground); font-size: 11px; }
	.signal-foot strong { color: var(--color-foreground); font-size: 20px; }
	.signal-foot .top { flex-basis: 100%; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.story-mini { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; margin-top: 10px; font-size: 10px; color: var(--color-muted-foreground); }
	.story-mini div, .bar-track, .repo-bar { height: 6px; border-radius: 999px; background: var(--color-muted); overflow: hidden; }
	.story-mini i, .bar-track i, .repo-bar i { display: block; height: 100%; background: hsl(28 92% 58%); border-radius: inherit; }
	.comparison, .panel { padding: 18px 20px; }
	.bars { display: flex; flex-direction: column; gap: 10px; }
	.bar-row { display: grid; grid-template-columns: 150px 1fr 42px; align-items: center; gap: 10px; font-size: 12px; }
	.bar-row strong { text-align: right; }
	.bar-track { height: 12px; }
	.bar-track i.career { background: hsl(158 62% 38%); } .bar-track i.workshop { background: hsl(28 92% 58%); } .bar-track i.cause { background: hsl(268 58% 58%); } .bar-track i.learning { background: hsl(210 72% 52%); }
	.analysis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
	.pie-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; }
	.pie-card { display: grid; grid-template-columns: 58px 1fr; align-items: center; gap: 10px; min-width: 0; }
	.pie-card > div:last-child { min-width: 0; }
	.pie-card strong, .pie-card small { display: block; }
	.pie-card strong { font-size: 11px; }
	.pie-card small { margin-top: 2px; color: var(--color-muted-foreground); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pie { width: 56px; aspect-ratio: 1; border-radius: 50%; position: relative; }
	.pie::after { content: ''; position: absolute; inset: 12px; border-radius: 50%; background: var(--color-card); }
	.direct { --swatch: hsl(215 18% 66%); } .search { --swatch: hsl(158 55% 45%); } .social { --swatch: hsl(28 92% 58%); } .other { --swatch: hsl(268 48% 62%); }
	.legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 13px; font-size: 10px; color: var(--color-muted-foreground); }
	.legend span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 4px; border-radius: 2px; background: var(--swatch); }
	.caveat { margin-top: 10px; }
	.content-pie-card .slice::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 2px; background: hsl(28 92% 58%); }
	.content-pie-card .slice-1::before { background: hsl(210 72% 52%); }
	.content-pie-card .slice-2::before { background: hsl(268 48% 62%); }
	.repo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
	.repo-grid > div { display: grid; grid-template-columns: 1fr auto; gap: 6px; font-size: 12px; }
	.repo-grid small { grid-column: 1 / -1; color: var(--color-muted-foreground); }
	.repo-bar { grid-column: 1 / -1; }
	.evidence { border-top: 1px solid var(--color-border); padding-top: 14px; color: var(--color-muted-foreground); font-size: 12px; }
	.evidence summary { color: var(--color-foreground); cursor: pointer; font-weight: 600; }
	.evidence p { max-width: 760px; margin: 10px 0; line-height: 1.5; }
	.evidence ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 5px; }
	.evidence li { display: flex; gap: 10px; justify-content: space-between; }
	@media (max-width: 850px) { .signal-grid { grid-template-columns: 1fr 1fr; } .analysis-grid { grid-template-columns: 1fr; } }
	@media (max-width: 560px) { .page { padding: 28px 18px 56px; } .signal-grid, .repo-grid { grid-template-columns: 1fr; } .section-note { display: none; } .bar-row { grid-template-columns: 105px 1fr 34px; } .pie-grid { grid-template-columns: 1fr; } .evidence li { flex-direction: column; gap: 2px; } }
</style>
