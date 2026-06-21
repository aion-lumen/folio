<!--
  LensRunPanel — domain-agnostic Lens-Lauf-Trigger-Button.
  Direktive 2026-05-31 §B.

  Prop: domain ('council' default; spaeter 'job', 'kampagne').
  Mount: GET /api/{domain}/lens-run → wenn running, Button disabled + Counter.
  Klick (idle): POST /api/{domain}/lens-run.
  Polling: alle 5s GET, bis running=false → invalidateAll() fuer Liste.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let { domain = 'council' }: { domain?: string } = $props();

	type Status = { running: false } | { running: true; elapsed_seconds: number; started_at: string };

	let status: Status = $state({ running: false });
	let error: string | null = $state(null);
	let pending = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function fmtElapsed(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${String(s).padStart(2, '0')} min`;
	}

	async function fetchStatus() {
		try {
			const res = await fetch(`/api/${domain}/lens-run`);
			if (!res.ok) throw new Error(`status ${res.status}`);
			const data = (await res.json()) as Status;
			const wasRunning = status.running;
			status = data;
			if (wasRunning && !data.running) {
				// Lauf ist gerade fertig — Liste reloaden.
				await invalidateAll();
				stopPolling();
			}
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function startPolling() {
		if (pollTimer) return;
		pollTimer = setInterval(fetchStatus, 5000);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function trigger() {
		if (pending || status.running) return;
		pending = true;
		error = null;
		try {
			const res = await fetch(`/api/${domain}/lens-run`, { method: 'POST' });
			if (res.status === 409) {
				const body = (await res.json()) as { elapsed_seconds?: number };
				const min = body.elapsed_seconds != null ? fmtElapsed(body.elapsed_seconds) : '';
				error = `Lauf läuft bereits${min ? ` (seit ${min})` : ''}.`;
				await fetchStatus(); // status sync
				startPolling();
				return;
			}
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			await fetchStatus();
			// 2026-06-11 Pipeline-Findings live-reactivity fix (D): if Lens
			// is started from a page whose loader exposes lensStatus (e.g.
			// /pipeline), invalidate so the page's 5s polling effect can
			// pick it up. Symmetric to the workerRun.submit fix.
			await invalidateAll();
			startPolling();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}

	onMount(() => {
		void fetchStatus().then(() => {
			if (status.running) startPolling();
		});
	});

	onDestroy(stopPolling);
</script>

<div class="panel">
	<button
		type="button"
		class="btn"
		class:running={status.running}
		disabled={status.running || pending}
		onclick={trigger}
		aria-busy={status.running}
	>
		{#if status.running}
			<span class="spinner" aria-hidden="true"></span>
			<span class="label">läuft seit {fmtElapsed(status.elapsed_seconds)}</span>
		{:else if pending}
			<span class="label">…starte</span>
		{:else}
			<span class="label">Lens-Lauf starten</span>
		{/if}
	</button>
	{#if error}
		<div class="err" role="status">{error}</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-end;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px;
		font-size: 12px;
		font-weight: 500;
		background: hsl(222 47% 11%);
		color: white;
		border: 1px solid hsl(222 47% 11%);
		border-radius: 6px;
		cursor: pointer;
	}
	.btn:disabled {
		cursor: not-allowed;
		background: hsl(214 24% 94%);
		color: hsl(215 16% 50%);
		border-color: hsl(214 20% 88%);
	}
	.btn.running {
		background: hsl(45 80% 95%);
		color: hsl(45 60% 30%);
		border-color: hsl(45 60% 80%);
	}
	.spinner {
		width: 10px;
		height: 10px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 700ms linear infinite;
	}
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	.err {
		font-size: 11px;
		color: hsl(0 65% 38%);
	}
</style>
