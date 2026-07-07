<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { InboxScanItem } from '$lib/server/inbox/types.js';
	import type { TriageAssessment } from '$lib/server/agent/types.js';
	import type { TriagePreflight } from '$lib/server/agent/preflight.js';
	import type { RecentInboxActivity } from '$lib/server/agent/recent.js';

	let { data } = $props();
	let busy = $state(false);
	let triageBusy = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let preflight = $state<TriagePreflight>(data.triagePreflight);
	let lastActivity = $state<RecentInboxActivity | null>(data.lastActivity);

	const validItems = $derived(data.scan.items.filter((i: InboxScanItem) => i.status === 'valid'));

	$effect(() => {
		preflight = data.triagePreflight;
		lastActivity = data.lastActivity;
	});

	function verdictLabel(triage: TriageAssessment | null | undefined): string {
		if (!triage) return '—';
		if (triage.auto_committed) return 'auto-angelegt';
		if (triage.guardrail_violation && triage.verdict === 'task') return 'blockiert';
		if (triage.verdict === 'task') return 'eindeutig';
		if (triage.verdict === 'unclear') return 'unklar';
		return 'kein Task';
	}

	function verdictClass(triage: TriageAssessment | null | undefined): string {
		if (!triage) return 'none';
		if (triage.auto_committed) return 'auto';
		if (triage.verdict === 'task' && !triage.guardrail_violation) return 'task';
		if (triage.verdict === 'unclear') return 'unclear';
		return 'skip';
	}

	async function commitAll() {
		busy = true;
		message = null;
		error = null;
		try {
			const res = await fetch('/api/inbox/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ allValid: true })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.message ?? `HTTP ${res.status}`);
			message = `Importiert: ${payload.committed?.length ?? 0}, übersprungen: ${payload.skipped?.length ?? 0}`;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function runTriage() {
		if (validItems.length === 0) return;
		triageBusy = true;
		message = null;
		error = null;
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 95_000);
			const res = await fetch('/api/inbox/triage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ autoCommit: true }),
				signal: controller.signal
			});
			clearTimeout(timer);
			const payload = await res.json();
			if (payload.preflight) preflight = payload.preflight;
			if (payload.lastActivity) lastActivity = payload.lastActivity;
			if (!res.ok) {
				throw new Error(payload?.error ?? payload?.preflight?.message ?? `HTTP ${res.status}`);
			}
			const r = payload.result;
			const committed = r.auto_committed?.[0];
			if (committed?.objective_id) {
				message = `Objective ${committed.objective_id} in ${committed.message?.split(' in ')[1] ?? 'Kampagne'} angelegt.`;
			} else {
				message = `Triage: ${r.assessed} beurteilt, ${r.auto_committed?.length ?? 0} auto-angelegt, ${r.awaiting_review?.length ?? 0} Review`;
			}
			await invalidateAll();
			lastActivity = payload.lastActivity ?? lastActivity;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				error = 'Triage-Timeout (90s) — LM Studio antwortet nicht rechtzeitig';
			} else {
				error = e instanceof Error ? e.message : String(e);
			}
		} finally {
			triageBusy = false;
		}
	}

	onMount(() => {
		if (data.agentAuto && validItems.length > 0 && preflight.ok) {
			void runTriage();
		}
	});
</script>

<svelte:head>
	<title>Folio · Inbox</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Import-Inbox</h1>
		<p class="sub">Staging für Folio Interchange Format v1 — LLM-Triage legt eindeutige Tasks als Objectives an.</p>
	</header>

	<p class="preflight" class:warn={!preflight.ok}>{preflight.message}</p>

	<section class="summary">
		<div class="stat"><span class="n">{data.scan.valid}</span> bereit</div>
		<div class="stat"><span class="n">{data.scan.triage?.auto_committed ?? 0}</span> auto-angelegt</div>
		<div class="stat"><span class="n">{data.scan.triage?.awaiting_review ?? data.scan.valid}</span> Review</div>
		<div class="stat"><span class="n">{data.scan.duplicate}</span> Duplikat</div>
		<div class="stat"><span class="n">{data.scan.invalid}</span> abgewiesen</div>
	</section>

	{#if message}<p class="msg ok">{message}</p>{/if}
	{#if error}<p class="msg err">{error}</p>{/if}

	{#if lastActivity && data.scan.pending === 0}
		<section class="last-activity">
			<strong>Zuletzt ({new Date(lastActivity.at).toLocaleString('de-CH')}):</strong>
			{#if lastActivity.objective_id}
				<p>Objective <code>{lastActivity.objective_id}</code> in Kapitel
					<code>{lastActivity.chapter_slug ?? '?'}</code> angelegt.</p>
			{:else if lastActivity.verdict === 'unclear'}
				<p><code>{lastActivity.document_id}</code> — unklar, manuelles Review nötig.</p>
			{:else}
				<p><code>{lastActivity.document_id}</code> — {lastActivity.verdict} ({Math.round(lastActivity.confidence * 100)}%)</p>
			{/if}
			<p class="dim">{lastActivity.reasoning}</p>
		</section>
	{/if}

	<div class="actions">
		<button class="triage" type="button" disabled={triageBusy || validItems.length === 0} onclick={runTriage}>
			{triageBusy ? 'Triage läuft…' : 'LLM-Triage ausführen'}
		</button>
		{#if validItems.length > 0}
			<button class="commit" type="button" disabled={busy} onclick={commitAll}>
				{busy ? 'Importiere…' : `${validItems.length} manuell importieren`}
			</button>
		{/if}
	</div>

	<ul class="list">
		{#each data.scan.items as item}
			<li class="item {item.status}">
				<div class="row">
					<span class="badge">{item.status}</span>
					{#if item.triage}
						<span class="verdict {verdictClass(item.triage)}">{verdictLabel(item.triage)}</span>
					{/if}
					<strong>{item.title ?? item.filename}</strong>
				</div>
				<div class="meta">
					{#if item.type}<span>{item.type}</span>{/if}
					{#if item.target}<span>→ {item.target}</span>{/if}
					{#if item.id}<span>id:{item.id}</span>{/if}
					{#if item.triage?.committed_objective_id}
						<span>obj:{item.triage.committed_objective_id}</span>
					{/if}
				</div>
				{#if item.triage?.objective && !item.triage.auto_committed}
					<div class="proposal">
						<strong>Vorschlag:</strong> {item.triage.objective.title}
						<span class="dim">→ {item.triage.chapter_slug}</span>
						<div class="dim">{item.triage.objective.threshold}</div>
					</div>
				{/if}
				{#if item.triage?.reasoning}
					<p class="reasoning">{item.triage.reasoning}</p>
				{/if}
				{#if item.triage?.guardrail_violation}
					<p class="err-line">{item.triage.guardrail_violation}</p>
				{/if}
				{#if item.error}<p class="err-line">{item.error}</p>{/if}
			</li>
		{/each}
	</ul>

	{#if data.scan.items.length === 0}
		<p class="empty">Keine Dateien in ~/.folio/inbox/.{#if lastActivity?.objective_id} Die letzte Triage hat ein Objective angelegt (siehe oben).{/if} Neue .md-Dateien gemäss FOLIO-IMPORT.md ablegen.</p>
	{/if}
</div>

<style>
	.page { max-width: 720px; margin: 0 auto; padding: 48px 32px; }
	header { margin-bottom: 24px; }
	h1 { margin: 0 0 8px; font-size: 28px; }
	.sub { margin: 0; color: var(--color-muted-foreground); font-size: 14px; }
	.preflight {
		margin: 0 0 16px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 13px;
		background: hsl(142 40% 92%);
		color: hsl(142 40% 25%);
	}
	.preflight.warn {
		background: hsl(38 60% 92%);
		color: hsl(38 60% 28%);
	}
	.summary { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
	.stat { font-size: 13px; color: var(--color-muted-foreground); }
	.n { font-size: 20px; font-weight: 600; color: var(--color-foreground); display: block; }
	.actions { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
	.triage, .commit {
		padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600;
	}
	.triage {
		background: hsl(210 60% 45%); color: white;
	}
	.commit {
		background: var(--color-foreground); color: var(--color-background);
	}
	.triage:disabled, .commit:disabled { opacity: 0.6; cursor: wait; }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
	.item {
		padding: 14px 16px; border: 1px solid var(--color-border);
		border-radius: 10px; background: var(--color-card);
	}
	.item.valid { border-left: 3px solid hsl(142 60% 40%); }
	.item.duplicate { border-left: 3px solid hsl(38 80% 50%); }
	.item.invalid { border-left: 3px solid hsl(0 60% 50%); opacity: 0.85; }
	.row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
	.badge {
		font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
		padding: 2px 6px; border-radius: 4px; background: var(--color-muted);
	}
	.verdict {
		font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
		padding: 2px 6px; border-radius: 4px;
	}
	.verdict.task { background: hsl(142 40% 90%); color: hsl(142 40% 25%); }
	.verdict.unclear { background: hsl(38 60% 90%); color: hsl(38 60% 30%); }
	.verdict.skip { background: var(--color-muted); color: var(--color-muted-foreground); }
	.verdict.auto { background: hsl(142 50% 85%); color: hsl(142 50% 22%); }
	.verdict.none { display: none; }
	.meta { font-size: 12px; font-family: var(--font-mono); color: var(--color-muted-foreground); display: flex; gap: 12px; flex-wrap: wrap; }
	.proposal { margin-top: 8px; font-size: 13px; line-height: 1.45; }
	.dim { color: var(--color-muted-foreground); font-size: 12px; }
	.reasoning { margin: 8px 0 0; font-size: 12px; color: var(--color-muted-foreground); font-style: italic; }
	.err-line { margin: 8px 0 0; font-size: 12px; color: hsl(0 60% 45%); }
	.msg { padding: 10px 12px; border-radius: 8px; font-size: 13px; }
	.msg.ok { background: hsl(142 40% 92%); color: hsl(142 40% 25%); }
	.msg.err { background: hsl(0 40% 92%); color: hsl(0 50% 30%); }
	.last-activity {
		margin-bottom: 20px;
		padding: 14px 16px;
		border-radius: 10px;
		border: 1px solid hsl(142 40% 75%);
		background: hsl(142 35% 94%);
		font-size: 14px;
		line-height: 1.5;
	}
	.last-activity p { margin: 6px 0 0; }
	.last-activity code { font-family: var(--font-mono); font-size: 12px; }
	.empty { color: var(--color-muted-foreground); font-size: 14px; }
</style>
