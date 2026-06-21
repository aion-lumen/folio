<!--
  F.9 Block-4 — Pipeline-Card im Heute-Hub.
  Zeigt Pipeline-Status: aktiver Run (client-side via workerRunStore) oder
  letzter Run (server-side via lastRun-prop).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Workflow, ArrowRight } from 'lucide-svelte';
	import { workerRunStore } from '$lib/stores/workerRun.svelte.js';

	interface LastRun {
		account: string;
		mode: string;
		status: string;
		started_at: string;
		ended_at: string | null;
		mails_processed: number;
	}

	let { lastRun }: { lastRun: LastRun | null } = $props();

	const activeRun = $derived(workerRunStore.activeRun);
	const inTransition = $derived(workerRunStore.pipelineInTransition);

	function fmtAgo(iso: string): string {
		const ms = Date.now() - new Date(iso).getTime();
		const sec = Math.floor(ms / 1000);
		if (sec < 60) return `vor ${sec}s`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `vor ${min}min`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `vor ${hr}h`;
		return `vor ${Math.floor(hr / 24)}d`;
	}
</script>

<button class="card" type="button" onclick={() => goto('/pipeline')}>
	<header class="card-head">
		<Workflow size={18} class="icon" />
		<span class="title">Pipeline</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if activeRun}
		<p class="primary">
			<span class="pulse-dot"></span>
			<span class="state-label">{activeRun.mode === 'validator' ? 'Validator' : 'Worker'} läuft</span>
		</p>
		<p class="hint">{activeRun.account} · tranche {activeRun.trancheSize}</p>
	{:else if inTransition}
		<p class="primary">
			<span class="pulse-dot"></span>
			<span class="state-label">Pipeline-Transition</span>
		</p>
		<p class="hint">Worker fertig, Auto-Validator startet.</p>
	{:else if lastRun}
		<p class="primary muted">Letzter Run · {fmtAgo(lastRun.started_at)}</p>
		<p class="hint">
			{lastRun.account} · {lastRun.mode} ·
			{lastRun.mails_processed} Mails · {lastRun.status}
		</p>
	{:else}
		<p class="primary muted">Idle · noch kein Run</p>
		<p class="hint">Starte einen Worker-Run um Mails zu klassifizieren.</p>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		text-align: left;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		cursor: pointer;
		transition: border-color 150ms, transform 150ms;
		font-family: inherit;
		color: var(--color-foreground);
	}
	.card:hover {
		border-color: var(--color-foreground);
		transform: translateY(-1px);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.card-head .icon { color: var(--color-foreground); }
	.title {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		flex: 1;
	}
	.arrow { opacity: 0.4; color: var(--color-muted-foreground); transition: opacity 150ms, transform 150ms; }
	.card:hover .arrow { opacity: 1; transform: translateX(2px); }

	.primary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		font-weight: 500;
		margin: 4px 0 0;
		color: var(--color-foreground);
	}
	.primary.muted {
		font-size: 14px;
		color: var(--color-muted-foreground);
		font-weight: 400;
	}
	.state-label { font-size: 16px; }

	.pulse-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--color-lumen-warm, hsl(28 92% 58%));
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.9); }
	}

	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
