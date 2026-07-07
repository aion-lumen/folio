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
		triageTodayByDomain?: Record<string, number>;
		triageTodayActionable?: Array<{
			domain: string;
			sender: string;
			subject: string;
			actionability: string;
		}>;
	}

	let { stats }: { stats: MailStats } = $props();

	const accountEntries = $derived(
		Object.entries(stats.unreviewedByAccount).sort(([, a], [, b]) => b - a)
	);

	const domainEntries = $derived(
		Object.entries(stats.triageTodayByDomain ?? {}).sort(([, a], [, b]) => b - a)
	);

	const actionableToday = $derived(stats.triageTodayActionable ?? []);
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
		{#if domainEntries.length > 0}
			<div class="triage-section">
				<p class="section-label">Heute triagiert</p>
				<ul class="domain-list">
					{#each domainEntries as [domain, count]}
						<li>
							<span class="domain-name">{domain}</span>
							<span class="domain-count">{count}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if actionableToday.length > 0}
			<div class="triage-section">
				<p class="section-label">Actionable heute</p>
				<ul class="actionable-list">
					{#each actionableToday as item}
						<li>
							<span class="action-domain">{item.domain}</span>
							<span class="action-subject" title={item.subject}>{item.subject}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
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

	.triage-section {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--color-border);
	}
	.section-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted-foreground);
		margin: 0 0 6px;
	}
	.domain-list,
	.actionable-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.domain-list li,
	.actionable-list li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--color-muted-foreground);
	}
	.domain-count { color: var(--color-foreground); }
	.actionable-list li {
		flex-direction: column;
		align-items: flex-start;
	}
	.action-domain {
		font-size: 10px;
		text-transform: uppercase;
		color: var(--color-lumen-warm, hsl(28 92% 58%));
	}
	.action-subject {
		font-size: 12px;
		color: var(--color-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
