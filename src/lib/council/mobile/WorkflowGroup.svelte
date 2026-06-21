<!--
  Mobile 1b (2026-05-30): Status-Group im Workflow-Block. Header mit Count,
  Liste von ObjectCards für die rows dieser Gruppe.
-->
<script lang="ts">
	import ObjectCard from './ObjectCard.svelte';
	import StatusPill from './StatusPill.svelte';
	import type { CouncilObjectRow } from '$lib/server/council-db/types.js';
	import type { HauskaufWorkflowRow, HauskaufStatus } from '$lib/server/folio-db/types.js';

	let {
		status,
		rows,
		objects
	}: {
		status: HauskaufStatus;
		rows: HauskaufWorkflowRow[];
		objects: Record<string, CouncilObjectRow | null>;
	} = $props();

	function priceShort(v: number | null): string {
		if (v == null) return '—';
		const m = v / 1_000_000;
		return m >= 1 ? `${m.toFixed(2)} M` : `${(v / 1000).toFixed(0)} k`;
	}

	function extraFor(row: HauskaufWorkflowRow): string | undefined {
		if (status === 'in_arbeit' && row.termin) return `Termin: ${row.termin}`;
		if (status === 'erledigt' && row.verhandlungspreis != null)
			return `VHB ${priceShort(row.verhandlungspreis)}`;
		if (status === 'blockiert' && row.notes) return row.notes;
		return undefined;
	}

	const headerColors: Record<HauskaufStatus, string> = {
		offen: 'var(--st-offen-fg)',
		in_arbeit: 'var(--st-termin-fg)',
		blockiert: 'hsl(0 65% 38%)',
		erledigt: 'var(--st-besichtigt-fg)'
	};
	const labelMap: Record<HauskaufStatus, string> = {
		offen: 'Offen',
		in_arbeit: 'In Arbeit',
		blockiert: 'Blockiert',
		erledigt: 'Erledigt'
	};
</script>

{#if rows.length > 0}
	<div class="group">
		<div class="head" style="color: {headerColors[status]};">
			<span>{labelMap[status]}</span>
			<span class="n">{rows.length}</span>
		</div>
		{#each rows as r (r.id)}
			{@const obj = objects[r.council_object_id]}
			{#if obj}
				<div class="row">
					<ObjectCard
						object={obj}
						photoSize={56}
						href="/council/mobile/{obj.id}"
						extraLine={extraFor(r)}
					/>
					<div class="pill-slot">
						<StatusPill variant={status} label={labelMap[status]} />
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.group {
		margin-bottom: 8px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 2px 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		font-weight: 500;
	}
	.head .n {
		background: var(--wf-fill, hsl(214 24% 94%));
		color: hsl(222 47% 11%);
		padding: 0 6px;
		border-radius: 999px;
		font-size: 9.5px;
	}
	.row {
		position: relative;
	}
	.row :global(.pcard) {
		padding-right: 80px;
	}
	.pill-slot {
		position: absolute;
		top: 9px;
		right: 10px;
	}
</style>
