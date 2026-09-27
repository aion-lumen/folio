<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { escapeGraphTooltip } from './graph-presentation.js';
	import type {
		ForceGraph3DInstance,
		LinkObject,
		NodeObject
	} from '3d-force-graph';
	import type {
		MemoryGraphEdge,
		MemoryGraphNode
	} from '$lib/server/memory/graph.js';

	type ViewMode = '2d' | '3d';
	type RenderNode = MemoryGraphNode & NodeObject;
	type RenderLink = MemoryGraphEdge & LinkObject<RenderNode>;
	type Controls = {
		enableRotate?: boolean;
		autoRotate?: boolean;
		mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number };
	};
	type AdjustableForce = { strength?: (value: number) => unknown; distance?: (value: number | ((link: RenderLink) => number)) => unknown };

	let {
		nodes,
		edges,
		domainColors,
		selectedId = null,
		mode = '2d',
		fitRequest = 0,
		onselect
	}: {
		nodes: MemoryGraphNode[];
		edges: MemoryGraphEdge[];
		domainColors: Record<string, string>;
		selectedId?: string | null;
		mode?: ViewMode;
		fitRequest?: number;
		onselect: (id: string | null) => void;
	} = $props();

	let host: HTMLDivElement;
	let renderer = $state.raw<ForceGraph3DInstance<RenderNode, RenderLink> | null>(null);
	let resizeObserver: ResizeObserver | null = null;
	let loading = $state(true);
	let error = $state('');
	let appliedMode: ViewMode | null = null;

	function colorFor(node: RenderNode): string {
		if (node.id === selectedId) return '#f2bd3f';
		return domainColors[node.domain] ?? '#67758b';
	}

	function nodeValue(node: RenderNode): number {
		return node.kind === 'domain' ? 9 : node.kind === 'entity' ? 7 : node.kind === 'episode' ? 4 : node.kind === 'source' ? (node.type === 'derived_evidence_source' ? 2.8 : 3.5) : 2.2;
	}

	function endpointId(endpoint: string | number | RenderNode | undefined): string {
		return typeof endpoint === 'object' && endpoint !== null ? String(endpoint.id ?? '') : String(endpoint ?? '');
	}

	function isSelectedLink(link: RenderLink): boolean {
		return Boolean(selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId));
	}

	function cloneData(): { nodes: RenderNode[]; links: RenderLink[] } {
		// The force engine writes positions and object references into its input.
		// Keep the server projection immutable so filters and evidence details stay truthful.
		return {
			nodes: nodes.map((node) => ({ ...node })),
			links: edges.map((edge) => ({ ...edge }))
		};
	}

	function focusNode(node: RenderNode): void {
		if (!renderer) return;
		const x = node.x ?? 0;
		const y = node.y ?? 0;
		const z = mode === '3d' ? (node.z ?? 0) : 0;
		const length = Math.hypot(x, y, z);
		const distance = mode === '3d' ? 115 : 95;
		const ratio = length > 0.01 ? 1 + distance / length : 1;
		renderer.cameraPosition(
			{
				x: x * ratio,
				y: y * ratio,
				z: mode === '3d' ? (length > 0.01 ? z * ratio : distance) : 330
			},
			{ x, y, z },
			700
		);
	}

	function resize(): void {
		if (!renderer || !host) return;
		renderer.width(Math.max(320, host.clientWidth)).height(Math.max(460, host.clientHeight));
	}

	function applyMode(): void {
		if (!renderer) return;
		if (appliedMode === mode) return;
		appliedMode = mode;
		renderer.numDimensions(mode === '3d' ? 3 : 2);
		const controls = renderer.controls() as Controls;
		controls.enableRotate = mode === '3d';
		controls.autoRotate = false;
		if (controls.mouseButtons) controls.mouseButtons.LEFT = mode === '3d' ? 0 : 2;
		// numDimensions schedules an internal graph rebuild. Reheating in the same
		// frame starts the render loop before three-forcegraph has installed its
		// new layout (state.layout is still undefined). Let the library finish its
		// update first; changing dimensions already reheats the simulation.
		requestAnimationFrame(() => requestAnimationFrame(() => {
			if (!renderer) return;
			const charge = renderer.d3Force('charge') as AdjustableForce | null;
			charge?.strength?.(mode === '3d' ? -105 : -145);
			const link = renderer.d3Force('link') as AdjustableForce | null;
			link?.distance?.((edge: RenderLink) => edge.kind === 'relation'
				? 82
				: edge.kind === 'source_domain'
					? 68
					: edge.kind === 'derived_from'
						? 72
						: edge.kind === 'evidence' ? 44 : 56);
			renderer.d3ReheatSimulation();
			setTimeout(() => renderer?.zoomToFit(650, 70), 80);
		}));
	}

	function applyAppearance(): void {
		if (!renderer) return;
		renderer
			.nodeColor((node) => colorFor(node))
			.nodeVal(nodeValue)
			.linkColor((link) => isSelectedLink(link)
				? '#2b8c8e'
				: link.kind === 'relation'
					? '#79aeb0'
					: link.kind === 'derived_from' ? '#9b86b8' : link.kind === 'evidence' ? '#c7ced8' : '#b6c0cf')
			.linkOpacity(0.48)
			.linkWidth((link) => isSelectedLink(link) ? 2.4 : link.kind === 'relation' ? 1.35 : link.kind === 'derived_from' ? 1.1 : 0.65)
			.linkDirectionalArrowLength((link) => link.kind === 'relation' || link.kind === 'derived_from' ? 3.5 : 0)
			.linkDirectionalArrowRelPos(0.82);
	}

	$effect(() => {
		if (!renderer) return;
		renderer.graphData(cloneData());
		applyAppearance();
		setTimeout(() => renderer?.zoomToFit(650, 70), 70);
	});

	$effect(() => {
		selectedId;
		applyAppearance();
	});

	$effect(() => {
		mode;
		applyMode();
	});

	$effect(() => {
		fitRequest;
		if (renderer) renderer.zoomToFit(650, 70);
	});

	onMount(async () => {
		try {
			const { default: ForceGraph3D } = await import('3d-force-graph');
			const graphRenderer = new ForceGraph3D(host, {
				controlType: 'orbit',
				rendererConfig: { antialias: true, alpha: false }
			}) as unknown as ForceGraph3DInstance<RenderNode, RenderLink>;
			graphRenderer
				.backgroundColor('#f5f8f9')
				.showNavInfo(false)
				.nodeId('id')
				.nodeLabel((node) => escapeGraphTooltip(`${node.label} — ${node.subtitle}`))
				.linkLabel((link) => escapeGraphTooltip(link.label.replaceAll('_', ' ')))
				.nodeOpacity(0.92)
				.enableNodeDrag(true)
				.onNodeClick((node) => {
					onselect(String(node.id));
					focusNode(node);
				})
				.onBackgroundClick(() => onselect(null))
				.warmupTicks(70)
				.cooldownTicks(260)
				.numDimensions(mode === '3d' ? 3 : 2)
				.graphData(cloneData());
			appliedMode = mode;
			renderer = graphRenderer;
			resizeObserver = new ResizeObserver(resize);
			resizeObserver.observe(host);
			resize();
			applyAppearance();
			loading = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Der Graph konnte nicht geladen werden.';
			loading = false;
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		renderer?._destructor();
		renderer = null;
	});
</script>

<div class="force-host" bind:this={host} role="application" aria-label={`Navigierbarer Gedächtnisgraph in ${mode === '3d' ? 'drei' : 'zwei'} Dimensionen`}>
	{#if loading}<div class="state">Graph wird aufgebaut …</div>{/if}
	{#if error}<div class="state error">{error}</div>{/if}
	{#if !loading && !error && nodes.length === 0}<div class="state">Für diese Auswahl gibt es keine Knoten.</div>{/if}
</div>

<style>
	.force-host { position: absolute; inset: 0; min-width: 0; min-height: 460px; overflow: hidden; touch-action: none; }
	.force-host :global(canvas) { display: block; outline: none; }
	.state { position: absolute; z-index: 3; inset: 0; display: grid; place-items: center; padding: 24px; color: var(--color-muted-foreground); background: hsl(210 25% 98%); font-size: 13px; text-align: center; }
	.state.error { color: hsl(2 63% 40%); background: hsl(2 70% 98%); }
</style>
