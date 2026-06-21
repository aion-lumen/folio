<!--
  F.9 BUG-K2 — Scope-Layer (Triage): Dropdown statt Inline-Pills.
  Klick öffnet Popover mit vertikaler Pill-Liste. Spart Horizontal-Raum
  wenn DetailPanel offen ist.
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
	const selectedLabel = $derived(
		selected === 'all' ? 'Alle' : ACCOUNTS[selected as AccountId]?.label ?? 'Alle'
	);
	const selectedCount = $derived(
		selected === 'all' ? allRowsCount : (countsByAccount[selected] ?? 0)
	);

	let open = $state(false);

	function pickAccount(id: AccountId | 'all'): void {
		mailQueueStore.setFilter('account', id);
		open = false;
	}

	function handleWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		const root = document.getElementById('scope-dropdown-root');
		if (root && !root.contains(target)) open = false;
	}

	function handleEsc(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleEsc} />

<div id="scope-dropdown-root" class="relative">
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors
			{selected !== 'all'
			? 'border-foreground bg-card text-foreground'
			: 'bg-primary text-primary-foreground border-primary'}"
		onclick={() => (open = !open)}
		aria-haspopup="true"
		aria-expanded={open}
	>
		{#if selected !== 'all'}
			<span
				class="inline-block h-2 w-2 rounded-full"
				class:bg-account-gmail={selected === 'gmail'}
				class:bg-account-yahoo={selected === 'yahoo'}
				class:bg-account-mirhamed={selected === 'mirhamed_ch'}
			></span>
		{/if}
		{selectedLabel}
		<span class="font-mono text-[10px] opacity-70">{selectedCount}</span>
		<span class="text-[10px] opacity-70">▾</span>
	</button>

	{#if open}
		<div
			class="absolute left-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-md py-1"
			style="min-width: 180px;"
			role="menu"
		>
			<button
				type="button"
				class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted
					{selected === 'all' ? 'font-semibold' : ''}"
				onclick={() => pickAccount('all')}
			>
				<span>Alle</span>
				<span class="font-mono text-[10px] opacity-70">{allRowsCount}</span>
			</button>
			{#each ACCOUNT_IDS as id}
				{@const acc = ACCOUNTS[id]}
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted
						{selected === id ? 'font-semibold' : ''}"
					onclick={() => pickAccount(id)}
				>
					<span class="flex items-center gap-1.5">
						<span
							class="inline-block h-2 w-2 rounded-full"
							class:bg-account-gmail={id === 'gmail'}
							class:bg-account-yahoo={id === 'yahoo'}
							class:bg-account-mirhamed={id === 'mirhamed_ch'}
						></span>
						{acc.label}
					</span>
					<span class="font-mono text-[10px] opacity-70">{countsByAccount[id] ?? 0}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
