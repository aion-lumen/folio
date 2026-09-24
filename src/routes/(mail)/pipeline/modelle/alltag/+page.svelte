<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { ArrowLeft, Check, LoaderCircle, MailCheck } from 'lucide-svelte';
	import type { PageData } from './$types.js';
	import ModelStatusPanel from '$lib/pipeline/ModelStatusPanel.svelte';
	import type { ModelCardState } from '$lib/pipeline/ModelStatusCard.svelte';
	import type { ModelEvalResult, ModelEvalRunStatus, ModelEvalScore } from '$lib/server/model-eval/runner.js';

	let { data }: { data: PageData } = $props();
	let status = $state<ModelEvalRunStatus>(untrack(() => data.status));
	let latest = $state<ModelEvalResult | null>(untrack(() => data.latest));
	let selected = $state<string[]>(untrack(() => data.catalog.candidates.filter((item) => item.default).map((item) => item.id)));
	let pending = $state(false);
	let message = $state<string | null>(null);
	let timer: ReturnType<typeof setInterval> | null = null;

	const running = $derived(status.state === 'running');
	const progress = $derived(status.state === 'running' ? status.progress : null);
	const activeCandidates = $derived(selected.map((id) => data.catalog.candidates.find((item) => item.id === id)).filter((item) => item != null));
	const ranked = $derived(latest ? [...latest.models].sort((a, b) => (b.primary_macro_f1 ?? -1) - (a.primary_macro_f1 ?? -1)) : []);
	const modelEntries = $derived.by(() => {
		const current = Math.max(1, progress?.current_model ?? 1);
		return activeCandidates.map((candidate, index) => {
			let state: ModelCardState = 'WARTET';
			if (progress?.phase === 'restoring' || index + 1 < current) state = 'FERTIG';
			else if (index + 1 === current) state = 'LÄUFT';
			return {
				key: candidate.id, roleLabel: candidate.label, modelId: candidate.model_id, state,
				stepIndex: state === 'LÄUFT' ? index + 1 : null,
				stepTotal: state === 'LÄUFT' ? activeCandidates.length : null
			};
		});
	});
	const overallProgress = $derived.by(() => {
		const cases = progress?.total_cases ?? data.catalog.suite.cases;
		const models = progress?.total_models ?? Math.max(activeCandidates.length, 1);
		const done = progress?.phase === 'restoring' ? cases * models : Math.max(0, ((progress?.current_model ?? 1) - 1) * cases + (progress?.completed_cases ?? 0));
		return { done, total: cases * models, unit: 'Urteile', eta: null };
	});

	function percent(value: number | null | undefined): string {
		return typeof value === 'number' ? `${Math.round(value * 100)} %` : '—';
	}

	function toggle(id: string) {
		message = null;
		if (selected.includes(id)) selected = selected.filter((value) => value !== id);
		else if (selected.length < 6) selected = [...selected, id];
		else message = 'Pro Lauf sind höchstens sechs Modelle möglich.';
	}

	async function refresh() {
		try {
			const response = await fetch('/api/model-eval/real');
			if (!response.ok) throw new Error(`Status ${response.status}`);
			const payload = await response.json() as { status: ModelEvalRunStatus; latest: ModelEvalResult | null };
			status = payload.status;
			latest = payload.latest;
			if (status.state !== 'running') stopPolling();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Status konnte nicht gelesen werden.';
		}
	}

	function startPolling() { if (!timer) timer = setInterval(() => void refresh(), 3000); }
	function stopPolling() { if (timer) clearInterval(timer); timer = null; }

	async function start() {
		if (data.unavailable || pending || running || selected.length === 0) return;
		pending = true;
		message = null;
		try {
			const response = await fetch('/api/model-eval/real', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ candidate_ids: selected })
			});
			const payload = await response.json() as ModelEvalRunStatus & { error?: string };
			if (!response.ok) throw new Error(payload.error ?? `Start fehlgeschlagen (${response.status})`);
			status = payload;
			startPolling();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Lauf konnte nicht gestartet werden.';
		} finally { pending = false; }
	}

	function deviationCount(model: ModelEvalScore): number {
		return (model.predictions ?? []).filter((item) => item.error || (
			item.expected_real && item.predicted_real && (
				item.expected_real.primary_domain !== item.predicted_real.primary_domain ||
				(item.expected_real.action_required != null && item.expected_real.action_required !== item.predicted_real.action_required) ||
				(item.expected_real.deadline_present != null && item.expected_real.deadline_present !== item.predicted_real.deadline_present)
			)
		)).length;
	}

	onMount(() => { if (running) startPolling(); });
	onDestroy(stopPolling);
</script>

<svelte:head><title>Folio · Alltagstest</title></svelte:head>

<main class="page">
	<a class="back" href="/pipeline/modelle"><ArrowLeft size={17} /> Modellprüfstand</a>
	<header>
		<div><p class="kicker">REALE MAILS · MENSCHLICHES GOLD</p><h1>Alltagstest</h1><p class="intro">Eine beim Start eingefrorene, ausgewogene Kohorte aus deinen bereits bewerteten Mails. Keine Mail wird verändert und kein Inhalt im Ergebnis gespeichert.</p></div>
		<div class="suite"><MailCheck size={18} /><span>{data.catalog.suite.cases} Fälle</span></div>
	</header>

	{#if data.unavailable}<p class="message" role="status">{data.unavailable} Bitte zuerst mindestens acht reale Mails prüfen. <a href="/mail-queue">Zum Maileingang</a></p>{/if}
	<section class="coverage">
		<div><strong>{data.catalog.suite.cases}</strong><span>Primärdomäne</span></div>
		<div><strong>{data.cohort.secondary_labeled}</strong><span>Sekundärdomänen</span></div>
		<div><strong>{data.cohort.action_labeled}</strong><span>Handlungsbedarf</span></div>
		<div><strong>{data.cohort.deadline_labeled}</strong><span>Frist</span></div>
	</section>

	{#if running}
		<section class="run-state" aria-live="polite">
			<div class="run-head"><div><p class="eyebrow">LIVE</p><h2>{progress?.candidate_label ?? 'Lauf wird vorbereitet'}</h2></div><span>Mail-Triage und Council pausieren</span></div>
			<ModelStatusPanel models={modelEntries} stack="eval" active={true} progress={overallProgress} />
		</section>
	{/if}

	<section class="selection">
		<div class="section-head"><div><p class="eyebrow">KANDIDATEN</p><h2>Bis zu sechs Modelle vergleichen</h2></div><span>{selected.length} gewählt</span></div>
		<div class="candidate-grid">
			{#each data.catalog.candidates as candidate}
				<button type="button" class:selected={selected.includes(candidate.id)} disabled={running} onclick={() => toggle(candidate.id)}>
					<span class="check">{#if selected.includes(candidate.id)}<Check size={15} />{/if}</span>
					<span><strong>{candidate.label}</strong><small>{candidate.variant}</small></span>
				</button>
			{/each}
		</div>
		<div class="run-row"><p>Die kleineren Goldmengen für Handlung und Frist werden separat ausgewiesen und nicht auf alle Mails hochgerechnet.</p><button class="start" type="button" disabled={!!data.unavailable || pending || running || selected.length === 0} onclick={start}>{#if pending || running}<span class="spin"><LoaderCircle size={17} /></span>{/if}{running ? 'Prüfung läuft' : 'Alltagstest starten'}</button></div>
		{#if message}<p class="message" role="status">{message}</p>{/if}
	</section>

	{#if status.state === 'failed'}<section class="failure" role="alert"><strong>Der Lauf wurde nicht vollständig beendet.</strong><span>Teilresultate und Ursachen bleiben lokal sichtbar.</span></section>{/if}

	{#if latest}
		<section class="results">
			<div class="section-head"><div><p class="eyebrow">LETZTER LAUF</p><h2>Messung gegen deine Entscheidungen</h2></div><span>{new Date(latest.finished_at).toLocaleString('de-CH')}</span></div>
			<div class="table-wrap"><table>
				<thead><tr><th>Modell</th><th>Primär Macro-F1</th><th>Primär richtig</th><th>Sekundär F1</th><th>Handlung F1</th><th>Falsche Aktion</th><th>Frist F1</th><th>Review</th><th>Protokoll</th><th>Median</th></tr></thead>
				<tbody>{#each ranked as model}<tr class:error={!!model.error}>
					<td><strong>{model.label ?? model.model_id ?? 'Lauf-Fehler'}</strong><small>{model.error ?? `${deviationCount(model)} prüfbare Abweichungen`}</small></td>
					<td>{percent(model.primary_macro_f1)}</td><td>{percent(model.domain_accuracy)}</td><td>{percent(model.secondary_micro_f1)}<small>{model.secondary_labeled_cases ?? 0} Fälle</small></td>
					<td>{percent(model.action_f1)}<small>{model.action_labeled_cases ?? 0} Fälle</small></td><td>{model.false_action_count ?? '—'}</td><td>{percent(model.deadline_f1)}<small>{model.deadline_labeled_cases ?? 0} Fälle</small></td>
					<td>{percent(model.abstention_rate)}</td><td>{model.valid ?? '—'} / {model.n ?? '—'}</td><td>{model.median_latency_seconds != null ? `${model.median_latency_seconds.toFixed(1)} s` : '—'}</td>
				</tr>{/each}</tbody>
			</table></div>
			<p class="footnote">Macro-F1 gewichtet jede vorhandene Domäne gleich. Sekundärdomänen, Handlungsbedarf und Frist werden nur dort bewertet, wo du diese Achse ausdrücklich gelabelt hast. „Falsche Aktion“ zählt den besonders störenden Fall, dass das Modell unnötige Arbeit erzeugt.</p>
		</section>
	{/if}
</main>

<style>
	.page { max-width: 1280px; margin: 0 auto; padding: 30px 28px 100px; color: hsl(222 44% 12%); }
	.back { display:inline-flex;align-items:center;gap:7px;margin-bottom:26px;color:hsl(214 19% 45%);font-size:.84rem;text-decoration:none; }
	header { display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:22px; }
	h1 { margin:3px 0 8px;font-size:clamp(2rem,5vw,3.4rem);font-weight:580;letter-spacing:-.045em; }
	h2 { margin:5px 0 0;font-size:1.15rem; }
	.intro { max-width:720px;margin:0;color:hsl(215 16% 43%); }
	.kicker,.eyebrow { margin:0;color:hsl(181 52% 31%);font:650 .69rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em; }
	.suite { display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid hsl(180 25% 80%);border-radius:999px;color:hsl(181 46% 27%);background:hsl(180 30% 96%);font-size:.78rem;white-space:nowrap; }
	section { margin-top:18px;border:1px solid hsl(214 26% 88%);border-radius:20px;background:white;box-shadow:0 10px 35px rgb(23 42 65/.035); }
	.coverage { display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden; }
	.coverage div { display:flex;flex-direction:column;gap:3px;padding:17px 20px;border-right:1px solid hsl(214 26% 90%); }
	.coverage div:last-child { border:0; }.coverage strong { font-size:1.25rem; }.coverage span { color:hsl(215 14% 49%);font-size:.75rem; }
	.selection,.results,.run-state { padding:24px; }.section-head,.run-head { display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:18px; }.section-head>span,.run-head>span { color:hsl(215 14% 52%);font-size:.76rem; }
	.candidate-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px; }
	.candidate-grid button { display:flex;align-items:center;gap:11px;min-height:66px;padding:12px;border:1px solid hsl(214 25% 88%);border-radius:13px;background:hsl(210 25% 99%);color:inherit;text-align:left;cursor:pointer; }
	.candidate-grid button.selected { border-color:hsl(181 42% 52%);background:hsl(180 35% 96%);box-shadow:inset 0 0 0 1px hsl(181 42% 52%); }
	.check { display:grid;place-items:center;width:22px;height:22px;flex:0 0 22px;border:1px solid hsl(214 18% 78%);border-radius:7px;color:white;background:white; }.selected .check { border-color:hsl(181 52% 34%);background:hsl(181 52% 34%); }
	.candidate-grid button>span:last-child,td:first-child { display:flex;flex-direction:column;gap:3px; }.candidate-grid strong,td { font-size:.82rem; }.candidate-grid small,td small { color:hsl(215 14% 52%);font-size:.68rem; }
	.run-row { display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:20px;padding-top:18px;border-top:1px solid hsl(214 26% 91%); }.run-row p { max-width:700px;margin:0;color:hsl(215 16% 45%);font-size:.8rem; }
	.start { display:inline-flex;align-items:center;gap:8px;padding:11px 17px;border:0;border-radius:11px;background:hsl(222 45% 13%);color:white;font-weight:650;cursor:pointer; }.start:disabled { opacity:.48;cursor:not-allowed; }
	.message { color:hsl(0 60% 42%);font-size:.8rem; }.run-state { background:hsl(180 30% 97%);border-color:hsl(180 28% 82%); }
	.failure { display:flex;flex-direction:column;gap:4px;padding:17px 20px;border-color:hsl(0 45% 86%);background:hsl(0 55% 97%);color:hsl(0 50% 34%); }.failure span { font-size:.78rem; }
	.table-wrap { overflow-x:auto; }table { width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums; }th { padding:9px 8px;border-bottom:1px solid hsl(214 24% 86%);color:hsl(215 14% 48%);font:650 .61rem ui-monospace,monospace;text-align:right;text-transform:uppercase; }th:first-child,td:first-child { text-align:left; }td { padding:13px 8px;border-bottom:1px solid hsl(214 24% 92%);text-align:right;white-space:nowrap; }td small { display:block;margin-top:3px; }tr.error { color:hsl(0 45% 42%); }
	.footnote { margin:16px 0 0;color:hsl(215 14% 50%);font-size:.75rem; }.spin { animation:spin .9s linear infinite; }@keyframes spin { to { transform:rotate(360deg); } }
	@media(max-width:760px){.page{padding:22px 16px 80px}header,.run-row,.run-head{flex-direction:column;align-items:stretch}.coverage{grid-template-columns:repeat(2,1fr)}.candidate-grid{grid-template-columns:1fr}}
</style>
