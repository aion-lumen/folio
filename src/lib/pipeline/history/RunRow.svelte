<!--
  2026-06-07 RunRow: eine Zeile in der Verlauf-Liste. Klick toggelt
  RunDetail (lazy-load on first toggle).
-->
<script lang="ts">
	import type { PipelineRunRow } from '$lib/server/folio-db/types.js';
	import RunDetail from './RunDetail.svelte';

	let {
		run,
		open = false,
		nested = false,
		onToggle
	}: {
		run: PipelineRunRow;
		open?: boolean;
		nested?: boolean;
		onToggle: () => void;
	} = $props();

	const isRunning = $derived(run.status === 'running');

	function fmtTime(iso: string): string {
		try {
			const d = new Date(iso.replace(' ', 'T'));
			return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso.slice(-8);
		}
	}

	function fmtDuration(start: string, end: string | null): string {
		if (!end) return '—';
		try {
			const s = new Date(start.replace(' ', 'T')).getTime();
			const e = new Date(end.replace(' ', 'T')).getTime();
			const secs = Math.max(0, Math.round((e - s) / 1000));
			if (secs < 60) return `${secs}s`;
			const m = Math.floor(secs / 60);
			return `${m}m${secs % 60 > 0 ? ` ${secs % 60}s` : ''}`;
		} catch {
			return '—';
		}
	}

	const runTypeLabel = $derived.by(() => {
		if (run.source === 'mail') {
			if (run.run_type === 'silent') return 'Worker';
			if (run.run_type === 'validator') return 'Validator';
			if (run.run_type === 'learning') return 'Worker (learning)';
			return run.run_type;
		}
		if (run.run_type === 'council-ingest') return 'Council-Ingest';
		if (run.run_type === 'council-lens') return 'Council-Lens';
		return run.run_type;
	});

	const runTypeTone = $derived.by(() => {
		if (run.source === 'council') return 'ember';
		if (run.run_type === 'silent') return 'slate';
		if (run.run_type === 'validator') return 'blue';
		if (run.run_type === 'auto') return 'green';
		return 'slate';
	});

	const unit = $derived(run.source === 'council' && run.run_type === 'council-lens' ? 'objekte' : 'mails');

	const canExpand = $derived(!isRunning && run.summary !== null);
</script>

<div class="runrow" class:open class:nested onclick={canExpand ? onToggle : undefined} role={canExpand ? 'button' : undefined} tabindex={canExpand ? 0 : undefined} onkeydown={(e) => { if (canExpand && (e.key === 'Enter' || e.key === ' ')) onToggle(); }}>
	<span class="glyph">
		{#if isRunning}
			<span class="dot-run" aria-hidden="true"></span>
		{:else}
			<span class="check">✓</span>
		{/if}
	</span>
	<span class="time">{fmtTime(run.started_at)}</span>
	<span class="rt rt-{runTypeTone}">{runTypeLabel}</span>
	<span class="mid">
		{#if isRunning}
			läuft …
		{:else}
			{run.n_processed} {unit}
		{/if}
	</span>
	<span class="end">
		{#if canExpand}
			<span class="expand">{open ? 'schließen' : 'Lauf-Spur ›'}</span>
		{:else}
			{#if !isRunning}
				<span class="dur">{fmtDuration(run.started_at, run.ended_at)}</span>
			{/if}
		{/if}
	</span>
</div>
{#if open && canExpand}
	<RunDetail uuid={run.run_uuid} />
{/if}

<style>
	.runrow {
		display: grid;
		grid-template-columns: 30px 56px auto 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 10px 20px;
		border-bottom: 1px solid hsl(214 30% 94%);
		font-size: 13px;
	}
	.runrow.nested {
		padding-left: 44px;
		background: hsl(214 40% 98%);
	}
	.runrow.nested .rt::before {
		content: '↳ ';
		opacity: 0.55;
	}
	.runrow[role='button'] {
		cursor: pointer;
	}
	.runrow[role='button']:hover {
		background: hsl(214 28% 97%);
	}
	.runrow.open {
		background: hsl(214 28% 97%);
	}
	.glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: hsl(142 45% 95%);
		color: hsl(142 64% 36%);
	}
	.check {
		font-size: 13px;
		font-weight: 600;
	}
	.dot-run {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: hsl(217 80% 52%);
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.85); }
	}
	.time {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 12px;
		color: hsl(215 16% 50%);
	}
	.rt {
		display: inline-flex;
		align-items: center;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		padding: 2px 7px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: hsl(214 28% 95%);
		color: hsl(215 16% 35%);
	}
	.rt-blue   { background: hsl(214 70% 95%); color: hsl(217 80% 32%); }
	.rt-green  { background: hsl(142 45% 95%); color: hsl(142 64% 28%); }
	.rt-ember  { background: hsl(28 95% 95%); color: hsl(22 90% 32%); }
	.rt-slate  { background: hsl(214 28% 95%); color: hsl(215 16% 35%); }
	.mid {
		color: hsl(222 47% 25%);
	}
	.end { text-align: right; }
	.dur {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 12px;
		color: hsl(215 16% 50%);
	}
	.expand {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11.5px;
		color: hsl(217 70% 38%);
	}
</style>
