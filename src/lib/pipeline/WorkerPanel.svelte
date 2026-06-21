<!--
  F.4.D WorkerPanel — Live-Status (Build-Spec §4 Komp.7).
  F.7-Bugfix-5: expanded state ist jetzt POPOVER (absolute, z-50) statt
  inline-grow, damit ActionFilterRow nicht überlappt wird. Header-Click
  togglet popover. ESC + Click-außerhalb schließen.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import RecentRuns from './RecentRuns.svelte';

	interface WorkerRunRow {
		id: number;
		run_uuid: string;
		account: string;
		board: string;
		mode: 'learning' | 'silent' | 'validator';
		tranche_size: number;
		status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
		started_at: string;
		ended_at: string | null;
		mails_processed: number;
	}

	let { runs = [] }: { runs?: WorkerRunRow[] } = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	const heartbeatRel = $derived.by(() => {
		if (!mailQueueStore.sse.lastEventAt) return null;
		const diff = Math.round(
			(Date.now() - new Date(mailQueueStore.sse.lastEventAt).getTime()) / 1000
		);
		if (diff < 60) return `vor ${diff}s`;
		if (diff < 3600) return `vor ${Math.round(diff / 60)}min`;
		return `vor ${Math.round(diff / 3600)}h`;
	});

	const rateLast5min = $derived.by(() => {
		const cutoff = Date.now() - 5 * 60 * 1000;
		let c = 0;
		for (const r of mailQueueStore.rows) {
			try {
				if (new Date(r.received_at).getTime() >= cutoff) c++;
			} catch {
				// ignore parse errors
			}
		}
		return c;
	});

	const status = $derived.by(() => {
		if (!mailQueueStore.sse.connected) return 'disconnected';
		if (heartbeatRel) return 'running';
		return 'idle';
	});
	const statusColor = $derived(
		status === 'running' ? 'bg-emerald-500' : status === 'disconnected' ? 'bg-rose-500' : 'bg-zinc-400'
	);

	function close() {
		open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			close();
		}
	}

	// F.7-BUG-D Fix-1: click-outside-listener entfernt. Popover-Content ist
	// read-only (Status + Recent-Runs), explizite Close-Mechaniken ESC + Re-Click-
	// auf-Pill reichen. Vermeidet UX-Zerstörung wenn User andere Worker-related
	// Buttons (z.B. Validator-Button in WorkerRunPanel) klickt.
	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="relative" bind:this={rootEl}>
	<!-- Trigger: kompakter Status-Pill (immer 140px breit für Stabilität) -->
	<button
		type="button"
		class="flex w-[140px] items-center justify-between gap-2 rounded-xl border border-border bg-card shadow-sm px-3 py-2 hover:bg-muted transition-colors"
		onclick={() => (open = !open)}
		title={open ? 'Worker-Status schließen' : 'Worker-Status + Recent Runs anzeigen'}
	>
		<span class="flex items-center gap-2">
			<span class="inline-block h-2 w-2 rounded-full {statusColor}"></span>
			<span class="text-xs uppercase tracking-wider text-muted-foreground">Worker</span>
		</span>
		<span class="text-xs text-muted-foreground">{open ? '▴' : '▾'}</span>
	</button>

	{#if open}
		<!-- Popover: absolute, anchored bottom-right of trigger, z-50 (above FilterRows z-10) -->
		<div
			class="absolute right-0 top-full mt-2 w-[320px] max-h-[480px] overflow-auto rounded-xl border border-border bg-card shadow-2xl z-50"
			role="dialog"
			aria-label="Worker-Status + Recent Runs"
		>
			<div class="px-3 py-2 space-y-1 text-xs">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Status</span>
					<span class="font-medium">{status}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">SSE</span>
					<span class="font-medium">
						{mailQueueStore.sse.connected ? 'verbunden' : 'offline'}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Heartbeat</span>
					<span class="font-mono text-[11px]">{heartbeatRel ?? '—'}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Rate (5min)</span>
					<span class="font-mono text-[11px]">{rateLast5min}</span>
				</div>
				<!-- Direktive D: Validator wird vom Folio-Manager nach Worker-Ende
				     als separater Run gestartet (nicht mehr als Worker-Subprocess). -->
				<div class="flex justify-between">
					<span class="text-muted-foreground">Validator</span>
					<span
						class="font-medium text-emerald-700"
						title="Nach jedem UI-Worker-Run startet der Manager automatisch einen Validator-Run."
						>auto</span
					>
				</div>
			</div>
			<RecentRuns {runs} />
		</div>
	{/if}
</div>
