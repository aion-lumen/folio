<!--
  2026-06-07 PipelineRunList: Tagesgruppierung der Pipeline-Runs.
  Heute / Gestern / Älter.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { PipelineRunRow } from '$lib/server/folio-db/types.js';
	import RunRow from './RunRow.svelte';

	let { runs }: { runs: PipelineRunRow[] } = $props();

	// Default: juengster non-running Run mit summary einmalig aufgeklappt.
	// untrack() macht explizit: nur initial-Wert lesen, kein Re-Fire bei
	// Polling-Updates (Polling wuerde sonst openUuid resetten und das vom
	// User geschlossene Detail sofort wieder auf-klappen).
	const defaultOpen = untrack(() =>
		runs.find((r) => r.status !== 'running' && r.summary !== null)
	);
	let openUuid = $state<string | null>(defaultOpen?.run_uuid ?? null);

	type DayKey = 'heute' | 'gestern' | 'aelter';
	function dayKey(iso: string): DayKey {
		try {
			const d = new Date(iso.replace(' ', 'T'));
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const yesterday = new Date(today.getTime() - 86400_000);
			if (d >= today) return 'heute';
			if (d >= yesterday) return 'gestern';
			return 'aelter';
		} catch {
			return 'aelter';
		}
	}

	const grouped = $derived.by(() => {
		const out: Record<DayKey, PipelineRunRow[]> = { heute: [], gestern: [], aelter: [] };
		for (const r of runs) out[dayKey(r.started_at)].push(r);
		return out;
	});

	const dayLabels: { key: DayKey; label: string }[] = [
		{ key: 'heute', label: 'Heute' },
		{ key: 'gestern', label: 'Gestern' },
		{ key: 'aelter', label: 'Älter' }
	];
</script>

<div class="run-list">
	{#if runs.length === 0}
		<div class="empty">Noch keine Pipeline-Runs.</div>
	{:else}
		{#each dayLabels as day (day.key)}
			{@const rows = grouped[day.key]}
			{#if rows.length > 0}
				<div class="day">
					<div class="day-head">
						<span>{day.label}</span>
						<span class="n">{rows.length}</span>
					</div>
					{#each rows as r (r.run_uuid)}
						<RunRow
							run={r}
							open={openUuid === r.run_uuid}
							onToggle={() => (openUuid = openUuid === r.run_uuid ? null : r.run_uuid)}
						/>
						{#if r.children?.length}
							{#each r.children as child (child.run_uuid)}
								<RunRow
									run={child}
									nested
									open={openUuid === child.run_uuid}
									onToggle={() =>
										(openUuid = openUuid === child.run_uuid ? null : child.run_uuid)}
								/>
							{/each}
						{/if}
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.run-list {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}
	.day:not(:first-child) {
		border-top: 1px solid hsl(214 30% 94%);
	}
	.day-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: hsl(214 28% 96%);
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		font-weight: 500;
	}
	.day-head .n {
		background: hsl(220 35% 85%);
		color: hsl(222 47% 25%);
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 999px;
	}
	.empty {
		padding: 24px 20px;
		text-align: center;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 12px;
		color: hsl(215 16% 50%);
		font-style: italic;
	}
</style>
