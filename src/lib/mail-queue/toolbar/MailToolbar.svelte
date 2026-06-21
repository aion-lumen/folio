<!--
  F.9 BUG-K2 — Konsolidierte Mail-Queue-Toolbar.
  Eine Zeile, zwei Schichten:
    Scope-Layer (Account)  —  immer sichtbar
    Refinement-Layer (Filter + Sort)  —  in zwei Disclosure-Buttons rechts
  Plus klickbares Disagreement-Stat als Shortcut.
  Browsing vs Triage: Triage = compact (Scope als Dropdown, Filter+Sort icon-only).
  Triage-Trigger = mailDetailStore.selectedUid != null.
  Ersetzt AccountFilterRow + ActionFilterRow + FilterIndicator (alle 3 entfernt).
-->
<script lang="ts">
	import { mailDetailStore } from '$lib/stores/mailDetail.svelte.js';
	import ScopePills from './ScopePills.svelte';
	import ScopeDropdown from './ScopeDropdown.svelte';
	import InlineStats from './InlineStats.svelte';
	import SearchSlot from './SearchSlot.svelte';
	import FilterDisclosure from './FilterDisclosure.svelte';
	import SortDisclosure from './SortDisclosure.svelte';

	let {
		countsByAccount,
		allRowsCount
	}: {
		countsByAccount: Record<string, number>;
		allRowsCount: number;
	} = $props();

	// Triage-Mode = DetailPanel offen → Scope wird zu Dropdown, Filter/Sort icon-only.
	// Container-Width-Observer als zusätzlicher Trigger ist für späteren Iteration —
	// die Detail-Open-Heuristik deckt den primären UX-Engpass schon ab.
	const triage = $derived(mailDetailStore.selectedUid != null);
</script>

<div
	class="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background px-4 py-2"
>
	<!-- Scope-Layer -->
	{#if triage}
		<ScopeDropdown {countsByAccount} {allRowsCount} />
	{:else}
		<ScopePills {countsByAccount} {allRowsCount} />
	{/if}

	<!-- Konsequenz-Layer (Stats) -->
	<InlineStats />

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- Search-Slot (Visual-Stub) -->
	<SearchSlot compact={triage} />

	<!-- Refinement-Layer -->
	<FilterDisclosure compact={triage} />
	<SortDisclosure compact={triage} />
</div>
