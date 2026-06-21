<!--
  Direktive 3 (pipeline-minimal) — tagesgruppierter Verlauf.
  4 Buckets: Heute / Gestern / Diese Woche / Älter. Empty-Buckets skipped.
  Pro Zeile: status-icon · Zeit · mode · Account · mails · Dauer.
  Board-Spalte raus (Direktive: Board nicht mehr user-facing seit Cleanup).
-->
<script lang="ts">
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

	let { runs }: { runs: WorkerRunRow[] } = $props();

	type BucketKey = 'today' | 'yesterday' | 'week' | 'older';
	const BUCKET_LABEL: Record<BucketKey, string> = {
		today: 'Heute',
		yesterday: 'Gestern',
		week: 'Diese Woche',
		older: 'Älter'
	};
	const BUCKET_ORDER: BucketKey[] = ['today', 'yesterday', 'week', 'older'];

	function bucketOf(iso: string): BucketKey {
		const now = new Date();
		const d = new Date(iso);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 86400000);
		const weekAgo = new Date(today.getTime() - 7 * 86400000);
		if (d >= today) return 'today';
		if (d >= yesterday) return 'yesterday';
		if (d >= weekAgo) return 'week';
		return 'older';
	}

	const grouped = $derived.by(() => {
		const out: Record<BucketKey, WorkerRunRow[]> = {
			today: [],
			yesterday: [],
			week: [],
			older: []
		};
		for (const r of runs) {
			out[bucketOf(r.started_at)].push(r);
		}
		return out;
	});

	function fmtTime(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleString('de-CH', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso;
		}
	}
	function fmtDayTime(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleString('de-CH', {
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}
	function fmtDuration(start: string, end: string | null): string {
		if (!end) return '...';
		try {
			const dur = new Date(end).getTime() - new Date(start).getTime();
			const min = Math.floor(dur / 60000);
			const sec = Math.floor((dur % 60000) / 1000);
			return min > 0 ? `${min}m${sec}s` : `${sec}s`;
		} catch {
			return '?';
		}
	}
	function statusIcon(status: string): string {
		if (status === 'completed') return '✓';
		if (status === 'failed') return '✗';
		if (status === 'cancelled') return '⊘';
		if (status === 'running') return '●';
		return '○';
	}
	function statusClass(status: string): string {
		if (status === 'completed') return 'text-emerald-600';
		if (status === 'failed') return 'text-rose-500';
		if (status === 'cancelled') return 'text-amber-500';
		if (status === 'running') return 'text-blue-500 animate-pulse';
		return 'text-muted-foreground';
	}
</script>

{#if runs.length === 0}
	<div class="px-4 py-3 text-xs text-muted-foreground italic">Noch keine Runs.</div>
{:else}
	<div class="recent-grouped">
		{#each BUCKET_ORDER as key}
			{@const items = grouped[key]}
			{#if items.length > 0}
				<section class="bucket">
					<header class="bucket-head">
						<span class="bucket-label">{BUCKET_LABEL[key]}</span>
						<span class="bucket-count">{items.length}</span>
					</header>
					<ul class="bucket-list">
						{#each items as r (r.run_uuid)}
							<li class="run-row">
								<span class="ico {statusClass(r.status)}" title={r.status}>{statusIcon(r.status)}</span>
								<span class="time">{key === 'today' || key === 'yesterday' ? fmtTime(r.started_at) : fmtDayTime(r.started_at)}</span>
								<span class="mode">{r.mode}</span>
								<span class="account">{r.account}</span>
								<span class="mails">
									{#if r.mode === 'validator'}
										{r.mails_processed} mails
									{:else}
										{r.mails_processed}/{r.tranche_size}
									{/if}
								</span>
								<span class="duration">{fmtDuration(r.started_at, r.ended_at)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.recent-grouped {
		display: flex;
		flex-direction: column;
	}
	.bucket + .bucket {
		border-top: 1px solid var(--color-border);
	}
	.bucket-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 8px 16px 6px;
		background: hsl(210 25% 96%);
		border-bottom: 1px dashed var(--color-border);
	}
	.bucket-label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.bucket-count {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--color-muted-foreground);
	}
	.bucket-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.run-row {
		display: grid;
		grid-template-columns: 18px 70px 90px 90px 1fr 60px;
		align-items: center;
		gap: 8px;
		padding: 6px 16px;
		font-size: 11.5px;
		color: var(--color-foreground);
	}
	.run-row + .run-row {
		border-top: 1px dashed var(--color-border);
	}
	.ico {
		font-family: var(--font-mono);
		font-size: 11px;
		text-align: center;
	}
	.time {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-muted-foreground);
	}
	.mode {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
	}
	.account {
		font-family: var(--font-mono);
		font-size: 10.5px;
	}
	.mails {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
	}
	.duration {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		text-align: right;
	}

	@media (max-width: 640px) {
		.run-row {
			grid-template-columns: 18px 1fr auto;
			gap: 6px;
		}
		.mode, .account, .mails {
			display: none;
		}
	}
</style>
