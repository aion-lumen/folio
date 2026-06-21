<!--
  F.9 BUG-K2 — Filter-Disclosure: Button mit Badge (Anzahl aktiver Filter) +
  Popover mit 3 Sections (Domain-Chips, Aktion-Chips, Status-Toggles).
  Sofort-Persist on chip-toggle (kein Apply-Button). Reset-Knopf im Footer
  setzt nur die in diesem Popover gesetzten Filter zurück (nicht Account).
-->
<script lang="ts">
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import {
		DOMAIN_KEYS,
		DOMAIN_LABELS,
		DOMAIN_CLASS,
		ACTIONABILITY_UI_KEYS,
		ACTIONABILITY_LABELS,
		ACTIONABILITY_ICONS,
		ACTION_LABELS,
		type DomainKey,
		type ActionabilityKey
	} from '$lib/util/mail-account.js';

	let { compact = false }: { compact?: boolean } = $props();

	// 5-action legacy filter values (subset of what mailQueueStore.filters.actions stores).
	const ACTION_VALUES = ['keep', 'move_immo_portal', 'move_immo_privat', 'move_paketzustellung', 'move_zu_pruefen'];

	let open = $state(false);

	const filters = $derived(mailQueueStore.filters);

	// Count active filter "dimensions" for the badge. Domain + Aktion + Status (each
	// non-default toggle/multi-select counts once). Account is NOT counted here —
	// account lives in the scope layer. Default actionabilityLevels = [] (all levels).
	const activeCount = $derived(
		(filters.domains.length > 0 ? 1 : 0) +
		(filters.actions.length > 0 ? 1 : 0) +
		(filters.disagreementOnly ? 1 : 0) +
		(filters.unreviewedOnly ? 1 : 0) +
		(filters.validatorOnly ? 1 : 0) +
		(filters.recentImportedOnly ? 1 : 0) +
		(filters.senderFilter != null ? 1 : 0) +
		(filters.actionabilityLevels.length > 0 ? 1 : 0)
	);

	function toggleDomain(d: DomainKey): void {
		const cur = filters.domains;
		const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
		mailQueueStore.setFilter('domains', next);
	}

	function toggleActionability(a: ActionabilityKey): void {
		const cur = filters.actionabilityLevels;
		const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a];
		mailQueueStore.setFilter('actionabilityLevels', next);
	}

	function toggleAction(v: string): void {
		const cur = filters.actions;
		const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
		mailQueueStore.setFilter('actions', next);
	}

	function reset(): void {
		mailQueueStore.setFilter('domains', []);
		mailQueueStore.setFilter('actions', []);
		mailQueueStore.setFilter('actionabilityLevels', []);
		mailQueueStore.setFilter('disagreementOnly', false);
		mailQueueStore.setFilter('unreviewedOnly', false);
		mailQueueStore.setFilter('validatorOnly', false);
		mailQueueStore.setFilter('recentImportedOnly', false);
		mailQueueStore.setFilter('senderFilter', null);
	}

	function handleWindowClick(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		const root = document.getElementById('filter-disclosure-root');
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

<div id="filter-disclosure-root" class="relative">
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:bg-muted
			{activeCount > 0 ? 'text-foreground border-foreground' : 'text-muted-foreground hover:text-foreground'}
			{open ? 'bg-muted' : ''}"
		onclick={() => (open = !open)}
		aria-haspopup="dialog"
		aria-expanded={open}
		title="Filter"
	>
		<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
			<path d="M2 3 h12 l-4.5 5.5 v4 l-3 1.5 v-5.5 z" />
		</svg>
		{#if !compact}<span>Filter</span>{/if}
		{#if activeCount > 0}
			<span class="rounded-full bg-foreground text-background font-mono text-[10px] px-1.5 py-0.5 leading-none">
				{activeCount}
			</span>
		{/if}
		<span class="text-[10px] opacity-70">▾</span>
	</button>

	{#if open}
		<div
			class="absolute right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-md"
			style="width: 380px; max-height: 70vh; overflow-y: auto;"
			role="dialog"
			aria-label="Filter-Optionen"
		>
			<!-- Domain section -->
			<div class="border-b border-border px-3 py-3 space-y-2">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Domain</div>
				<div class="flex flex-wrap gap-1.5">
					{#each DOMAIN_KEYS as d}
						{@const cls = DOMAIN_CLASS[d]}
						{@const active = filters.domains.includes(d)}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors
								{active
								? `${cls.bg} ${cls.fg} border-current`
								: 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'}"
							onclick={() => toggleDomain(d)}
						>
							<span class="h-1.5 w-1.5 rounded-full {cls.dot}"></span>
							{DOMAIN_LABELS[d]}
						</button>
					{/each}
				</div>
			</div>

			<!-- Actionability section -->
			<div class="border-b border-border px-3 py-3 space-y-2">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Actionability</div>
				<div class="flex flex-wrap gap-1.5">
					{#each ACTIONABILITY_UI_KEYS as a}
						{@const active = filters.actionabilityLevels.includes(a)}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors
								{active
								? 'bg-primary text-primary-foreground border-primary'
								: 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'}"
							onclick={() => toggleActionability(a)}
						>
							<span>{ACTIONABILITY_ICONS[a]}</span>
							{ACTIONABILITY_LABELS[a]}
						</button>
					{/each}
				</div>
				<p class="text-[10px] text-muted-foreground italic">Default = nur Actionable. Reset stellt das wieder her.</p>
			</div>

			<!-- Aktion (legacy 5-action) section -->
			<div class="border-b border-border px-3 py-3 space-y-2">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Aktion (legacy)</div>
				<div class="flex flex-wrap gap-1.5">
					{#each ACTION_VALUES as v}
						{@const active = filters.actions.includes(v)}
						<button
							type="button"
							class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors
								{active
								? 'bg-foreground text-background border-foreground'
								: 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'}"
							onclick={() => toggleAction(v)}
						>
							{ACTION_LABELS[v] ?? v}
						</button>
					{/each}
				</div>
			</div>

			<!-- Status & Validator toggles -->
			<div class="border-b border-border px-3 py-3 space-y-1">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Status &amp; Validator</div>
				<label class="flex items-center justify-between gap-2 cursor-pointer text-xs py-1 hover:bg-muted px-1 rounded">
					<span>Nur ungelesen</span>
					<input
						type="checkbox"
						checked={filters.unreviewedOnly}
						onchange={(e) => mailQueueStore.setFilter('unreviewedOnly', (e.currentTarget as HTMLInputElement).checked)}
					/>
				</label>
				<label class="flex items-center justify-between gap-2 cursor-pointer text-xs py-1 hover:bg-muted px-1 rounded">
					<span>Nur mit Validator-Opinion</span>
					<input
						type="checkbox"
						checked={filters.validatorOnly}
						onchange={(e) => mailQueueStore.setFilter('validatorOnly', (e.currentTarget as HTMLInputElement).checked)}
					/>
				</label>
				<label class="flex items-center justify-between gap-2 cursor-pointer text-xs py-1 hover:bg-muted px-1 rounded">
					<span>Nur Disagreements (Heuristik ≠ User)</span>
					<input
						type="checkbox"
						checked={filters.disagreementOnly}
						onchange={(e) => mailQueueStore.setFilter('disagreementOnly', (e.currentTarget as HTMLInputElement).checked)}
					/>
				</label>
				<label class="flex items-center justify-between gap-2 cursor-pointer text-xs py-1 hover:bg-muted px-1 rounded">
					<span>Zuletzt importiert <span class="text-muted-foreground">(letzte 1h)</span></span>
					<input
						type="checkbox"
						checked={filters.recentImportedOnly}
						onchange={(e) => mailQueueStore.setFilter('recentImportedOnly', (e.currentTarget as HTMLInputElement).checked)}
					/>
				</label>
			</div>

			<!-- Footer with reset + active-count -->
			<div class="flex items-center justify-between px-3 py-2">
				<button
					type="button"
					class="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
					onclick={reset}
				>Zurücksetzen</button>
				<span class="text-[10px] text-muted-foreground">
					<span class="font-mono font-semibold text-foreground">{activeCount}</span> Filter aktiv
				</span>
			</div>
		</div>
	{/if}
</div>
