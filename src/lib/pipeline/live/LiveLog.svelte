<!--
  2026-06-07 LiveLog: letzte 5 Zeilen aus worker_run_logs als dunkler
  Mono-Block. Color-coded: classified=neutral, promoted=grün, object=
  ember, no_consensus=rot, info=weiß.
-->
<script lang="ts">
	import type { WorkerRunLogRow } from '$lib/server/folio-db/types.js';

	let {
		lines = [],
		max = 5
	}: { lines?: WorkerRunLogRow[]; max?: number } = $props();

	const shown = $derived(lines.slice(-max).reverse());

	function colorClass(event_type: string): string {
		if (event_type === 'promoted') return 'log-green';
		if (event_type === 'object' || event_type === 'ingested') return 'log-ember';
		if (event_type === 'no_consensus' || event_type === 'all_failed') return 'log-red';
		return 'log-neutral';
	}

	function fmtTs(iso: string | undefined): string {
		if (!iso) return '';
		try {
			const d = new Date(iso.replace(' ', 'T'));
			return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return iso.slice(-8);
		}
	}
</script>

<div class="log">
	{#if shown.length === 0}
		<div class="empty">noch keine Log-Zeilen</div>
	{:else}
		{#each shown as ln (ln.id)}
			<div class="logline {colorClass(ln.event_type)}">
				<span class="t">{fmtTs(ln.recorded_at)}</span>
				<span class="v">{ln.voice}</span>
				<span class="msg">{ln.message ?? ''}</span>
			</div>
		{/each}
	{/if}
</div>

<style>
	.log {
		background: hsl(222 30% 12%);
		border-radius: 8px;
		padding: 10px 12px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		line-height: 1.55;
		color: hsl(210 40% 90%);
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 140px;
		overflow-y: auto;
	}
	.empty {
		color: hsl(215 16% 55%);
		font-style: italic;
		text-align: center;
		padding: 8px 0;
	}
	.logline {
		display: flex;
		gap: 8px;
	}
	.t {
		color: hsl(215 16% 55%);
		flex-shrink: 0;
	}
	.v {
		color: hsl(214 70% 70%);
		flex-shrink: 0;
		min-width: 60px;
	}
	.msg { flex: 1; min-width: 0; }
	.log-green .msg { color: hsl(142 60% 70%); }
	.log-ember .msg { color: hsl(28 90% 65%); }
	.log-red   .msg { color: hsl(0 70% 70%); }
</style>
