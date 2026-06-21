<!--
  Direktive 3 (pipeline-minimal): Trigger-Form + Lebenszeichen-Block.
  Kein Live-Log, kein expand-Toggle, kein autoScroll. Tranche-Default
  via localStorage persistiert.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { workerRunStore } from '$lib/stores/workerRun.svelte.js';
	import { estimateEtaSeconds, formatElapsed, formatEta } from '$lib/util/run-eta.js';
	import type { WorkerRunRow } from '$lib/server/folio-db/types.js';

	let { runs = [] }: { runs?: WorkerRunRow[] } = $props();

	const TRANCHE_LS_KEY = 'pipeline.lastTrancheSize';

	onMount(() => {
		workerRunStore.fetchStatus();
		// Tranche-Default aus localStorage (Direktive 3 §1)
		try {
			const raw = localStorage.getItem(TRANCHE_LS_KEY);
			if (raw) {
				const n = parseInt(raw, 10);
				if (Number.isFinite(n) && n > 0 && n <= 5000) {
					workerRunStore.trancheSize = n;
				}
			}
		} catch {
			// localStorage unavailable
		}
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		try {
			localStorage.setItem(TRANCHE_LS_KEY, String(workerRunStore.trancheSize));
		} catch {
			// ignore
		}
		workerRunStore.submit();
	}

	const isRunning = $derived(workerRunStore.activeRun != null);
	const isValidator = $derived(workerRunStore.activeRun?.mode === 'validator');
	const isAutoTriggered = $derived(workerRunStore.activeRun?.triggeredBy === 'auto');
	const lastEnded = $derived(workerRunStore.lastEndedRun);

	// Lebenszeichen-Tick (1 s) — minimaler State-Refresh nur während aktiv.
	let now = $state(Date.now());
	$effect(() => {
		if (!isRunning) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const elapsedText = $derived.by(() => {
		const ar = workerRunStore.activeRun;
		if (!ar) return '';
		const startMs = new Date(ar.startedAt).getTime();
		if (!Number.isFinite(startMs)) return '';
		return formatElapsed(now - startMs);
	});

	const etaText = $derived.by(() => {
		void now; // re-evaluate per tick
		const ar = workerRunStore.activeRun;
		if (!ar) return '—';
		// Validator-Run hat trancheSize=0 → ETA nicht sinnvoll
		if (ar.mode === 'validator' || ar.trancheSize === 0) return '—';
		const seconds = estimateEtaSeconds(
			{
				account: ar.account,
				mode: ar.mode,
				trancheSize: ar.trancheSize,
				startedAt: ar.startedAt
			},
			runs
		);
		return formatEta(seconds);
	});

	const lastEndedColor = $derived(
		lastEnded?.status === 'failed'
			? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
			: lastEnded?.status === 'cancelled'
				? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
				: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
	);
</script>

<div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
	{#if !isRunning}
		<!-- Trigger-Sektion: Form sichtbar bei idle -->
		<form onsubmit={handleSubmit} class="space-y-3 px-4 py-3 text-xs">
			<div class="grid grid-cols-3 gap-2">
				<label class="space-y-1">
					<span class="block text-[10px] uppercase tracking-wider text-muted-foreground">Account</span>
					<select
						bind:value={workerRunStore.account}
						class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
					>
						<option value="yahoo">yahoo</option>
						<option value="gmail">gmail</option>
						<option value="mirhamed">mirhamed</option>
					</select>
				</label>
				<label class="space-y-1">
					<span class="block text-[10px] uppercase tracking-wider text-muted-foreground">Mode</span>
					<select
						bind:value={workerRunStore.mode}
						class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
					>
						<option value="silent">silent (headless)</option>
						<option value="learning">learning (Telegram)</option>
					</select>
				</label>
				<label class="space-y-1">
					<span class="block text-[10px] uppercase tracking-wider text-muted-foreground">Tranche</span>
					<input
						type="number"
						min="0"
						max="5000"
						bind:value={workerRunStore.trancheSize}
						class="w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
					/>
				</label>
			</div>
			{#if workerRunStore.error}
				<div class="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-500">
					{workerRunStore.error}
				</div>
			{/if}
			{#if lastEnded}
				<div class="rounded-md border px-2 py-1.5 text-xs space-y-1 {lastEndedColor}">
					<div class="flex items-center justify-between gap-2">
						<span class="font-medium uppercase tracking-wider text-[10px]">
							{lastEnded.status} · {lastEnded.account} · {lastEnded.mode} · {lastEnded.mailsProcessed} mails
						</span>
						<button
							type="button"
							class="opacity-70 hover:opacity-100"
							onclick={() => workerRunStore.dismissLastEnded()}
							title="Dismiss"
						>×</button>
					</div>
					{#if lastEnded.errorSummary}
						<div class="font-mono text-[10px] whitespace-pre-wrap break-words">{lastEnded.errorSummary}</div>
					{/if}
				</div>
			{/if}
			<div class="flex items-center justify-end">
				<button
					type="submit"
					class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
					disabled={workerRunStore.submitting}
				>
					{workerRunStore.submitting ? 'Startet...' : 'Worker-Run starten'}
				</button>
			</div>
		</form>
	{:else}
		<!-- Lebenszeichen-Block: kompakt, nur während aktiv -->
		<div class="px-4 py-3 text-xs space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<span class="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
					<span class="font-medium">
						{isValidator ? 'Validator' : 'Worker'}-Run aktiv
					</span>
					{#if isAutoTriggered}
						<span
							class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
							style="background-color: var(--color-lumen-warm); color: white;"
							title="Validator wurde automatisch nach silent-Worker-End gestartet"
						>
							<span>⚡</span><span>Auto-Validator</span>
						</span>
					{/if}
				</div>
				<button
					type="button"
					class="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-500 hover:bg-rose-500/20"
					onclick={() => workerRunStore.cancel()}
					title={isValidator && isAutoTriggered
						? 'Auto-Validator abbrechen (Worker-Bootstrap blieb erhalten)'
						: 'Aktiven Run abbrechen'}
				>
					Abbrechen
				</button>
			</div>
			<div class="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
				<span><span class="text-foreground">{workerRunStore.activeRun?.account}</span> · {workerRunStore.activeRun?.mode}{workerRunStore.activeRun?.trancheSize && workerRunStore.activeRun.trancheSize > 0 ? ` · tranche=${workerRunStore.activeRun.trancheSize}` : ''}</span>
			</div>
			<div class="flex items-center gap-3 text-[11px]">
				<span><span class="text-muted-foreground">läuft seit </span><span class="font-mono">{elapsedText}</span></span>
				<span><span class="text-muted-foreground">ETA </span><span class="font-mono">{etaText}</span></span>
			</div>
			{#if workerRunStore.error}
				<div class="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-500">
					{workerRunStore.error}
				</div>
			{/if}
		</div>
	{/if}
</div>
