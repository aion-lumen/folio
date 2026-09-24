<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { ArrowLeft, Check, FlaskConical, LoaderCircle } from 'lucide-svelte';
	import type { PageData } from './$types.js';
	import ModelStatusPanel from '$lib/pipeline/ModelStatusPanel.svelte';
	import type { ModelCardState } from '$lib/pipeline/ModelStatusCard.svelte';
	import type {
		ModelEvalPrediction,
		ModelEvalResult,
		ModelEvalRunStatus,
		ModelEvalScore
	} from '$lib/server/model-eval/runner.js';

	let { data }: { data: PageData } = $props();
	let status = $state<ModelEvalRunStatus>(untrack(() => data.status));
	let latest = $state<ModelEvalResult | null>(untrack(() => data.latest));
	let selected = $state<string[]>(untrack(() =>
		data.catalog.candidates.filter((candidate) => candidate.default).map((candidate) => candidate.id)
	));
	let pending = $state(false);
	let message = $state<string | null>(null);
	let timer: ReturnType<typeof setInterval> | null = null;

	const isRunning = $derived(status.state === 'running');
	const progress = $derived(status.state === 'running' ? status.progress : null);
	const activeCandidates = $derived(
		selected.map((id) => data.catalog.candidates.find((candidate) => candidate.id === id)).filter((candidate) => candidate != null)
	);
	const modelEntries = $derived.by(() => {
		const current = Math.max(1, progress?.current_model ?? 1);
		const restoring = progress?.phase === 'restoring';
		return activeCandidates.map((candidate, index) => {
			let state: ModelCardState = 'WARTET';
			if (restoring || index + 1 < current) state = 'FERTIG';
			else if (index + 1 === current) state = 'LÄUFT';
			return {
				key: candidate.id,
				roleLabel: candidate.label,
				modelId: candidate.model_id,
				state,
				stepIndex: state === 'LÄUFT' ? index + 1 : null,
				stepTotal: state === 'LÄUFT' ? activeCandidates.length : null
			};
		});
	});
	const overallProgress = $derived.by(() => {
		const cases = progress?.total_cases ?? data.catalog.suite.cases;
		const models = progress?.total_models ?? Math.max(activeCandidates.length, 1);
		const done = progress?.phase === 'restoring'
			? cases * models
			: Math.max(0, ((progress?.current_model ?? 1) - 1) * cases + (progress?.completed_cases ?? 0));
		return { done, total: cases * models, unit: 'Urteile', eta: null };
	});
	const ranked = $derived.by(() => {
		if (!latest) return [];
		return [...latest.models].sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
	});
	const best = $derived.by(() => {
		const scored = ranked.filter((entry) =>
			typeof entry.accuracy === 'number' && entry.n != null && entry.valid === entry.n
		);
		if (!scored.length) return null;
		const top = scored[0].accuracy;
		const tied = scored.filter((entry) => entry.accuracy === top);
		return tied.length === 1 ? tied[0] : null;
	});
	const noteworthy = $derived(ranked.filter((entry) => deviations(entry).length > 0));

	function percent(value: number | null | undefined): string {
		return typeof value === 'number' ? `${Math.round(value * 100)} %` : '—';
	}

	function elapsed(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
	}

	function deviations(entry: ModelEvalScore): ModelEvalPrediction[] {
		return (entry.predictions ?? []).filter((prediction) =>
			prediction.error != null || (
				prediction.predicted != null && prediction.expected != null &&
				prediction.predicted.join('/') !== prediction.expected.join('/')
			)
		);
	}

	function falseAlarm(entry: ModelEvalScore): string {
		if (entry.false_positive_count == null || entry.non_actionable_cases == null) return '—';
		return `${entry.false_positive_count} / ${entry.non_actionable_cases}`;
	}

	function pair(value: [string, string] | undefined): string {
		return value?.join(' / ') ?? '—';
	}

	function phaseLabel(): string {
		if (!progress) return 'Lauf wird vorbereitet';
		if (progress.phase === 'loading') return `${progress.candidate_label ?? 'Modell'} wird geladen`;
		if (progress.phase === 'evaluating') return `${progress.candidate_label ?? 'Modell'} wird geprüft`;
		if (progress.phase === 'restoring') return 'Betriebsmodell wird wiederhergestellt';
		return 'Lauf wird vorbereitet';
	}

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
	}

	async function refresh() {
		try {
			const response = await fetch('/api/model-eval');
			if (!response.ok) throw new Error(`Status ${response.status}`);
			const payload = await response.json() as { status: ModelEvalRunStatus; latest: ModelEvalResult | null };
			status = payload.status;
			latest = payload.latest;
			if (status.state !== 'running') stopPolling();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Status konnte nicht gelesen werden.';
		}
	}

	function startPolling() {
		if (!timer) timer = setInterval(() => void refresh(), 3000);
	}

	function stopPolling() {
		if (timer) clearInterval(timer);
		timer = null;
	}

	async function start() {
		if (pending || isRunning || selected.length === 0) return;
		pending = true;
		message = null;
		try {
			const response = await fetch('/api/model-eval', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ candidate_ids: selected })
			});
			const payload = await response.json() as ModelEvalRunStatus & { error?: string };
			if (!response.ok) throw new Error(payload.error ?? `Start fehlgeschlagen (${response.status})`);
			status = payload;
			startPolling();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Lauf konnte nicht gestartet werden.';
		} finally {
			pending = false;
		}
	}

	onMount(() => { if (isRunning) startPolling(); });
	onDestroy(stopPolling);
</script>

<svelte:head><title>Folio · Modellprüfstand</title></svelte:head>

<main class="page">
	<a class="back" href="/pipeline"><ArrowLeft size={17} /> Pipeline</a>
	<header>
		<div>
			<p class="kicker">LOKALER MODELLVERGLEICH</p>
			<h1>Modellprüfstand</h1>
			<p class="intro">Dieselben {data.catalog.suite.cases} synthetischen Mails, ein sichtbarer Lens-Vertrag. Ohne Heuristik, Mail-Alter, Decay oder fremde Modellurteile.</p>
		</div>
		<div class="suite-stack">
			<div class="suite"><FlaskConical size={18} /><span>{data.catalog.suite.label}</span></div>
			<a class="real-link" href="/pipeline/modelle/alltag">Mit echten Mails messen →</a>
		</div>
	</header>

	{#if status.state === 'running'}
		<section class="run-state" aria-live="polite">
			<div class="run-state-head">
				<div><p class="eyebrow">LIVE · {elapsed(status.elapsedSeconds)}</p><h2>{phaseLabel()}</h2></div>
				<span>Mail-Triage und Council pausieren</span>
			</div>
			<ModelStatusPanel models={modelEntries} stack="eval" active={true} progress={overallProgress} />
		</section>
	{/if}

	<section class="selection" aria-labelledby="candidate-title">
		<div class="section-head">
			<div><p class="eyebrow">KANDIDATEN</p><h2 id="candidate-title">Was soll gegeneinander antreten?</h2></div>
			<span>{selected.length} gewählt</span>
		</div>
		<div class="candidate-grid">
			{#each data.catalog.candidates as candidate}
				<button type="button" class:selected={selected.includes(candidate.id)} disabled={isRunning} onclick={() => toggle(candidate.id)}>
					<span class="check">{#if selected.includes(candidate.id)}<Check size={15} />{/if}</span>
					<span class="candidate-copy"><strong>{candidate.label}</strong><small>{candidate.variant}</small></span>
				</button>
			{/each}
		</div>
		<div class="run-row">
			<p>Während des Laufs pausieren Mail-Triage und Council. Danach kehrt das vorherige Modell zurück.</p>
			<button class="start" type="button" disabled={pending || isRunning || selected.length === 0} onclick={start}>
				{#if pending || isRunning}<span class="spin"><LoaderCircle size={17} /></span>{/if}
				{isRunning ? 'Prüfung läuft' : pending ? 'Startet …' : 'Vergleich starten'}
			</button>
		</div>
		{#if message}<p class="message" role="status">{message}</p>{/if}
	</section>

	{#if status.state === 'failed'}
		<section class="failure" role="alert">
			<strong>Der Vergleichslauf wurde nicht vollständig beendet.</strong>
			<span>Die Mail-Pipeline ist wieder frei. Einzelheiten stehen nur im lokalen Laufprotokoll.</span>
		</section>
	{/if}

	{#if latest}
		<section class="results" aria-labelledby="result-title">
			<div class="section-head">
				<div><p class="eyebrow">LETZTER LAUF</p><h2 id="result-title">Was der Korpus zeigt</h2></div>
				<span>{new Date(latest.finished_at).toLocaleString('de-CH')}</span>
			</div>
			{#if best}
				<div class="finding"><strong>{best.label}</strong><span>höchste Paar-Genauigkeit unter den vollständig gültigen Antworten · noch keine allgemeine Modellrangliste</span></div>
			{:else}
				<div class="finding neutral"><strong>Kein eindeutiger Sieger</strong><span>Gleichstand oder noch kein gültiges Ergebnis.</span></div>
			{/if}
			<div class="table-wrap">
				<table>
					<thead><tr><th>Modell</th><th>Gesamt</th><th>Domain</th><th>Aktion</th><th>Fehlalarm*</th><th>Protokoll</th><th>Median</th></tr></thead>
					<tbody>
						{#each ranked as entry}
							<tr class:error={!!entry.error}>
								<td><strong>{entry.label ?? entry.model_id ?? 'Lauf-Fehler'}</strong><small>{entry.error ?? entry.variant ?? ''}</small></td>
								<td>{percent(entry.accuracy)}</td><td>{percent(entry.domain_accuracy)}</td><td>{percent(entry.action_accuracy)}</td><td><span class="metric">{falseAlarm(entry)}<small>{percent(entry.false_positive_rate)}</small></span></td>
								<td>{entry.valid ?? '—'}{#if entry.n != null} / {entry.n}{/if}</td><td>{entry.median_latency_seconds != null ? `${entry.median_latency_seconds.toFixed(1)} s` : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="footnote">* Anzahl fälschlich als „aktionierbar“ bewerteter Mails / alle nicht-aktionierbaren Soll-Fälle. Bei 40 Fällen entspricht eine Mail 2,5 Prozentpunkten Gesamtgenauigkeit. Dieser Lens-Test misst nur den sichtbaren Modellvertrag; die vollständige Pipeline bleibt eine getrennte Prüfung.</p>

			{#if noteworthy.length > 0}
				<div class="diagnostics">
					<div class="diagnostic-head"><p class="eyebrow">FALLPRÜFUNG</p><h3>Abweichungen und Protokollfehler</h3></div>
					{#each noteworthy as entry}
						<details>
							<summary><strong>{entry.label ?? entry.model_id}</strong><span>{deviations(entry).length} Fälle</span></summary>
							<div class="case-list">
								{#each deviations(entry) as prediction}
									<article>
										<code>UID {prediction.uid}</code>
										{#if prediction.error}
											<p><strong>Protokoll:</strong> {prediction.error}{#if prediction.error_detail} · {prediction.error_detail}{/if}</p>
										{:else}
											<p><strong>Soll:</strong> {pair(prediction.expected)} <span>→</span> <strong>Modell:</strong> {pair(prediction.predicted)}</p>
										{/if}
										{#if prediction.expected_note}<small>{prediction.expected_note}</small>{/if}
									</article>
								{/each}
							</div>
						</details>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	.page { max-width: 1120px; margin: 0 auto; padding: 30px 28px 100px; color: hsl(222 44% 12%); }
	.back { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 26px; color: hsl(214 19% 45%); font-size: .84rem; text-decoration: none; }
	header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
	h1 { margin: 3px 0 8px; font-size: clamp(2rem, 5vw, 3.4rem); font-weight: 580; letter-spacing: -.045em; }
	.intro { max-width: 650px; margin: 0; color: hsl(215 16% 43%); font-size: 1rem; }
	.kicker, .eyebrow { margin: 0; color: hsl(181 52% 31%); font: 650 .69rem/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .13em; }
	.suite { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid hsl(180 25% 80%); border-radius: 999px; color: hsl(181 46% 27%); background: hsl(180 30% 96%); font-size: .78rem; white-space: nowrap; }
	.suite-stack { display:flex;flex-direction:column;align-items:flex-end;gap:9px; }.real-link { color:hsl(181 48% 28%);font-size:.78rem;text-decoration:none;font-weight:650; }
	section { margin-top: 18px; border: 1px solid hsl(214 26% 88%); border-radius: 20px; background: white; box-shadow: 0 10px 35px rgb(23 42 65 / .035); }
	.selection, .results { padding: 24px; }
	.section-head { display: flex; justify-content: space-between; align-items: end; gap: 18px; margin-bottom: 18px; }
	.section-head h2 { margin: 5px 0 0; font-size: 1.15rem; }
	.section-head > span { color: hsl(215 14% 52%); font-size: .78rem; }
	.candidate-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
	.candidate-grid button { display: flex; align-items: center; gap: 11px; min-height: 68px; padding: 12px; border: 1px solid hsl(214 25% 88%); border-radius: 13px; background: hsl(210 25% 99%); color: inherit; text-align: left; cursor: pointer; }
	.candidate-grid button.selected { border-color: hsl(181 42% 52%); background: hsl(180 35% 96%); box-shadow: inset 0 0 0 1px hsl(181 42% 52%); }
	.check { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px; border: 1px solid hsl(214 18% 78%); border-radius: 7px; color: white; background: white; }
	.selected .check { border-color: hsl(181 52% 34%); background: hsl(181 52% 34%); }
	.candidate-copy { display: flex; flex-direction: column; gap: 4px; }
	.candidate-copy strong { font-size: .88rem; }
	.candidate-copy small, td small { color: hsl(215 14% 52%); font-size: .7rem; }
	.run-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 20px; padding-top: 18px; border-top: 1px solid hsl(214 26% 91%); }
	.run-row p { max-width: 650px; margin: 0; color: hsl(215 16% 45%); font-size: .8rem; }
	.start { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 174px; padding: 11px 17px; border: 0; border-radius: 11px; background: hsl(222 45% 13%); color: white; font-weight: 650; cursor: pointer; }
	.start:disabled { opacity: .48; cursor: not-allowed; }
	.message { margin: 14px 0 0; color: hsl(0 60% 42%); font-size: .8rem; }
	.run-state { margin-bottom: 18px; padding: 20px 24px; background: hsl(180 30% 97%); border-color: hsl(180 28% 82%); }
	.run-state-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
	.run-state-head h2 { margin: 5px 0 0; font-size: 1.15rem; }
	.run-state-head > span { color: hsl(215 14% 48%); font-size: .75rem; }
	.failure { display: flex; flex-direction: column; gap: 4px; padding: 17px 20px; border-color: hsl(0 45% 86%); background: hsl(0 55% 97%); color: hsl(0 50% 34%); }
	.failure span { font-size: .78rem; }
	.finding { display: flex; flex-direction: column; gap: 3px; margin-bottom: 15px; padding: 13px 15px; border-radius: 12px; background: hsl(150 35% 95%); color: hsl(155 42% 24%); }
	.finding.neutral { background: hsl(45 50% 95%); color: hsl(35 50% 28%); }
	.finding span { font-size: .76rem; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	th { padding: 9px 10px; border-bottom: 1px solid hsl(214 24% 86%); color: hsl(215 14% 48%); font: 650 .66rem ui-monospace, monospace; letter-spacing: .06em; text-align: right; text-transform: uppercase; }
	th:first-child, td:first-child { text-align: left; }
	td { padding: 13px 10px; border-bottom: 1px solid hsl(214 24% 92%); font-size: .82rem; text-align: right; }
	td:first-child { display: flex; flex-direction: column; gap: 3px; min-width: 190px; }
	.metric { display: inline-flex; flex-direction: column; gap: 2px; }
	.metric small { color: hsl(215 14% 52%); font-size: .67rem; }
	tr.error { color: hsl(0 45% 42%); }
	.footnote { margin: 16px 0 0; color: hsl(215 14% 50%); font-size: .75rem; }
	.diagnostics { margin-top: 22px; padding-top: 20px; border-top: 1px solid hsl(214 26% 90%); }
	.diagnostic-head { margin-bottom: 11px; }
	.diagnostic-head h3 { margin: 5px 0 0; font-size: 1rem; }
	.diagnostics details { border-top: 1px solid hsl(214 24% 90%); }
	.diagnostics summary { display: flex; justify-content: space-between; gap: 14px; padding: 13px 2px; cursor: pointer; font-size: .82rem; }
	.diagnostics summary span { color: hsl(215 14% 50%); font-size: .74rem; }
	.case-list { display: grid; gap: 8px; padding: 0 0 14px; }
	.case-list article { padding: 11px 13px; border-radius: 10px; background: hsl(210 25% 97%); }
	.case-list code { color: hsl(181 48% 28%); font-size: .7rem; }
	.case-list p { margin: 6px 0 0; font-size: .78rem; }
	.case-list p span { padding: 0 5px; color: hsl(215 14% 52%); }
	.case-list small { display: block; margin-top: 5px; color: hsl(215 14% 48%); font-size: .71rem; }
	.spin { animation: spin .9s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 760px) { .page { padding: 22px 16px 80px; } header { flex-direction: column; } .candidate-grid { grid-template-columns: 1fr; } .run-row, .run-state-head { align-items: stretch; flex-direction: column; } }
</style>
