<!--
  2026-06-07 Auswertung: 4 grosse Zahlen aus worker_run_summary.
  Wird in RunDetail bei mail-side runs gezeigt.
-->
<script lang="ts">
	import type { WorkerRunSummaryRow, CouncilRunSummaryRow } from '$lib/server/folio-db/types.js';

	let { summary, source }: {
		summary: WorkerRunSummaryRow | CouncilRunSummaryRow;
		source: 'mail' | 'council';
	} = $props();

	const items = $derived.by(() => {
		if (source === 'mail') {
			const s = summary as WorkerRunSummaryRow;
			return [
				{ label: 'geprüft', n: s.geprueft },
				{ label: 'übernommen', n: s.uebernommen, tone: 'green' as const },
				{ label: 'actionable', n: s.actionable },
				{ label: 'archive-silent', n: s.archive_silent, tone: 'muted' as const }
			];
		}
		const s = summary as CouncilRunSummaryRow;
		return [
			{ label: 'geprüft', n: s.geprueft },
			{ label: 'objekte', n: s.objects_created, tone: 'ember' as const },
			{ label: 'marker', n: s.marker_count }
		];
	});
</script>

<div class="aus">
	{#each items as it}
		<div class="mtr">
			<div class="mtr-n" class:tone-green={it.tone === 'green'} class:tone-ember={it.tone === 'ember'} class:tone-muted={it.tone === 'muted'}>{it.n}</div>
			<div class="mtr-l">{it.label}</div>
		</div>
	{/each}
</div>

<style>
	.aus {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		padding: 10px 0;
	}
	.mtr {
		text-align: left;
	}
	.mtr-n {
		font-size: 24px;
		font-weight: 600;
		color: hsl(222 47% 11%);
		font-variant-numeric: tabular-nums;
	}
	.mtr-n.tone-green { color: hsl(142 64% 28%); }
	.mtr-n.tone-ember { color: hsl(22 90% 38%); }
	.mtr-n.tone-muted { color: hsl(215 16% 50%); }
	.mtr-l {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-top: 2px;
	}
</style>
