<!--
  2026-06-07 TallyChips: 5 Zähl-Pillen ("Diese Runde erzeugt").
  Werte aus worker_run_summary.
-->
<script lang="ts">
	import type { TallyChip } from '../types.js';

	let { chips }: { chips: TallyChip[] } = $props();
</script>

<div class="tally">
	{#each chips as c}
		<div class="tchip tone-{c.tone}">
			<b>{c.n}</b>
			<span class="lbl">{c.label}</span>
		</div>
	{/each}
</div>

<style>
	.tally {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.tchip {
		display: flex;
		align-items: baseline;
		gap: 5px;
		padding: 6px 10px;
		border-radius: 8px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		background: hsl(214 24% 95%);
		color: hsl(215 16% 30%);
		border: 1px solid hsl(214 25% 88%);
	}
	.tchip b {
		font-size: 13px;
		font-weight: 600;
	}
	.tchip .lbl {
		text-transform: lowercase;
		opacity: 0.85;
	}
	.tone-green {
		background: hsl(142 45% 95%);
		border-color: hsl(142 40% 80%);
		color: hsl(142 64% 28%);
	}
	.tone-ember {
		background: hsl(28 95% 95%);
		border-color: hsl(28 60% 82%);
		color: hsl(22 90% 32%);
	}
	.tone-blue {
		background: hsl(214 70% 95%);
		border-color: hsl(214 60% 82%);
		color: hsl(217 80% 32%);
	}
</style>
