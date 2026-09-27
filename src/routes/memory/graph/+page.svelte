<script lang="ts">
	import { ArrowLeft, Brain, Cuboid, Eye, Maximize2, Network, Search, Square, X } from 'lucide-svelte';
	import ForceMemoryGraph from '$lib/components/memory/ForceMemoryGraph.svelte';
	import { graphSelection } from '$lib/components/memory/graph-presentation.js';

	let { data } = $props();
	type Node = (typeof data.graph.nodes)[number];
	type Edge = (typeof data.graph.edges)[number];
	type ViewMode = '2d' | '3d';
	const domainLabels: Record<string, string> = {
		ai: 'KI & Wissen', career: 'Karriere', personal: 'Persönlich', finance: 'Finanzen', health: 'Gesundheit',
		systems: 'Systeme', data_analytics: 'Daten & Analytics', family: 'Familie', property: 'Immobilien', mobility: 'Mobilität', household: 'Haushalt', undetermined: 'Ungeklärt'
	};
	const kindLabels = { entity: 'Entität', fact: 'Fakt', episode: 'Ereignis', source: 'Quelle', domain: 'Domäne' } as const;
	const sensitivityLabels = { public: 'öffentlich', private: 'privat', sensitive: 'sensibel' } as const;
	const palette = ['#268789', '#8565b8', '#d18436', '#527fb8', '#bf6689', '#5d946e', '#a76f54'];
	const graph = $derived(data.graph);
	const domainColors = $derived(Object.fromEntries(graph.domains.map((item, index) => [item.domain, palette[index % palette.length]])) as Record<string, string>);

	let domain = $state('all');
	let query = $state('');
	let showFacts = $state(true);
	let showEpisodes = $state(true);
	let showSources = $state(true);
	let showProvenance = $state(true);
	let showSemantics = $state(true);
	let selectedId = $state<string | null>(null);
	let mode = $state<ViewMode>('2d');
	let fitRequest = $state(0);

	function matches(node: Node): boolean {
		const needle = query.trim().toLocaleLowerCase('de-CH');
		return !needle || `${node.label} ${node.subtitle} ${node.type}`.toLocaleLowerCase('de-CH').includes(needle);
	}

	const visibleNodes = $derived(graph.nodes.filter((node) =>
		(domain === 'all' || node.domains.includes(domain))
		&& (showFacts || node.kind !== 'fact')
		&& (showEpisodes || node.kind !== 'episode')
		&& (showSources || (node.kind !== 'source' && node.kind !== 'domain'))
		&& matches(node)
	));
	const visibleIds = $derived(new Set(visibleNodes.map((node) => node.id)));
	function isProvenance(edge: Edge): boolean {
		return edge.kind === 'source_domain' || edge.kind === 'evidence' || edge.kind === 'derived_from';
	}
	const visibleEdges = $derived(graph.edges.filter((edge) =>
		visibleIds.has(edge.source) && visibleIds.has(edge.target)
		&& (isProvenance(edge) ? showProvenance : showSemantics)
	));
	const selection = $derived(graphSelection(selectedId, visibleNodes, visibleEdges, graph.edges));
	const selected = $derived(selection.node);
	const selectedEdges = $derived(selection.edges);
	$effect(() => {
		if (selectedId && !visibleIds.has(selectedId)) selectedId = null;
	});

	function connectedNode(edge: Edge): Node | null {
		const id = edge.source === selectedId ? edge.target : edge.source;
		return graph.nodes.find((node) => node.id === id) ?? null;
	}

	function chooseMode(next: ViewMode): void {
		mode = next;
		fitRequest += 1;
	}
</script>

<svelte:head>
	<title>Folio · Gedächtnisgraph</title>
	<meta name="description" content="Navigierbare Projektion bestätigter Folio-Entitäten, Fakten und Beziehungen." />
</svelte:head>

<div class="graph-page">
	<header class="hero">
		<a href="/"><ArrowLeft size={17} /> Übersicht</a>
		<div class="title-row">
			<div>
				<span><Network size={16} /> GEDÄCHTNISGRAPH</span>
				<h1>Was zusammengehört.</h1>
				<p>Eine neu aufbaubare Sicht auf bestätigtes Wissen und menschlich zugeordnete Quellen. Quellenkandidaten sind noch keine Fakten.</p>
			</div>
			<button class="secondary" type="button" onclick={() => (fitRequest += 1)}><Maximize2 size={15} /> Alles einpassen</button>
		</div>
	</header>

	<section class="stats" aria-label="Graph-Status">
		<div><strong>{graph.stats.entities}</strong><span>Entitäten</span></div>
		<div><strong>{graph.stats.relations}</strong><span>Beziehungen</span></div>
		<div><strong>{graph.stats.sources}</strong><span>Belegquellen · {graph.stats.derived_sources} abgeleitet</span></div>
		<div><strong>{graph.stats.evidence_links + graph.stats.derived_links}</strong><span>Belegverknüpfungen</span></div>
		<div class:complete={graph.stats.isolated_nodes === 0}><strong>{graph.stats.isolated_nodes}</strong><span>lose Knoten</span></div>
	</section>

	<section class="workspace">
		<div class="toolbar">
			<label class="search"><span class="search-icon"><Search size={16} /></span><input bind:value={query} placeholder="Entität, Fakt oder Ereignis suchen" /></label>
			<label>Domäne<select bind:value={domain}><option value="all">Alle Domänen</option>{#each graph.domains as item}<option value={item.domain}>{domainLabels[item.domain] ?? item.domain} · {item.nodes}</option>{/each}</select></label>
			<label class="toggle"><input type="checkbox" bind:checked={showFacts} /> Fakten</label>
			<label class="toggle"><input type="checkbox" bind:checked={showEpisodes} /> Ereignisse</label>
			<label class="toggle"><input type="checkbox" bind:checked={showSources} /> Quellen</label>
			<label class="toggle edge-toggle"><input type="checkbox" bind:checked={showProvenance} /> Provenienz</label>
			<label class="toggle edge-toggle"><input type="checkbox" bind:checked={showSemantics} /> Semantik</label>
			<div class="mode-switch" aria-label="Darstellung">
				<button class:active={mode === '2d'} type="button" onclick={() => chooseMode('2d')} aria-pressed={mode === '2d'}><Square size={14} /> 2D</button>
				<button class:active={mode === '3d'} type="button" onclick={() => chooseMode('3d')} aria-pressed={mode === '3d'}><Cuboid size={15} /> 3D</button>
			</div>
		</div>

		<div class="graph-shell">
			<div class="canvas-wrap">
				<ForceMemoryGraph
					nodes={visibleNodes}
					edges={visibleEdges}
					{domainColors}
					{selectedId}
					{mode}
					{fitRequest}
					onselect={(id) => (selectedId = id)}
				/>
				<div class="canvas-note">{mode === '3d' ? 'Ziehen dreht · Scrollen zoomt · Knoten ziehen ordnet neu' : 'Ziehen verschiebt · Scrollen zoomt · Knoten ziehen ordnet neu'}</div>
				<div class="legend">
					{#each graph.domains as item}<span><i style={`background:${domainColors[item.domain]}`}></i>{domainLabels[item.domain] ?? item.domain}</span>{/each}
					<span><i class="fact-dot"></i>Fakt</span><span><i class="episode-dot"></i>Ereignis</span><span><i class="source-dot"></i>Quelle</span>
					<span><i class="evidence-line"></i>belegt durch</span><span><i class="semantic-line"></i>semantisch</span>
				</div>
				<div class="sr-only" aria-label="Sichtbare Knoten">
					{#each visibleNodes as node}<button type="button" onclick={() => (selectedId = node.id)}>{kindLabels[node.kind]}: {node.label}</button>{/each}
				</div>
			</div>

			<aside class:empty={!selected}>
				{#if selected}
					<button class="close" type="button" onclick={() => (selectedId = null)} aria-label="Detail schliessen"><X size={18} /></button>
					<div class="kind"><Brain size={15} /> {kindLabels[selected.kind]} · {selected.domains.map((item) => domainLabels[item] ?? item).join(' · ')}</div>
					<h2>{selected.label}</h2>
					<p>{selected.subtitle}</p>
					<div class="meta"><span>{selected.type.replaceAll('_', ' ')}</span><span>{sensitivityLabels[selected.sensitivity]}</span><span>{selected.source_kind}</span></div>
					<small>Quelle: {selected.source_ref}</small>
					<div class="connections">
						<h3>{selectedEdges.length} {selectedEdges.length === 1 ? 'Verbindung' : 'Verbindungen'}</h3>
						{#each selectedEdges as edge}{@const neighbour = connectedNode(edge)}{#if neighbour}<button type="button" onclick={() => (selectedId = neighbour.id)}><span>{edge.label.replaceAll('_', ' ')}</span><strong>{neighbour.label}</strong></button>{/if}{/each}
						{#if selection.hiddenConnections > 0}<p>{selection.hiddenConnections} {selection.hiddenConnections === 1 ? 'Verbindung durch Filter ausgeblendet.' : 'Verbindungen durch Filter ausgeblendet.'}</p>{/if}
						{#if selection.totalConnections === 0}<p>Dieser Knoten ist noch isoliert. Das ist eine sichtbare Lücke, keine erfundene Verbindung.</p>{/if}
					</div>
				{:else}
					<Eye size={24} /><h2>Knoten auswählen</h2><p>Klicke auf einen Knoten, um Quelle, Typ und belegte Nachbarn zu sehen. Die räumliche Anordnung entsteht lokal aus den gespeicherten Verbindungen.</p>
				{/if}
			</aside>
		</div>
	</section>
</div>

<style>
	:global(body) { overflow-x: hidden; }
	.graph-page { max-width: 1540px; margin: 0 auto; padding: 30px 34px 70px; color: var(--color-foreground); }
	.hero > a { display: inline-flex; align-items: center; gap: 7px; color: var(--color-muted-foreground); font-size: 13px; text-decoration: none; }
	.title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-top: 20px; }
	.title-row > div > span { display: flex; align-items: center; gap: 7px; color: hsl(181 52% 31%); font-size: 11px; font-weight: 700; letter-spacing: .13em; }
	h1 { margin: 8px 0 0; font-size: clamp(36px, 5vw, 56px); line-height: 1; letter-spacing: -.045em; }
	.hero p { max-width: 760px; margin: 13px 0 0; color: var(--color-muted-foreground); font-size: 15px; line-height: 1.55; }
	button, input, select { font: inherit; }
	button { cursor: pointer; }
	.secondary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px; padding: 0 15px; border: 1px solid var(--color-border); border-radius: 11px; color: var(--color-foreground); background: white; font-weight: 600; }
	.stats { display: grid; grid-template-columns: repeat(5, 1fr); margin: 26px 0 16px; border: 1px solid var(--color-border); border-radius: 15px; background: white; overflow: hidden; }
	.stats > div { display: flex; flex-direction: column; gap: 2px; min-height: 78px; padding: 15px 18px; border-right: 1px solid var(--color-border); }
	.stats > div:last-child { border: 0; }
	.stats strong { font-size: 23px; }
	.stats span { color: var(--color-muted-foreground); font-size: 10px; }
	.stats .complete strong { color: hsl(154 52% 32%); }
	.workspace { border: 1px solid var(--color-border); border-radius: 18px; background: white; overflow: hidden; }
	.toolbar { display: flex; align-items: end; gap: 13px; padding: 13px 16px; border-bottom: 1px solid var(--color-border); background: hsl(210 25% 99%); }
	.toolbar label { display: flex; flex-direction: column; gap: 5px; color: var(--color-muted-foreground); font-size: 10px; font-weight: 650; }
	.toolbar .search { position: relative; flex: 1; }
	.search-icon { position: absolute; left: 11px; bottom: 11px; display: inline-flex; }
	input, select { box-sizing: border-box; min-height: 38px; border: 1px solid var(--color-border); border-radius: 9px; color: var(--color-foreground); background: white; }
	.search input { width: 100%; padding: 0 12px 0 34px; }
	select { min-width: 170px; padding: 0 10px; }
	.toolbar .toggle { flex-direction: row; align-items: center; gap: 7px; min-height: 38px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 9px; color: var(--color-foreground); background: white; font-size: 11px; }
	.toggle input { min-height: 0; accent-color: hsl(181 47% 32%); }
	.mode-switch { display: flex; height: 38px; padding: 3px; border: 1px solid var(--color-border); border-radius: 10px; background: white; }
	.mode-switch button { display: inline-flex; align-items: center; gap: 5px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--color-muted-foreground); background: transparent; font-size: 10px; font-weight: 700; }
	.mode-switch button.active { color: white; background: hsl(181 46% 34%); }
	.graph-shell { display: grid; grid-template-columns: minmax(0, 1fr) 310px; min-height: 690px; }
	.canvas-wrap { position: relative; min-width: 0; height: 690px; overflow: hidden; background: radial-gradient(circle at 50% 45%, hsl(180 24% 99%), hsl(216 28% 97%)); }
	.canvas-note { position: absolute; z-index: 2; top: 12px; left: 12px; padding: 7px 9px; border: 1px solid rgb(210 220 228 / .8); border-radius: 8px; color: var(--color-muted-foreground); background: rgb(255 255 255 / .82); backdrop-filter: blur(8px); font-size: 9px; pointer-events: none; }
	.legend { position: absolute; z-index: 2; left: 13px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 7px 12px; max-width: calc(100% - 26px); padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 9px; color: var(--color-muted-foreground); background: rgb(255 255 255 / .9); backdrop-filter: blur(8px); font-size: 9px; pointer-events: none; }
	.legend span { display: inline-flex; align-items: center; gap: 5px; }
	.legend i { width: 8px; height: 8px; border-radius: 50%; }
	.legend i.fact-dot { border: 2px solid hsl(181 46% 46%); background: transparent; }
	.legend i.episode-dot { border-radius: 2px; background: hsl(181 46% 46%); transform: rotate(45deg); }
	.legend i.source-dot { width: 10px; height: 6px; border-radius: 2px; background: hsl(32 72% 50%); }
	.legend i.evidence-line, .legend i.semantic-line { width: 14px; height: 2px; border-radius: 2px; background: #b6c0cf; }
	.legend i.semantic-line { background: #79aeb0; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	aside { position: relative; padding: 24px 20px; border-left: 1px solid var(--color-border); background: hsl(210 25% 99%); }
	aside.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--color-muted-foreground); text-align: center; }
	aside.empty h2 { color: var(--color-foreground); }
	aside .close { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 34px; height: 34px; border: 0; color: var(--color-muted-foreground); background: transparent; }
	.kind { display: flex; align-items: center; gap: 7px; padding-right: 30px; color: hsl(181 47% 31%); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
	aside h2 { margin: 13px 0 7px; font-size: 21px; line-height: 1.25; }
	aside > p { color: var(--color-muted-foreground); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
	.meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 15px 0; }
	.meta span { padding: 4px 7px; border-radius: 7px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 9px; }
	aside > small { display: block; color: var(--color-muted-foreground); font-size: 9px; overflow-wrap: anywhere; }
	.connections { margin-top: 24px; padding-top: 17px; border-top: 1px solid var(--color-border); }
	.connections h3 { margin: 0 0 10px; font-size: 13px; }
	.connections button { display: flex; flex-direction: column; gap: 2px; width: 100%; margin-bottom: 7px; padding: 10px; border: 1px solid var(--color-border); border-radius: 9px; text-align: left; background: white; }
	.connections button span { color: hsl(181 44% 31%); font-size: 8px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.connections button strong { font-size: 11px; }
	.connections p { color: var(--color-muted-foreground); font-size: 11px; line-height: 1.5; }
	@media (max-width: 1040px) { .toolbar { align-items: stretch; flex-wrap: wrap; }.toolbar .search { flex-basis: 100%; } }
	@media (max-width: 900px) { .graph-page { padding: 22px 16px 60px; }.title-row { align-items: start; flex-direction: column; }.graph-shell { grid-template-columns: 1fr; }.canvas-wrap { height: 590px; }.graph-shell aside { min-height: 220px; border-top: 1px solid var(--color-border); border-left: 0; }.stats { grid-template-columns: 1fr 1fr; }.stats > div:nth-child(even) { border-right: 0; }.stats > div:not(:last-child) { border-bottom: 1px solid var(--color-border); }.stats > div:last-child { grid-column: 1 / -1; } }
	@media (max-width: 560px) { .toolbar { display: grid; grid-template-columns: 1fr 1fr; }.toolbar .search { grid-column: 1 / -1; }.toolbar label:not(.toggle) { grid-column: 1 / -1; }.toolbar select { width: 100%; }.mode-switch { grid-column: 1 / -1; }.mode-switch button { flex: 1; justify-content: center; }.canvas-wrap { height: 520px; }.stats strong { font-size: 20px; }.canvas-note { display: none; } }
</style>
