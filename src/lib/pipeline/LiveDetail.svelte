<!--
  2026-06-07 LiveDetail: 2-Spalten-Grid waehrend aktivem Run.
  Links: Run-Meta + Progress + CurItem + LiveLog.
  Rechts: 'Diese Runde erzeugt'-Header + TallyChips.

  Logs kommen heute aus dem +page.svelte (5s-Polling-Loader liefert sie).
  A9 erweitert das auf SSE-Subscribe.
-->
<script lang="ts">
	import type { WorkerRunRow, WorkerRunSummaryRow, WorkerRunLogRow } from '$lib/server/folio-db/types.js';
	import type { TallyChip } from './types.js';
	import Progress from './live/Progress.svelte';
	import CurItem from './live/CurItem.svelte';
	import LiveLog from './live/LiveLog.svelte';
	import TallyChips from './live/TallyChips.svelte';

	let {
		activeRun,
		summary,
		logs = []
	}: {
		activeRun: WorkerRunRow;
		summary: WorkerRunSummaryRow | null;
		logs?: WorkerRunLogRow[];
	} = $props();

	const stationLabel = $derived(activeRun.mode === 'validator' ? 'Validator' : 'Worker');

	// 2026-06-11 Bauteil Pipeline-Findings (F1): activeRun.mails_processed
	// is only persisted at run-end (no live update), which made the bar sit
	// at 0 for the entire silent-worker lifetime. Count log rows instead —
	// production_worker writes one `heuristik|classified` row per mail,
	// validator_batch writes one `gemma/qwen/qwen-thinking|validated` row
	// per mail. Pure log-derived progress is live by construction.
	const progressDone = $derived.by(() => {
		if (activeRun.mode === 'validator') {
			return logs.filter((l) => l.event_type === 'validated').length;
		}
		return logs.filter(
			(l) => l.voice === 'heuristik' && l.event_type === 'classified'
		).length;
	});
	const progressTotal = $derived.by(() => {
		if (activeRun.mode === 'validator') {
			// 2026-06-11 Pipeline-Findings: auto-validator runs land in DB
			// with tranche_size=0 (backend doesn't inherit from preceding
			// worker). Fallback to live done-count so the bar shows X/X
			// instead of X/0. Standalone validator runs keep their picker
			// value and hit the t>0 branch.
			const t = activeRun.tranche_size;
			return t > 0 ? t * 3 : progressDone;
		}
		return activeRun.tranche_size;
	});
	const progressUnit = $derived(activeRun.mode === 'validator' ? 'Stimmen' : 'Mails');

	// CurItem aus juengstem Log mit message.
	const currentLog = $derived(logs.length > 0 ? logs[logs.length - 1] : null);
	const curPrimary = $derived(currentLog?.message ?? 'läuft …');
	const curSecondary = $derived.by(() => {
		if (!currentLog) return null;
		const parts: string[] = [];
		if (currentLog.mail_id) parts.push(`#${currentLog.mail_id}`);
		if (currentLog.voice) parts.push(currentLog.voice);
		return parts.length > 0 ? parts.join(' · ') : null;
	});

	// Elapsed seit Run-Start (live-berechnet via $derived auf Date.now).
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});
	const elapsed = $derived.by(() => {
		const start = Date.parse(activeRun.started_at);
		if (!Number.isFinite(start)) return '—';
		const secs = Math.floor((now - start) / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		return `${mins}m ${secs % 60}s`;
	});

	// TallyChips aus summary.
	const chips = $derived.by<TallyChip[]>(() => {
		if (!summary) return [];
		return [
			{ n: summary.uebernommen ?? 0, label: 'Übernommen', tone: 'green' },
			{ n: summary.actionable ?? 0, label: 'Actionable', tone: 'blue' },
			{ n: summary.archive_silent ?? 0, label: 'Stumm', tone: 'slate' },
			{ n: summary.council_objects ?? 0, label: 'Council-Objekt', tone: 'ember' },
			{ n: summary.marker_count ?? 0, label: 'Marker', tone: 'ember' }
		];
	});
</script>

<div class="live-grid">
	<div class="live-card">
		<div class="runmeta">
			<span>aktive Station <b>{stationLabel}</b></span>
			<span>läuft seit <b>{elapsed}</b></span>
		</div>
		{#if activeRun.mode !== 'validator'}
			<!-- Validator-Progress lebt im ModelStatusPanel (render once). -->
			<Progress done={progressDone} total={progressTotal} unit={progressUnit} />
		{/if}
		<CurItem primary={curPrimary} secondary={curSecondary} />
		<LiveLog lines={logs} />
	</div>

	<div class="tally-col">
		<div class="imp-head">Diese Runde erzeugt</div>
		<TallyChips {chips} />
	</div>
</div>

<style>
	.live-grid {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 18px;
		align-items: start;
	}
	.live-card {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}
	.runmeta {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		font-size: 12px;
		color: hsl(215 16% 50%);
	}
	.runmeta b {
		color: hsl(222 47% 11%);
		font-weight: 600;
	}
	.imp-head {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-bottom: 8px;
	}
	.tally-col {
		padding-top: 2px;
	}

	@media (max-width: 900px) {
		.live-grid { grid-template-columns: 1fr; }
	}
</style>
