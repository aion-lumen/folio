<!--
  2026-06-07 RunDetail: aufgeklappter Inhalt eines Verlauf-Eintrags.
  Lazy-Load via /api/pipeline/runs/[uuid]. Inhalt:
    - Stationen-Pillen (welche stages haben gefeuert — aus event_types
      der logs abgeleitet)
    - Auswertung (4 grosse Zahlen aus summary)
    - BlockBreakdown (Reason-Balken aus summary.reason_breakdown JSON)
    - Worker-Imports-Sample (max 10-20 Mails aus summary.worker_imports_sample)
-->
<script lang="ts">
	import type {
		PipelineRunRow,
		WorkerRunLogRow,
		WorkerRunSummaryRow,
		CouncilRunLogRow,
		CouncilRunSummaryRow
	} from '$lib/server/folio-db/types.js';
	import Auswertung from './Auswertung.svelte';
	import BlockBreakdown from './BlockBreakdown.svelte';
	import ImportRow from './ImportRow.svelte';

	let { uuid }: { uuid: string } = $props();

	type DetailResponse = {
		row: PipelineRunRow | null;
		logs: Array<WorkerRunLogRow | CouncilRunLogRow>;
	};

	let detail = $state<DetailResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		loading = true;
		error = null;
		fetch(`/api/pipeline/runs/${uuid}`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: DetailResponse) => {
				detail = data;
			})
			.catch((e: Error) => {
				error = e.message;
			})
			.finally(() => {
				loading = false;
			});
	});

	// Stations-Pillen aus event_types in logs.
	const stations = $derived.by(() => {
		if (!detail) return [];
		const seen = new Map<string, number>();
		for (const log of detail.logs) {
			const v = log.voice;
			seen.set(v, (seen.get(v) ?? 0) + 1);
		}
		return Array.from(seen.entries()).map(([voice, count]) => ({ voice, count }));
	});

	// Sample-Mails aus summary.worker_imports_sample (mail-side only).
	type Sample = { id?: number; subject?: string; sender?: string; tag?: string };
	const samples = $derived.by<Sample[]>(() => {
		if (!detail?.row?.summary || detail.row.source !== 'mail') return [];
		const summ = detail.row.summary as WorkerRunSummaryRow;
		if (!summ.worker_imports_sample) return [];
		try {
			const arr = JSON.parse(summ.worker_imports_sample);
			return Array.isArray(arr) ? arr : [];
		} catch {
			return [];
		}
	});

	const reasonsJson = $derived.by(() => {
		if (!detail?.row?.summary) return null;
		const summ = detail.row.summary as WorkerRunSummaryRow | CouncilRunSummaryRow;
		return summ.reason_breakdown ?? null;
	});
</script>

<div class="rundetail">
	{#if loading}
		<div class="ld-status">lade Lauf-Spur …</div>
	{:else if error}
		<div class="ld-status ld-error">Fehler: {error}</div>
	{:else if !detail || !detail.row}
		<div class="ld-status">keine Substanz fuer diesen Run</div>
	{:else}
		<div class="imp-head">Lauf-Spur · welche Stationen gefeuert haben</div>
		{#if stations.length === 0}
			<div class="ld-status">keine Log-Zeilen</div>
		{:else}
			<div class="stations">
				{#each stations as st}
					<span class="tag-station">{st.voice} · {st.count}</span>
				{/each}
			</div>
		{/if}

		{#if detail.row.summary}
			<Auswertung summary={detail.row.summary} source={detail.row.source} />
			<BlockBreakdown {reasonsJson} />
		{/if}

		{#if samples.length > 0}
			<div class="imp-head" style="margin-top: 14px">
				Worker-Imports
				<span class="ct">{samples.length}</span>
			</div>
			<div class="imports">
				{#each samples as s}
					<ImportRow sample={s} />
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.rundetail {
		padding: 12px 20px 16px 40px;
		background: hsl(214 28% 98%);
		border-top: 1px solid hsl(214 30% 94%);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ld-status {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(215 16% 50%);
		padding: 6px 0;
	}
	.ld-error { color: hsl(0 65% 38%); }
	.imp-head {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.ct {
		display: inline-block;
		margin-left: 6px;
		font-size: 10px;
		background: hsl(220 35% 85%);
		color: hsl(222 47% 25%);
		padding: 1px 6px;
		border-radius: 999px;
	}
	.stations {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag-station {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		padding: 3px 8px;
		background: white;
		border: 1px solid hsl(214 25% 88%);
		border-radius: 4px;
		color: hsl(215 16% 30%);
	}
	.imports {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 8px;
		padding: 4px 12px;
	}
</style>
