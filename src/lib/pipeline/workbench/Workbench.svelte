<!--
  2026-06-07 Werkbank: alternative Sicht auf dieselben Run-Daten.
  Master-Detail-Split: links Run-Liste kompakt, rechts ausgewählter
  Run mit Voice-Cards + Progress + LiveLog.

  Reuse von LiveLog/Progress aus src/lib/pipeline/live/. Voice-Cards
  lokal (gemma/qwen/qwen-thinking mit Status FERTIG/LÄUFT/WARTET).
-->
<script lang="ts">
	import type {
		PipelineRunRow,
		WorkerRunLogRow,
		CouncilRunLogRow
	} from '$lib/server/folio-db/types.js';
	import Progress from '../live/Progress.svelte';
	import LiveLog from '../live/LiveLog.svelte';

	let { runs }: { runs: PipelineRunRow[] } = $props();

	// Default: juengster mail-validator-Run (zeigt alle 3 Voices).
	let selectedUuid = $state<string | null>(null);
	$effect(() => {
		if (selectedUuid !== null) return;
		const candidate = runs.find((r) => r.source === 'mail' && r.run_type === 'validator')
			|| runs.find((r) => r.source === 'mail')
			|| runs[0];
		if (candidate) selectedUuid = candidate.run_uuid;
	});

	type DetailResponse = {
		row: PipelineRunRow | null;
		logs: Array<WorkerRunLogRow | CouncilRunLogRow>;
	};

	let detail = $state<DetailResponse | null>(null);
	let loading = $state(false);

	$effect(() => {
		if (!selectedUuid) return;
		loading = true;
		fetch(`/api/pipeline/runs/${selectedUuid}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d: DetailResponse | null) => {
				detail = d;
			})
			.finally(() => {
				loading = false;
			});
	});

	// Voice-Cards: 3 LLM-Voices fuer validator-runs, aus logs abgeleitet.
	type VoiceState = { id: string; label: string; status: 'fertig' | 'laeuft' | 'wartet'; count: number };
	const voices = $derived.by<VoiceState[]>(() => {
		if (!detail?.logs) return [];
		const counts = new Map<string, number>();
		for (const l of detail.logs) {
			if (l.event_type === 'validated') {
				counts.set(l.voice, (counts.get(l.voice) ?? 0) + 1);
			}
		}
		const order = [
			{ id: 'gemma', label: 'gemma · control' },
			{ id: 'qwen', label: 'qwen · plugin-lens' },
			{ id: 'qwen-thinking', label: 'qwen · thinking' }
		];
		const total = detail.row?.source === 'mail'
			? (detail.row?.n_processed ?? 0)
			: 0;
		return order.map((v) => {
			const c = counts.get(v.id) ?? 0;
			let status: VoiceState['status'] = 'wartet';
			if (c === total && total > 0) status = 'fertig';
			else if (c > 0) status = 'laeuft';
			return { ...v, status, count: c };
		});
	});

	const isMailValidator = $derived(
		detail?.row?.source === 'mail' && detail?.row?.run_type === 'validator'
	);
	const isRunning = $derived(detail?.row?.status === 'running');

	const recentLogs = $derived(detail?.logs ? detail.logs.slice(-5) : []);

	function fmtTime(iso: string): string {
		try {
			const d = new Date(iso.replace(' ', 'T'));
			return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso.slice(-8);
		}
	}
</script>

<div class="workbench">
	<div class="run-pane">
		<div class="rp-head">RUNS</div>
		<div class="rp-list">
			{#each runs as r (r.run_uuid)}
				<button
					type="button"
					class="rp-item"
					class:active={selectedUuid === r.run_uuid}
					onclick={() => (selectedUuid = r.run_uuid)}
				>
					<span class="rp-time">{fmtTime(r.started_at)}</span>
					<span class="rp-type rp-{r.source}">{r.run_type}</span>
					<span class="rp-n">{r.n_processed}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="detail-pane">
		{#if loading}
			<div class="dp-status">lade Run-Detail …</div>
		{:else if !detail?.row}
			<div class="dp-status">kein Run ausgewählt</div>
		{:else}
			<div class="dp-head">
				<h3>{detail.row.run_type} · {detail.row.run_uuid.slice(0, 8)}</h3>
				<span class="dp-status-label">{isRunning ? 'läuft' : detail.row.status}</span>
			</div>

			{#if isMailValidator}
				<div class="voices">
					{#each voices as v}
						<div class="voice" class:v-fertig={v.status === 'fertig'} class:v-laeuft={v.status === 'laeuft'} class:v-wartet={v.status === 'wartet'}>
							<div class="v-label">{v.label}</div>
							<div class="v-status">
								<span class="v-dot" aria-hidden="true"></span>
								{v.status === 'fertig' ? 'FERTIG' : v.status === 'laeuft' ? 'LÄUFT' : 'WARTET'}
							</div>
							<div class="v-count">{v.count} Stimmen</div>
						</div>
					{/each}
				</div>
			{/if}

			<div class="dp-progress">
				<Progress
					done={detail.row.n_processed ?? 0}
					total={detail.row.source === 'mail' ? Math.max(detail.row.n_processed, 30) : detail.row.n_processed}
					unit={isMailValidator ? 'Mails' : detail.row.source === 'council' ? 'Objekte' : 'Mails'}
				/>
			</div>

			<div class="dp-log-head">Letzte 5 Log-Zeilen</div>
			<LiveLog lines={recentLogs} />
		{/if}
	</div>
</div>

<style>
	.workbench {
		display: grid;
		grid-template-columns: 35% 1fr;
		gap: 14px;
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 14px;
		min-height: 360px;
	}
	.run-pane {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-right: 1px solid hsl(214 30% 94%);
		padding-right: 12px;
	}
	.rp-head {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.rp-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 400px;
		overflow-y: auto;
	}
	.rp-item {
		display: grid;
		grid-template-columns: 56px 1fr auto;
		gap: 8px;
		align-items: center;
		padding: 7px 10px;
		background: transparent;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}
	.rp-item:hover {
		background: hsl(214 28% 96%);
	}
	.rp-item.active {
		background: hsl(217 70% 95%);
	}
	.rp-time {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(215 16% 50%);
	}
	.rp-type {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: lowercase;
		background: hsl(214 28% 95%);
		color: hsl(215 16% 35%);
	}
	.rp-mail   { background: hsl(214 70% 95%); color: hsl(217 80% 32%); }
	.rp-council { background: hsl(28 95% 95%); color: hsl(22 90% 32%); }
	.rp-n {
		font-variant-numeric: tabular-nums;
		font-size: 11.5px;
		color: hsl(222 47% 25%);
	}

	.detail-pane {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-left: 4px;
	}
	.dp-status {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 12px;
		color: hsl(215 16% 50%);
	}
	.dp-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.dp-head h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		font-family: ui-monospace, SF Mono, monospace;
	}
	.dp-status-label {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(215 16% 50%);
	}

	.voices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.voice {
		padding: 10px;
		background: hsl(214 28% 97%);
		border: 1px solid hsl(214 25% 90%);
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.v-label {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		color: hsl(215 16% 47%);
	}
	.v-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		font-weight: 500;
	}
	.v-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: hsl(215 16% 60%);
	}
	.voice.v-fertig .v-status { color: hsl(142 64% 32%); }
	.voice.v-fertig .v-dot { background: hsl(142 64% 42%); }
	.voice.v-laeuft .v-status { color: hsl(217 80% 32%); }
	.voice.v-laeuft .v-dot {
		background: hsl(217 80% 52%);
		animation: pulse 1.6s ease-in-out infinite;
	}
	.voice.v-wartet .v-status { color: hsl(215 16% 55%); }
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	.v-count {
		font-variant-numeric: tabular-nums;
		font-size: 13px;
		color: hsl(222 47% 11%);
		font-weight: 500;
	}
	.dp-log-head {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
</style>
