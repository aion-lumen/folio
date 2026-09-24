<script lang="ts">
	import { onMount } from 'svelte';

	type IntakeRun = {
		id: string;
		account: string;
		history?: boolean;
		requested_by?: 'automatic' | 'manual';
		batch_size?: number;
		state: 'pending' | 'running' | 'completed' | 'failed';
		phase: 'fetch' | 'validate' | 'memory' | 'career';
		items: { stage: string; outcome?: string }[];
		error?: string;
	};
	type Snapshot = {
		busy: boolean;
		runtime: boolean;
		config: { enabled: boolean; batch_size: number } | null;
		coverage: { id: string; label: string; historyEnabled?: boolean }[];
		runs: IntakeRun[];
	};

	let { compact = false }: { compact?: boolean } = $props();
	let snapshot = $state<Snapshot | null>(null);
	let selectedAccount = $state('');
	let history = $state(false);
	let batchSize = $state(5);
	let requestedRunId = $state('');
	let requesting = $state(false);
	let failure = $state('');

	const selectedSource = $derived(snapshot?.coverage.find((source) => source.id === selectedAccount));
	const trackedRun = $derived(snapshot?.runs.find((run) => run.id === requestedRunId));
	const phaseLabels = { fetch: 'Mails abrufen', validate: 'Modellbewertungen', memory: 'Belege und Gedächtnis', career: 'Bewerbungen abgleichen' } as const;
	const stateLabels = { pending: 'Eingereiht', running: 'Läuft geschützt', completed: 'Abgeschlossen', failed: 'Unterbrochen' } as const;
	const errorLabels: Record<string, string> = {
		model_busy: 'Ein anderer lokaler Modelllauf ist aktiv.',
		subprocess_failed: 'Abruf oder Modellbewertung ist fehlgeschlagen.',
		interrupted_subprocess: 'Der lokale Worker wurde unterbrochen.',
		incomplete_model_opinions: 'Mindestens eine Modellbewertung fehlt.',
		extraction_unavailable: 'Das Extraktionsmodell lieferte keine verwertbare Antwort.',
		primary_restore_failed: 'Das primäre lokale Modell konnte nicht wiederhergestellt werden.',
		local_processing_failed: 'Die lokale Verarbeitung konnte nicht abgeschlossen werden.'
	};

	async function refresh() {
		try {
			const response = await fetch('/api/mail/intake', { cache: 'no-store' });
			if (!response.ok) throw new Error(`Status ${response.status}`);
			const next = await response.json() as Snapshot;
			snapshot = next;
			if (!selectedAccount && next.coverage.length) {
				selectedAccount = next.coverage[0].id;
				batchSize = Math.min(30, Math.max(1, next.config?.batch_size ?? 5));
			}
			if (history && !next.coverage.find((source) => source.id === selectedAccount)?.historyEnabled) history = false;
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'Status konnte nicht geladen werden.';
		}
	}

	async function start() {
		if (!selectedAccount || requesting || snapshot?.busy) return;
		requesting = true;
		failure = '';
		try {
			const response = await fetch('/api/mail/intake', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'run_now', account: selectedAccount, history, batch_size: batchSize })
			});
			const body = await response.json().catch(() => null) as { run?: IntakeRun; message?: string } | null;
			if (!response.ok) throw new Error(response.status === 409 ? 'Ein anderer geschützter Mail- oder Modelllauf ist aktiv.' : body?.message ?? `Start fehlgeschlagen (${response.status}).`);
			requestedRunId = body?.run?.id ?? '';
			await refresh();
		} catch (cause) {
			failure = cause instanceof Error ? cause.message : 'Der Lauf konnte nicht gestartet werden.';
		} finally {
			requesting = false;
		}
	}

	function changeHistory(event: Event) {
		history = (event.currentTarget as HTMLInputElement).checked;
		if (history) batchSize = 10;
	}

	onMount(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 3_000);
		return () => clearInterval(timer);
	});
</script>

<section class:compact class="manual-run" aria-label="Manueller geschützter Maillauf">
	<div class="heading">
		<div>
			<span>MANUELLER LAUF</span>
			<h3>Eine Tranche jetzt einlesen</h3>
		</div>
		<span class:busy={snapshot?.busy} class="guard">{snapshot?.busy ? 'belegt' : 'geschützt frei'}</span>
	</div>
	<p class="explain">Nutzt dieselbe Warteschlange, Worker-Sperre und lokale Modellprüfung wie der periodische Lauf. Ein zweiter Import kann nicht parallel starten.</p>

	<div class="controls">
		<label>Quelle
			<select bind:value={selectedAccount} disabled={requesting || snapshot?.busy || !snapshot?.runtime}>
				{#each snapshot?.coverage ?? [] as source}
					<option value={source.id}>{source.label}</option>
				{/each}
			</select>
		</label>
		<label>Tranche
			<select bind:value={batchSize} disabled={requesting || snapshot?.busy || !snapshot?.runtime}>
				{#each history ? [5, 10, 20] : [5, 10, 20, 30] as size}<option value={size}>{size} Mails{history ? ' · historischer Checkpoint' : ''}</option>{/each}
			</select>
		</label>
		{#if selectedSource?.historyEnabled}
			<label class="history"><input type="checkbox" checked={history} onchange={changeHistory} disabled={requesting || snapshot?.busy} /> Gesamtbestand statt Posteingang</label>
		{/if}
		<button onclick={start} disabled={requesting || snapshot?.busy || !snapshot?.runtime || !snapshot?.config?.enabled || !selectedAccount}>
			{requesting ? 'Wird eingereiht …' : snapshot?.busy ? 'Lauf aktiv' : 'Jetzt geschützt starten'}
		</button>
	</div>

	{#if trackedRun}
		<div class:error={trackedRun.state === 'failed'} class:done={trackedRun.state === 'completed'} class="progress" role="status">
			<strong>{stateLabels[trackedRun.state]}</strong>
			<span>{phaseLabels[trackedRun.phase]} · {trackedRun.items.length} Mails in dieser Tranche</span>
			{#if trackedRun.error}<small>{errorLabels[trackedRun.error] ?? trackedRun.error}</small>{/if}
		</div>
	{:else if snapshot?.busy}
		<div class="progress" role="status"><strong>Ein Lauf ist bereits aktiv.</strong><span>Nach seinem Abschluss kann die gewählte Tranche gestartet werden.</span></div>
	{/if}
	{#if !snapshot?.runtime}<p class="notice">Der Hintergrunddienst ist in dieser Folio-Instanz nicht eingeschaltet.</p>{/if}
	{#if snapshot && !snapshot.config?.enabled}<p class="notice">Aktiviere zuerst den periodischen Maileingang; damit gilt dieselbe Owner-Autorisierung auch für diesen Einzellauf.</p>{/if}
	{#if failure}<p class="notice" role="alert">{failure}</p>{/if}
</section>

<style>
	.manual-run{background:#fffefa;border:1px solid #dce4dc;border-radius:16px;padding:22px;color:#283d3c}.manual-run.compact{border-radius:10px;padding:14px}.heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.heading span{font-size:10px;font-weight:750;letter-spacing:.13em;color:#68847c}.heading h3{font-size:18px;margin:5px 0 0;font-weight:560}.guard{padding:5px 9px;border-radius:999px;background:#dcebdc;white-space:nowrap}.guard.busy{background:#f6e8cc;color:#7c622e}.explain{font-size:12px;line-height:1.55;color:#66756d;margin:12px 0 16px}.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.controls label{display:grid;gap:5px;font-size:11px;color:#66756d}.controls select{min-width:170px;min-height:39px;border:1px solid #ced9d1;border-radius:9px;background:white;padding:0 28px 0 10px;color:#283d3c}.controls .history{display:flex;align-items:center;min-height:39px;gap:7px}.controls button{min-height:39px;background:#315e50;border:0;border-radius:10px;padding:0 15px;color:white;font:inherit;font-size:12px;cursor:pointer}.controls button:disabled{opacity:.45;cursor:default}.progress{display:grid;gap:3px;margin-top:14px;padding:12px;border-radius:9px;background:#eef3ed;font-size:12px}.progress span,.progress small{color:#64736b}.progress.done{background:#e5f1e4}.progress.error,.notice{background:#fbf0dd;color:#806633}.notice{border-radius:9px;padding:11px;font-size:12px;line-height:1.5;margin:12px 0 0}@media(max-width:560px){.controls{display:grid}.controls label,.controls select,.controls button{width:100%}.heading{align-items:center}}
</style>
