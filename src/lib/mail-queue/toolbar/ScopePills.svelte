<!--
  F.9 BUG-K2 — Scope-Layer (Browsing): Inline-Pills "Alle / gmail / yahoo / mirhamed.ch".
  Active = farblich gefüllt mit Account-Color (Design-Regel A "Form folgt Lebenszyklus").
  Counts pro Account inline. Triage-Variante ist ScopeDropdown.
-->
<script lang="ts">
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import { ACCOUNTS, ACCOUNT_IDS, type AccountId } from '$lib/util/mail-account.js';

	let {
		countsByAccount,
		allRowsCount
	}: {
		countsByAccount: Record<string, number>;
		allRowsCount: number;
	} = $props();

	const selected = $derived(mailQueueStore.filters.account);

	function pickAccount(id: AccountId | 'all'): void {
		mailQueueStore.setFilter('account', id);
	}
</script>

<div class="flex items-center gap-1">
	<!-- "Alle" pill -->
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors
			{selected === 'all'
			? 'bg-primary text-primary-foreground border-primary'
			: 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'}"
		onclick={() => pickAccount('all')}
	>
		Alle
		<span class="font-mono text-[10px] opacity-70">{allRowsCount}</span>
	</button>

	<!-- Per-Account pills -->
	{#each ACCOUNT_IDS as id}
		{@const acc = ACCOUNTS[id]}
		{@const isActive = selected === id}
		<button
			type="button"
			class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors
				{isActive
				? 'border-foreground bg-card text-foreground'
				: 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'}"
			onclick={() => pickAccount(id)}
			title={acc.label}
		>
			<span
				class="inline-block h-2 w-2 rounded-full"
				class:bg-account-gmail={id === 'gmail'}
				class:bg-account-yahoo={id === 'yahoo'}
				class:bg-account-mirhamed={id === 'mirhamed_ch'}
			></span>
			{acc.label}
			<span class="font-mono text-[10px] opacity-70">{countsByAccount[id] ?? 0}</span>
		</button>
	{/each}
</div>
