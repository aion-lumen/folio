<!--
  F.9 BUG-K2 — Search-Slot: Visual-Stub. Search-Backend kommt in v0.2.
  Klick zeigt nur einen Toast, damit der Slot konsistent mit dem Design-Mockup
  steht aber kein halbes Feature implementiert wird.
-->
<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte.js';

	let { compact = false }: { compact?: boolean } = $props();

	function onClick(): void {
		toastStore.show('Mail-Suche kommt in v0.2', 2200);
	}
</script>

<button
	type="button"
	class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
	onclick={onClick}
	title="Mail-Suche (kommt in v0.2)"
>
	<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
		<circle cx="7" cy="7" r="5" />
		<path d="M11 11 l3 3" stroke-linecap="round" />
	</svg>
	{#if !compact}
		<span>Mail suchen</span>
		<span class="font-mono text-[10px] opacity-60 border border-border rounded px-1 py-0.5">⌘ K</span>
	{/if}
</button>
