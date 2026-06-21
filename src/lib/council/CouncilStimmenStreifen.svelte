<!--
  CouncilStimmenStreifen — 3-Slot-Streifen für Council-Listen-Ansicht.

  Visuelles Vokabular aus Mail-StimmenStreifen (final.html), aber datenseitig
  unterschiedlich: Council-Voice hat Rang+Score-Bucket statt Domain. Kachel-
  Farbe = Score-Bucket (top/mid/low). Bühnen-State = Konsens wie Mail
  (still/ne/ne-strong).

  Iteration 1: dumbe Komponente, alle Daten + Konsens server-side
  pre-computed in council-db/reader.ts.
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

	function tooltipFor(v: CouncilVoice): string {
		if (v.kind === 'present') {
			const conf = v.confidence ? ` · ${v.confidence}` : '';
			return `${v.label} · Rang ${v.rank}${conf}`;
		}
		return `${v.label} · nicht bewertet`;
	}
</script>

<span
	class="stripe"
	class:still={state === 'still'}
	class:ne={state === 'ne'}
	class:ne-strong={state === 'ne-strong'}
	aria-label="Council-Stimmen"
>
	{#each voices as v (v.lens_id)}
		{#if v.kind === 'present'}
			<span
				class="qcell qc-{v.score_bucket}"
				class:low-conf={v.confidence === 'low'}
				data-label={v.label.slice(0, 1)}
				title={tooltipFor(v)}
			></span>
		{:else}
			<span class="qcell missing" title={tooltipFor(v)}></span>
		{/if}
	{/each}
</span>

<style>
	.stripe {
		display: inline-flex;
		gap: 1px;
		padding: 2px;
		border-radius: 3px;
		background: white;
		border: 1px solid var(--color-border);
	}
	.stripe.ne {
		box-shadow: 0 0 0 1px hsl(28 80% 70%);
	}
	.stripe.ne-strong {
		box-shadow: 0 0 0 1px hsl(28 80% 55%);
	}

	.qcell {
		width: 12px;
		height: 14px;
		border-radius: 2px;
		display: inline-block;
		position: relative;
	}

	/* Score-Bucket-Farben */
	.qc-top {
		background: hsl(140 50% 50%);
	} /* Rang 1-3 = grün */
	.qc-mid {
		background: hsl(45 80% 55%);
	} /* Rang 4-7 = amber */
	.qc-low {
		background: hsl(210 8% 70%);
	} /* Rang 8-10 = neutral-grau */

	.qcell.low-conf {
		opacity: 0.55;
	}

	.qcell.missing {
		background: transparent;
		border: 1px dashed hsl(210 8% 75%);
	}
	.qcell.missing::after {
		content: '·';
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		color: hsl(210 8% 60%);
	}
</style>
