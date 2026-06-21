<!--
  2026-06-07 Lane: eine Lane des Datenfluss-Diagramms mit Caption +
  Nodes-Reihe + Edges dazwischen.
-->
<script lang="ts">
	import type { StageDef, StageState, StageId, LaneKey } from '../types.js';
	import FlowNode from './FlowNode.svelte';
	import FlowEdge from './FlowEdge.svelte';

	let {
		stages,
		caption,
		tone,
		state,
		counts
	}: {
		stages: StageDef[];
		caption: string;
		tone: LaneKey;
		state: Record<StageId, StageState>;
		counts: Record<StageId, number | string>;
	} = $props();

	const isEmber = $derived(tone === 'council');

	function edgeLit(a: StageId, b: StageId): boolean {
		// Lit wenn vorheriger Knoten done und naechster done oder active
		return state[a] === 'done' && (state[b] === 'active' || state[b] === 'done');
	}
</script>

<div class="lane">
	<div class="lane-cap" class:ember={isEmber}>
		<span class="ld"></span>
		{caption}
	</div>
	<div class="lane-row">
		{#each stages as s, i (s.id)}
			{#if i > 0}
				<FlowEdge lit={edgeLit(stages[i - 1].id, s.id)} ember={isEmber} />
			{/if}
			<FlowNode stage={s} state={state[s.id]} count={counts[s.id]} />
		{/each}
	</div>
</div>

<style>
	.lane {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-grow: 1;
	}
	.lane-cap {
		display: flex;
		align-items: center;
		gap: 7px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 50%);
		font-weight: 500;
	}
	.lane-cap .ld {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: hsl(217 80% 52%);
	}
	.lane-cap.ember .ld {
		background: hsl(22 90% 48%);
	}
	.lane-row {
		display: flex;
		align-items: flex-start;
	}
</style>
