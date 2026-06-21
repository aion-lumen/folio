<!--
  Mobile 1c (2026-05-30): zeigt die noch unprozessierten pending_ingest-rows
  unter der LinkInputBox. Polling-Intervall im parent steuert refresh; hier
  nur Darstellung mit ETA bis nächster 4h-Tick (heuristisch — Worker-Lauf
  hängt am launchd-Schedule, exakte Zeit ist nicht abrufbar).
-->
<script lang="ts">
	import type { PendingIngestRow } from '$lib/server/folio-db/types.js';

	let { rows }: { rows: PendingIngestRow[] } = $props();

	function hostOf(u: string): string {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return u.slice(0, 40);
		}
	}

	function pathSnippet(u: string): string {
		try {
			const url = new URL(u);
			const p = url.pathname + url.search;
			return p.length > 28 ? p.slice(0, 28) + '…' : p;
		} catch {
			return '';
		}
	}

	// ETA bis zum nächsten 4h-Tick (00:00, 04:00, 08:00, 12:00, 16:00, 20:00).
	// Heuristik, weil launchd-Schedule nicht via Browser abrufbar.
	function etaUntilNextTick(submittedAt: string): string {
		const submitted = new Date(submittedAt);
		const now = new Date();
		const hour = now.getHours();
		const nextTickHour = Math.ceil((hour + 1) / 4) * 4;
		const nextTick = new Date(now);
		if (nextTickHour >= 24) {
			nextTick.setDate(nextTick.getDate() + 1);
			nextTick.setHours(0, 0, 0, 0);
		} else {
			nextTick.setHours(nextTickHour, 0, 0, 0);
		}
		const diffMs = nextTick.getTime() - now.getTime();
		const h = Math.floor(diffMs / (60 * 60 * 1000));
		const m = Math.round((diffMs % (60 * 60 * 1000)) / (60 * 1000));
		if (h <= 0) return `~${m}min`;
		return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
	}
</script>

{#if rows.length > 0}
	<div class="pending-list" aria-label="Pending Ingest">
		{#each rows as r (r.id)}
			<div class="row">
				<span class="pulse-dot" aria-hidden="true"></span>
				<span class="host">{hostOf(r.url)}</span>
				<span class="snippet">{pathSnippet(r.url)}</span>
				<span class="eta">· wird bewertet · nächster Lauf in {etaUntilNextTick(r.submitted_at)}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.pending-list {
		margin-top: 8px;
		padding: 8px 12px;
		background: hsl(222 47% 14%);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: var(--text-xs, 10.5px);
		color: hsl(210 30% 78%);
		flex-wrap: wrap;
	}
	.pulse-dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		background: var(--color-lumen, hsl(32 100% 60%));
		box-shadow: 0 0 0 3px hsl(32 100% 60% / 0.25);
		flex-shrink: 0;
		animation: pulse 1.8s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.45; }
	}
	.host {
		color: white;
		font-weight: 500;
	}
	.snippet {
		opacity: 0.7;
	}
	.eta {
		opacity: 0.7;
	}
</style>
