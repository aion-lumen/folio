<!--
  F.4.C: Layout-Composition + Store-Hydration + SSE-Lifecycle.
  Server-Load returnt rows/filters/counts; Component-Tree liest aus mailQueueStore.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import MailToolbar from '$lib/mail-queue/toolbar/MailToolbar.svelte';
	import MailList from '$lib/mail-queue/MailList.svelte';
	import DetailPanel from '$lib/mail-queue/DetailPanel.svelte';
	import SenderSidebar from '$lib/mail-queue/SenderSidebar.svelte';
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import { mailDetailStore } from '$lib/stores/mailDetail.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	// F.9 Block-2: Worker-/Validator-UI verlässt mail-queue komplett. Substanz lebt
	// auf /pipeline. BUG-J strukturell gelöst — DetailPanel und Worker-State teilen
	// nie wieder denselben Layer. Worker-Pille im Activity-Bar zeigt globalen Status.

	let { data } = $props();

	// Hydrate store immediately (SSR + client). $effect would only fire client-side,
	// leaving SSR-render with empty rows. Direct top-level mutation is OK because
	// SvelteKit SSR is request-scoped — module-state is fresh per request.
	mailQueueStore.hydrate(data.rows, data.filters);

	// Re-hydrate on subsequent data-changes (invalidateAll-driven refetches)
	$effect(() => {
		mailQueueStore.hydrate(data.rows, data.filters);
	});

	onMount(() => {
		mailQueueStore.startSSE();
	});
	onDestroy(() => {
		mailQueueStore.stopSSE();
	});
</script>

<svelte:head>
	<title>Folio · Mail-Queue</title>
</svelte:head>

<div class="flex h-screen flex-col bg-background text-foreground">
	<!-- F.9 BUG-K2: Konsolidierte Toolbar — eine Zeile, Scope + Stats + Filter + Sort.
	     Triage-Mode (Detail offen) komprimiert Scope zu Dropdown + Filter/Sort zu icon-only.
	     Ersetzt AccountFilterRow + ActionFilterRow + FilterIndicator. -->
	<MailToolbar
		countsByAccount={data.countsByAccount}
		allRowsCount={data.allRowsCount}
	/>

	<!-- F.4.F: 3-Modus-Grid (Permanent-Side-Panel-Pattern).
	     Modus A (kein Row ausgewählt): MailList col-9 + SenderSidebar col-3
	     Modus B (Row ausgewählt):       MailList col-6 + DetailPanel col-6  -->
	<div class="grid flex-1 grid-cols-12 gap-4 overflow-hidden p-4 transition-all duration-200">
		{#if mailDetailStore.selectedUid != null}
			<section class="col-span-6 overflow-hidden">
				<MailList />
			</section>
			<section class="col-span-6 overflow-hidden">
				<DetailPanel />
			</section>
		{:else}
			<section class="col-span-9 overflow-hidden">
				<MailList />
			</section>
			<aside class="col-span-3 overflow-auto">
				<SenderSidebar />
			</aside>
		{/if}
	</div>

	<!-- F.9 Block-2: WorkerRunPanel + WorkerPanel entfernt, wandern auf /pipeline.
	     ActivityBar.WorkerPill zeigt globalen Pipeline-Status. -->

	<!-- Toast notifications (F.4.C SSE-Events) -->
	{#if toastStore.message}
		<div class="fixed bottom-4 right-4 z-30 rounded-md border border-border bg-card px-4 py-2 shadow-md">
			<span class="text-sm">{toastStore.message}</span>
		</div>
	{/if}
</div>
