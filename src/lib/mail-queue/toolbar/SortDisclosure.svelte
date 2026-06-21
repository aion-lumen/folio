<!--
  F.9 BUG-K2 — Sort-Disclosure: Button mit aktueller Sort-Bezeichnung im Label +
  Popover mit 6 separaten Sort-Items (Architekt-Q3: separate Items pro Richtung).
-->
<script lang="ts">
	import { mailQueueStore, SORT_OPTIONS, type SortBy } from '$lib/stores/mailQueue.svelte.js';

	let { compact = false }: { compact?: boolean } = $props();

	let open = $state(false);

	const current = $derived(mailQueueStore.filters.sortBy);
	const currentOption = $derived(SORT_OPTIONS.find((o) => o.value === current) ?? SORT_OPTIONS[0]);

	function pick(value: SortBy): void {
		mailQueueStore.setFilter('sortBy', value);
		open = false;
	}

	function handleWindowClick(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		const root = document.getElementById('sort-disclosure-root');
		if (root && !root.contains(t)) open = false;
	}

	function handleEsc(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleEsc} />

<div id="sort-disclosure-root" class="relative">
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground hover:bg-muted
			{open ? 'bg-muted' : ''}"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Sortierung"
	>
		<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
			<path d="M4 4 v9 M2 11 l2 2 l2-2 M12 12 v-9 M10 5 l2-2 l2 2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		{#if compact}
			<span class="font-mono">{currentOption.arrow}</span>
		{:else}
			<span>Sort:</span>
			<span class="text-foreground">{currentOption.label} <span class="font-mono">{currentOption.arrow}</span></span>
		{/if}
		<span class="text-[10px] opacity-70">▾</span>
	</button>

	{#if open}
		<div
			class="absolute right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-md py-1"
			style="min-width: 220px;"
			role="menu"
		>
			{#each SORT_OPTIONS as opt}
				{@const isActive = current === opt.value}
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted
						{isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}"
					onclick={() => pick(opt.value)}
					role="menuitem"
				>
					<span class="flex items-center gap-2">
						<span class="w-3 text-foreground">{isActive ? '✓' : ''}</span>
						<span>{opt.label}</span>
					</span>
					<span class="font-mono opacity-70">{opt.arrow}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
