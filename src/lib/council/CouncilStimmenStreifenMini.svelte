<!--
  Mobile 1a (2026-05-30): kleiner-Variante des Stimmen-Streifens für
  foto-led Mobile-Karten. Gleiches visuelles Vokabular wie das Original,
  10px-Zellen statt 14px, kein weißer Container.
-->
<script lang="ts">
	import type { CouncilVoice, CouncilConsensusState } from '$lib/server/council-db/types.js';

	let {
		voices,
		state
	}: {
		voices: CouncilVoice[];
		state: CouncilConsensusState;
	} = $props();
</script>

<span
	class="mini"
	class:ne={state === 'ne'}
	class:ne-strong={state === 'ne-strong'}
	aria-label="Council-Stimmen (mini)"
>
	{#each voices as v (v.lens_id)}
		{#if v.kind === 'present'}
			<span class="qc qc-{v.score_bucket}" class:low-conf={v.confidence === 'low'}></span>
		{:else}
			<span class="qc missing"></span>
		{/if}
	{/each}
</span>

<style>
	.mini {
		display: inline-flex;
		gap: 2px;
		padding: 2px 3px;
		border-radius: 4px;
	}
	.mini.ne {
		background: hsl(28 95% 94%);
		box-shadow: inset 0 0 0 1px hsl(28 80% 80%);
	}
	.mini.ne-strong {
		background: hsl(28 95% 90%);
		box-shadow: inset 0 0 0 1px hsl(28 80% 65%);
	}
	.qc {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
		border: 1px solid hsl(0 0% 0% / 0.06);
	}
	.qc-top {
		background: hsl(140 50% 50%);
	}
	.qc-mid {
		background: hsl(45 80% 55%);
	}
	.qc-low {
		background: hsl(210 8% 70%);
	}
	.qc.low-conf {
		opacity: 0.55;
	}
	.qc.missing {
		background: transparent;
		border: 1px dashed hsl(210 8% 75%);
	}
</style>
