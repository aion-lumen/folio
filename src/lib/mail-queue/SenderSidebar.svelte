<!--
  F.4.D SenderSidebar — Top-N Sender mit Frequency-Bar + Account-Cross-Reference (Build-Spec §4 Komp.6).
-->
<script lang="ts">
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import { topSenders } from '$lib/util/mail-sender.js';
	import { ACCOUNT_CLASS } from '$lib/util/mail-account.js';

	const TOP_N = 20;

	const senders = $derived(topSenders(mailQueueStore.rows, TOP_N));
	const maxCount = $derived(senders[0]?.count ?? 1);
	const uniqueTotal = $derived(mailQueueStore.uniqueSenderCount);

	function pickSender(addr: string): void {
		mailQueueStore.setFilter('senderFilter', addr);
	}

	function clearSender(): void {
		mailQueueStore.setFilter('senderFilter', null);
	}

	const senderFilterActive = $derived(mailQueueStore.filters.senderFilter);
</script>

<div class="rounded-xl border border-border bg-card overflow-hidden">
	<div class="flex items-center justify-between border-b border-border px-3 py-2">
		<span class="text-xs uppercase tracking-wider text-muted-foreground">Top-Sender</span>
		<span class="text-xs text-muted-foreground">
			{uniqueTotal} Sender
		</span>
	</div>

	{#if senderFilterActive}
		<div class="border-b border-border bg-muted px-3 py-2 text-xs">
			<span class="text-muted-foreground">Filter aktiv:</span>
			<span class="font-mono">{senderFilterActive}</span>
			<button
				type="button"
				class="ml-2 underline text-muted-foreground hover:text-foreground"
				onclick={clearSender}
			>
				Reset
			</button>
		</div>
	{/if}

	{#if senders.length === 0}
		<div class="px-3 py-4 text-sm text-muted-foreground">Keine Sender mit aktuellen Filtern.</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each senders as s, i}
				{@const pct = Math.max(8, Math.round((s.count / maxCount) * 100))}
				<li>
					<button
						type="button"
						class="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted transition-colors"
						onclick={() => pickSender(s.from_addr)}
						title="Filter auf {s.domain}"
					>
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5 min-w-0">
								{#if i < 2}
									<span class="text-[10px] font-mono text-muted-foreground" style="min-width: 14px;">
										#{i + 1}
									</span>
								{/if}
								<span class="truncate text-xs font-mono" title={s.from_addr}>
									{s.domain}
								</span>
							</span>
							<span class="text-xs font-mono font-medium">{s.count}</span>
						</div>
						<div class="flex items-center gap-2">
							<!-- Frequency bar -->
							<span class="block h-1 flex-1 rounded-full bg-muted overflow-hidden">
								<span
									class="block h-full rounded-full bg-foreground/60"
									style="width: {pct}%;"
								></span>
							</span>
							<!-- Account-Cross-Reference Dots -->
							<span class="flex items-center gap-0.5">
								{#each s.accountIds as aid}
									<span
										class="h-1.5 w-1.5 rounded-full {ACCOUNT_CLASS[aid].dot}"
										title={aid}
									></span>
								{/each}
							</span>
							{#if s.disagreementCount > 0}
								<span
									class="text-[10px] font-mono"
									style="color: var(--color-lumen-warm);"
									title="{s.disagreementCount} Disagreements"
								>
									≠{s.disagreementCount}
								</span>
							{/if}
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
