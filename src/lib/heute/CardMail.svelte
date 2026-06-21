<!--
  F.9 Block-4 — Mail-Card im Heute-Hub.
  Zeigt Mail-Audit-Status: ungelesene Mails pro Account.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Inbox, ArrowRight } from 'lucide-svelte';

	interface MailStats {
		total: number;
		unreviewed: number;
		unreviewedByAccount: Record<string, number>;
	}

	let { stats }: { stats: MailStats } = $props();

	const accountEntries = $derived(
		Object.entries(stats.unreviewedByAccount).sort(([, a], [, b]) => b - a)
	);
</script>

<button class="card" type="button" onclick={() => goto('/mail-queue')}>
	<header class="card-head">
		<Inbox size={18} class="icon" />
		<span class="title">Mail-Audit</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if stats.total === 0}
		<p class="primary muted">Noch keine Mails</p>
		<p class="hint">Starte einen Worker-Run auf /pipeline um Yahoo-IMAP zu indexieren.</p>
	{:else}
		<p class="primary">
			<span class="counter">{stats.unreviewed}</span>
			<span class="counter-suffix">ungelesen</span>
			<span class="counter-total">von {stats.total}</span>
		</p>
		{#if accountEntries.length > 0}
			<ul class="account-list">
				{#each accountEntries as [acct, count]}
					<li>
						<span class="acct-name">{acct === 'mirhamed_ch' ? 'mirhamed' : acct}</span>
						<span class="acct-count">{count}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">Alles gelesen — schöne Inbox.</p>
		{/if}
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
		font-size: 14px;
		margin: 4px 0 4px;
		display: flex;
		align-items: baseline;
		gap: 8px;
		color: var(--color-foreground);
	}
	.primary.muted {
		font-size: 18px;
		color: var(--color-muted-foreground);
	}
	.counter {
		font-size: 22px;
		font-weight: 600;
		color: var(--color-lumen-warm, hsl(28 92% 58%));
	}
	.counter-suffix {
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.counter-total {
		font-size: 11px;
		color: var(--color-muted-foreground);
		opacity: 0.7;
	}

	.account-list {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.account-list li {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--color-muted-foreground);
	}
	.acct-count { color: var(--color-foreground); }

	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
