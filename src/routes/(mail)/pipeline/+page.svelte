<!--
  2026-06-07 UI-Pipeline-Ansicht. Default: Fluss-Tab mit FlowDiagram +
  LiveDetail + CampaignTrack + History. Tweaks-Toggle wechselt zu
  Werkbank-Tab (Master-Detail-Sicht ueber dieselben Run-Daten).
-->
<script lang="ts">
	import type { PageData } from './$types.js';
	import type { StageId } from '$lib/pipeline/types.js';
	import FlowDiagram from '$lib/pipeline/flow/FlowDiagram.svelte';
	import LensProgress from '$lib/pipeline/LensProgress.svelte';
	import LiveDetail from '$lib/pipeline/LiveDetail.svelte';
	import ModelStatusPanel from '$lib/pipeline/ModelStatusPanel.svelte';
	import type { ModelEntry } from '$lib/pipeline/ModelStatusPanel.svelte';
	import type { ModelCardState } from '$lib/pipeline/ModelStatusCard.svelte';
	import CampaignTrack from '$lib/pipeline/CampaignTrack.svelte';
	import PipelineRunList from '$lib/pipeline/history/PipelineRunList.svelte';
	import Workbench from '$lib/pipeline/workbench/Workbench.svelte';
	import TweaksPanel from '$lib/pipeline/TweaksPanel.svelte';
	import type { PipelineView } from '$lib/pipeline/types.js';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { workerRunStore } from '$lib/stores/workerRun.svelte.js';

	let { data }: { data: PageData } = $props();

	// Status-Label fuer die Header-Pille
	const activeMode = $derived(data.activeRun?.mode ?? null);
	const lensRunning = $derived(data.lensStatus?.running ?? false);
	const statusLabel = $derived.by(() => {
		if (activeMode === 'validator') return 'Validator läuft';
		if (activeMode === 'silent' || activeMode === 'learning') return 'Worker läuft';
		if (lensRunning) return 'Council-Lens läuft';
		return 'Stillstand';
	});
	const isIdle = $derived(!activeMode && !lensRunning);

	// Active-Stage abgeleitet aus activeMode/lensRunning (FlowDiagram-Input).
	const activeStage = $derived.by<StageId | null>(() => {
		if (activeMode === 'silent' || activeMode === 'learning') return 'worker';
		if (activeMode === 'validator') return 'valid';
		if (lensRunning) return 'lens';
		return null;
	});

	// 5s-Polling waehrend aktivem Run: invalidateAll triggert Loader-
	// Re-Run, der activeLogs + activeSummary frisch holt. Stoppt
	// automatisch wenn activeRun null wird (effect-Cleanup + Re-Eval).
	$effect(() => {
		if (!browser) return;
		if (!data.activeRun && !data.lensStatus?.running) return;
		const id = setInterval(() => {
			void invalidateAll();
		}, 5000);
		return () => clearInterval(id);
	});

	// View-Toggle: Fluss (default) vs Werkbank. localStorage-persistiert.
	let view = $state<PipelineView>('fluss');
	$effect(() => {
		if (!browser) return;
		const saved = localStorage.getItem('pipeline.view');
		if (saved === 'werkbank' || saved === 'fluss') view = saved;
	});
	function setView(v: PipelineView) {
		view = v;
		if (browser) localStorage.setItem('pipeline.view', v);
	}

	// 2026-06-11 Bauteil Pipeline-Findings (F4): hydrate tranche-size from
	// localStorage on mount (default 30 per directive). Persist on change
	// via the select's onchange handler. Backend accepts tranche_size on
	// /api/worker/run already; store passes it through submit().
	const TRANCHE_PRESETS = [5, 10, 30, 50];
	$effect(() => {
		if (!browser) return;
		const saved = localStorage.getItem('pipeline.lastTrancheSize');
		if (saved !== null) {
			const n = Number(saved);
			if (Number.isFinite(n) && n > 0 && n <= 5000) {
				workerRunStore.trancheSize = n;
				return;
			}
		}
		workerRunStore.trancheSize = 30;
	});
	function setTrancheSize(n: number) {
		if (!Number.isFinite(n) || n <= 0) return;
		workerRunStore.trancheSize = n;
		if (browser) localStorage.setItem('pipeline.lastTrancheSize', String(n));
	}

	// 2026-06-10 Modell-Status-Panel — Build-Variante "Sequenz · Lens-
	// Events · Panel-mit-Progress-Bar". Single Panel switches stack
	// (Validator vs Lens) based on what's running, or — when idle —
	// shows the most-recently-ended stack dimmed with a timestamp.
	const VALIDATOR_VOICE_ID_TO_LOG_VOICE: Record<string, string> = {
		'gemma-control': 'gemma',
		'qwen35b-lens': 'qwen',
		'qwen-validator': 'qwen-thinking'
	};
	const VALIDATOR_ROLE_LABELS: Record<string, string> = {
		'gemma-control': 'gemma · control',
		'qwen35b-lens': 'qwen · plugin-lens',
		'qwen-validator': 'qwen · thinking'
	};

	type PanelStack = 'validator' | 'lens';

	const validatorIsActive = $derived(activeMode === 'validator');
	const lensIsActive = $derived(lensRunning);

	const panelStack = $derived.by<PanelStack>(() => {
		if (data.hideCouncil) return 'validator';
		if (validatorIsActive) return 'validator';
		if (lensIsActive) return 'lens';
		// Idle: pick whichever last run ended most recently.
		const parseTs = (s: string | null | undefined): number => {
			if (!s) return -Infinity;
			const t = Date.parse(s.replace(' ', 'T'));
			return Number.isFinite(t) ? t : -Infinity;
		};
		const vTs = parseTs(data.lastValidatorRun?.ended_at);
		const lTs = parseTs(data.lastLensRun?.ended_at);
		if (lTs > vTs) return 'lens';
		return 'validator';
	});

	const panelActive = $derived(
		(panelStack === 'validator' && validatorIsActive) ||
			(panelStack === 'lens' && lensIsActive)
	);

	const panelLastRunAt = $derived.by<string | null>(() => {
		if (panelActive) return null;
		if (panelStack === 'validator') return data.lastValidatorRun?.ended_at ?? null;
		return data.lastLensRun?.ended_at ?? null;
	});

	const llmVoices = $derived(
		data.regelwerk.voice_consensus.voices.filter((v) => v.role !== 'deterministic')
	);

	const panelModels = $derived.by<ModelEntry[]>(() => {
		if (panelStack === 'validator') {
			const voices = llmVoices;
			const total = voices.length;
			if (validatorIsActive) {
				const logs = data.activeLogs ?? [];
				const counts = new Map<string, number>();
				let lastVoice: string | null = null;
				for (const l of logs) {
					if (l.event_type !== 'validated') continue;
					counts.set(l.voice, (counts.get(l.voice) ?? 0) + 1);
					lastVoice = l.voice;
				}
				return voices.map((v, idx) => {
					const short = VALIDATOR_VOICE_ID_TO_LOG_VOICE[v.id] ?? v.id;
					const n = counts.get(short) ?? 0;
					let state: ModelCardState;
					if (n === 0) state = 'WARTET';
					else if (short === lastVoice) state = 'LÄUFT';
					else state = 'FERTIG';
					return {
						key: v.id,
						roleLabel: VALIDATOR_ROLE_LABELS[v.id] ?? v.id,
						modelId: v.lm_studio_model ?? '—',
						state,
						stepIndex: state === 'LÄUFT' ? idx + 1 : null,
						stepTotal: state === 'LÄUFT' ? total : null
					};
				});
			}
			// Idle Validator
			const counts = data.lastValidatorRun?.voiceCounts ?? {};
			return voices.map((v) => {
				const short = VALIDATOR_VOICE_ID_TO_LOG_VOICE[v.id] ?? v.id;
				const state: ModelCardState =
					(counts[short] ?? 0) > 0 ? 'FERTIG' : 'WARTET';
				return {
					key: v.id,
					roleLabel: VALIDATOR_ROLE_LABELS[v.id] ?? v.id,
					modelId: v.lm_studio_model ?? '—',
					state,
					stepIndex: null,
					stepTotal: null
				};
			});
		}
		// Lens stack
		if (lensIsActive && data.lensStatus?.running && data.lensStatus.progress) {
			const personas = data.lensStatus.progress.personas;
			const total = personas.length;
			return personas.map((p, idx) => {
				let state: ModelCardState;
				if (p.phase === 'pending') state = 'WARTET';
				else if (p.phase === 'done') state = 'FERTIG';
				else state = 'LÄUFT';
				return {
					key: p.id,
					roleLabel: `lens · ${p.id.replace(/^lens-/, '')}`,
					modelId: p.model,
					state,
					stepIndex: state === 'LÄUFT' ? idx + 1 : null,
					stepTotal: state === 'LÄUFT' ? total : null
				};
			});
		}
		// Idle Lens
		const states = data.lastLensRun?.personaStates ?? {};
		const metaById = new Map(data.personas.map((p) => [p.id, p]));
		// Use personas.yaml order (canonical) when meta is available;
		// fall back to whatever the log contained.
		const ordered = data.personas.length > 0
			? data.personas.map((p) => p.id)
			: Object.keys(states);
		return ordered.map((id) => {
			const meta = metaById.get(id);
			const s = states[id];
			const state: ModelCardState = s === 'completed' ? 'FERTIG' : 'WARTET';
			return {
				key: id,
				roleLabel: `lens · ${id.replace(/^lens-/, '')}`,
				modelId: meta?.lm_studio_model ?? '—',
				state,
				stepIndex: null,
				stepTotal: null
			};
		});
	});

	const panelProgress = $derived.by(() => {
		if (!panelActive) return null;
		if (panelStack === 'validator' && data.activeRun) {
			// 2026-06-11 Bar-Semantik Variante A: count log rows (mail × voice
			// combos), not distinct mail_ids. Distinct mail_ids saturate at
			// tranche_size after the first voice — voices 2+3 don't add new
			// mail_ids, so the bar would stand still. Counting rows + total =
			// tranche_size × 3 (gemma + qwen + qwen-thinking) tracks the full
			// stack. Unit „Stimmen" matches LiveDetail.progressUnit convention
			// in validator-mode. Manual validator runs (scope unreviewed/all)
			// land with tranche_size=0; fallback to done so bar shows 100%
			// rather than div-by-zero.
			const logs = data.activeLogs ?? [];
			const done = logs.filter((l) => l.event_type === 'validated').length;
			const tSize = data.activeRun.tranche_size;
			const total = tSize > 0 ? tSize * 3 : done;
			return {
				done,
				total,
				unit: 'Stimmen',
				eta: null
			};
		}
		if (panelStack === 'lens' && data.lensStatus?.running && data.lensStatus.progress) {
			// 2026-06-11 F1 (Lens): the lens-runner log-parser only fills
			// LensPersonaStatus.scored at persona-done. Use the robust
			// per-persona phase signal instead — done = personas that have
			// finished evaluating; total = total personas in the stack.
			const personas = data.lensStatus.progress.personas;
			const done = personas.filter((p) => p.phase === 'done').length;
			const total = personas.length;
			return {
				done,
				total,
				unit: 'Personas',
				eta:
					data.lensStatus.progress.eta_seconds != null && data.lensStatus.progress.eta_seconds > 0
						? `${Math.round(data.lensStatus.progress.eta_seconds / 60)}m`
						: null
			};
		}
		return null;
	});

	// Summary aus juengstem Run mit summary (fuer Counts in idle-Sicht).
	const latestSummary = $derived.by(() => {
		const withSum = data.pipelineRuns.find((r) => r.summary != null);
		// PipelineRunRow.summary kann WorkerRunSummaryRow oder
		// CouncilRunSummaryRow sein — FlowDiagram braucht den mail-side
		// Type. Wenn juengster Run council-side ist: nimm den juengsten
		// mail-side Run separat.
		if (withSum && withSum.source === 'mail') return withSum.summary as any;
		const mailWithSum = data.pipelineRuns.find(
			(r) => r.source === 'mail' && r.summary != null
		);
		return (mailWithSum?.summary as any) ?? null;
	});
</script>

<svelte:head>
	<title>Folio · Pipeline</title>
</svelte:head>

<div class="pl-page">
	<header class="pl-head">
		<div class="pl-head-text">
			<h1>Pipeline</h1>
			<p class="pl-sub">
				Mail-Klassifikation{#if !data.hideCouncil} und Council-Bewertung{/if}. Sequenziell — ein Run gleichzeitig
				(geteilte LLMs).
			</p>
		</div>
		<div class="pl-statuspill" class:idle={isIdle}>
			<span class="dot" class:idle={isIdle}></span>
			<span class="label">{statusLabel}</span>
		</div>
	</header>

	<!-- Config-Bar: Account + Tranche-Picker + „Jetzt prüfen" via existing workerRunStore -->
	<div class="config">
		<span class="ck">ACCOUNT</span>
		<select class="sel" aria-label="Account" bind:value={workerRunStore.account}>
			<option value="yahoo">Yahoo</option>
			<option value="gmail">Gmail</option>
			<option value="mirhamed">mirhamed</option>
		</select>
		<span class="ck">TRANCHE</span>
		<select
			class="sel"
			aria-label="Tranche-Größe"
			value={workerRunStore.trancheSize}
			onchange={(e) => setTrancheSize(Number((e.currentTarget as HTMLSelectElement).value))}
		>
			{#each TRANCHE_PRESETS as n}
				<option value={n}>{n}</option>
			{/each}
		</select>
		<span class="ck-hint">silent · tranche {workerRunStore.trancheSize}</span>
		<button
			type="button"
			class="dark-btn"
			disabled={workerRunStore.submitting || !!data.activeRun}
			onclick={() => {
				workerRunStore.mode = 'silent';
				void workerRunStore.submit();
			}}
		>
			{workerRunStore.submitting ? 'Starte …' : '▷ Jetzt prüfen'}
		</button>
		{#if workerRunStore.error}
			<span class="err">{workerRunStore.error}</span>
		{/if}
	</div>

	{#if view === 'fluss'}
		<!-- Datenfluss-Diagramm: 2 Lanes (Mail + Council) + Handoff -->
		<div class="eyebrow">
			<span>DATENFLUSS{!isIdle ? ' · LIVE' : ''}</span>
		</div>
		<FlowDiagram {activeStage} summary={latestSummary} hideCouncil={data.hideCouncil} />

		<!-- Modell-Status-Panel: permanent sichtbar; live waehrend
		     Validator/Lens-Lauf, dimmed danach mit Timestamp. -->
		<ModelStatusPanel
			models={panelModels}
			stack={panelStack}
			active={panelActive}
			progress={panelProgress}
			lastRunAt={panelLastRunAt}
		/>

		<!-- Lens-Fortschritts-Pille — nur sichtbar wenn lens-run aktiv (Council) -->
		{#if data.lensStatus?.running && !data.hideCouncil}
			<LensProgress status={data.lensStatus} />
		{/if}

		<!-- Live-Detail (nur wenn aktiv) -->
		{#if data.activeRun}
			<LiveDetail
				activeRun={data.activeRun}
				summary={data.activeSummary}
				logs={data.activeLogs ?? []}
			/>
		{/if}

		<!-- Übergang → Kampagne: permanent sichtbarer Kampagnen-Track (Council) -->
		{#if !data.hideCouncil}
			<div class="eyebrow">
				<span>ÜBERGANG → KAMPAGNE</span>
				<span class="stamp">mensch-getrieben · Wochen-Skala</span>
			</div>
			<CampaignTrack workflows={data.workflows} />
		{/if}

		<!-- Verlauf: Tagesgruppierung + Lauf-Spur-Aufklappung.
		     hideCouncil → nur mail-side Runs (Council-Lens/-Ingest raus). -->
		<div class="eyebrow">
			<span>VERLAUF</span>
		</div>
		<PipelineRunList
			runs={data.hideCouncil
				? data.pipelineRuns.filter((r) => r.source === 'mail')
				: data.pipelineRuns}
		/>
	{:else}
		<!-- Werkbank: alternative Master-Detail-Sicht -->
		<div class="eyebrow">
			<span>WERKBANK</span>
		</div>
		<Workbench runs={data.pipelineRuns} />
	{/if}
</div>

<TweaksPanel {view} onChange={setView} />

<style>
	.pl-page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 30px 26px 120px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.pl-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.pl-head-text h1 {
		margin: 0 0 4px;
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: hsl(222 47% 11%);
	}
	.pl-sub {
		margin: 0;
		font-size: 14px;
		color: hsl(215 16% 47%);
	}

	.pl-statuspill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border: 1px solid hsl(142 50% 80%);
		border-radius: 999px;
		background: hsl(138 60% 96%);
		color: hsl(142 64% 36%);
		font-size: 12.5px;
		font-weight: 500;
		flex-shrink: 0;
	}
	.pl-statuspill.idle {
		border-color: hsl(28 60% 80%);
		background: hsl(28 95% 97%);
		color: hsl(22 90% 48%);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: hsl(142 64% 42%);
		animation: pulse 1.6s ease-in-out infinite;
	}
	.dot.idle {
		background: hsl(22 95% 52%);
		animation: none;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.88); }
	}

	.config {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 14px 16px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ck {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.ck-hint {
		font-size: 12px;
		color: hsl(215 16% 47%);
		margin-left: auto;
	}
	.sel {
		border: 1px solid hsl(214 25% 90%);
		border-radius: 8px;
		padding: 5px 10px;
		font-size: 13px;
		background: hsl(210 30% 99%);
		font-family: inherit;
	}
	.dark-btn {
		background: hsl(222 47% 11%);
		color: white;
		border: 0;
		border-radius: 9px;
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
	}
	.dark-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		margin-left: 8px;
		font-size: 12px;
		color: hsl(0 65% 38%);
	}

	.eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-top: 6px;
	}
	.stamp {
		font-size: 10.5px;
		color: hsl(215 16% 47%);
		font-weight: 400;
	}

	.flow2-placeholder,
	.kampagne-placeholder,
	.history-placeholder {
		background: white;
		border: 1px dashed hsl(214 25% 88%);
		border-radius: 12px;
		padding: 30px 20px;
		text-align: center;
	}
	.ph-text {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 12px;
		color: hsl(215 16% 47%);
	}
</style>
