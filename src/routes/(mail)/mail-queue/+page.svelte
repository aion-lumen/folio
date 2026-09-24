<!--
  F.4.C: Layout-Composition + Store-Hydration + SSE-Lifecycle.
  Server-Load returnt rows/filters/counts; Component-Tree liest aus mailQueueStore.
-->
<script lang="ts">
	import { page } from '$app/state';
 import { MAIL_WORK_LABELS } from '$lib/util/mail-work-status.js';
 import { onMount, onDestroy, untrack } from 'svelte';
	import MailToolbar from '$lib/mail-queue/toolbar/MailToolbar.svelte';
	import MailList from '$lib/mail-queue/MailList.svelte';
	import MailSummaryList from '$lib/mail-queue/MailSummaryList.svelte';
	import DetailPanel from '$lib/mail-queue/DetailPanel.svelte';
	import SenderSidebar from '$lib/mail-queue/SenderSidebar.svelte';
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import { mailDetailStore } from '$lib/stores/mailDetail.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	// F.9 Block-2: Worker-/Validator-UI verlässt mail-queue komplett. Substanz lebt
	// auf /pipeline. BUG-J strukturell gelöst — DetailPanel und Worker-State teilen
	// nie wieder denselben Layer. Worker-Pille im Activity-Bar zeigt globalen Status.

	let { data } = $props();
 function workHref(state:string){const params=new URLSearchParams(page.url.searchParams);if(state==='all')params.delete('work');else params.set('work',state);return `${page.url.pathname}?${params}`;}

	// Initial synchronous hydration; subsequent navigation is handled below.
 // Do not await between hydrating and rendering this shared client store.
 untrack(()=>mailQueueStore.hydrate(data.rows, data.filters));

	// Re-hydrate on subsequent data-changes (invalidateAll-driven refetches)
	$effect(() => {
		mailQueueStore.hydrate(data.rows, data.filters);
	});

	$effect(() => {
		const id = data.selectedFeedbackId;
		const row = id ? data.rows.find((r: {uid:string}) => r.uid === String(id)) : null;
		if (row) untrack(() => mailDetailStore.open(row.uid, row));
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

{#if data.sourceAvailable===false}<p role="status" class="p-4 text-sm text-muted-foreground">Noch keine Mailquelle eingelesen. Die leere Ansicht bestätigt keinen abgeschlossenen Import.</p>{/if}
<div class="mail-workspace flex flex-col bg-background text-foreground" class:detail-open={mailDetailStore.selectedUid != null}>
 {#if data.unregisteredAccounts.length > 0}
  <div role="status" class="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
   {#each data.unregisteredAccounts as account}
    <p>{account === 'unassigned' ? 'Mails ohne Kontozuordnung' : `Konto ${account}`}: in den Daten vorhanden, nicht registriert – kein Abruf.</p>
   {/each}
   <p>Kontoregistrierung prüfen. Vorhandene Mails bleiben erhalten.</p>
  </div>
 {/if}
	<!-- F.9 BUG-K2: Konsolidierte Toolbar — eine Zeile, Scope + Stats + Filter + Sort.
	     Triage-Mode (Detail offen) komprimiert Scope zu Dropdown + Filter/Sort zu icon-only.
	     Ersetzt AccountFilterRow + ActionFilterRow + FilterIndicator. -->
	<MailToolbar
		countsByAccount={data.countsByAccount}
		allRowsCount={data.allRowsCount}
	/>

 <nav class="work-filters" aria-label="Mail-Bearbeitung">
  {#if data.selectedFeedbackId}<a href="/mail-queue">← Alle Mails</a>{/if}
  {#each Object.entries({all:'Alle Mails',...MAIL_WORK_LABELS}) as [key,label]}
   <a href={workHref(key)} aria-current={data.workFilter===key?'page':undefined} title={key==='technical'?'Lokale Verarbeitung offen, keine pauschale Nutzeraufgabe':key==='automatic'?'Nachweisbarer Abschluss; Originalmail bleibt erhalten':label}>{label} <span>{data.workCounts[key]??0}</span></a>
  {/each}
 </nav>

	<!-- F.4.F: 3-Modus-Grid (Permanent-Side-Panel-Pattern).
	     Modus A (kein Row ausgewählt): MailList col-9 + SenderSidebar col-3
	     Modus B (Row ausgewählt):       MailList col-6 + DetailPanel col-6  -->
 <div class="mail-grid" class:has-detail={mailDetailStore.selectedUid != null}>
  <section class="mail-list-pane"><div class="desktop-mail-list"><MailList /></div><div class="phone-mail-list"><MailSummaryList /></div></section>
  {#if mailDetailStore.selectedUid != null}<section class="mail-detail-pane"><button class="back-to-list" onclick={()=>mailDetailStore.close()}>← Zur Mailliste</button><div class="detail-body"><DetailPanel /></div></section>{:else}<aside class="sender-pane"><SenderSidebar /></aside>{/if}
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

<style>
 .work-filters{display:flex;flex-wrap:wrap;gap:6px;padding:8px 16px;border-bottom:1px solid var(--color-border);flex-shrink:0}.work-filters a{font-size:12px;padding:7px 10px;border-radius:8px;color:var(--color-muted-foreground);text-decoration:none}.work-filters a[aria-current="page"]{background:var(--color-foreground);color:var(--color-background)}.work-filters span{font-variant-numeric:tabular-nums;margin-left:5px;opacity:.75}
 .mail-workspace{height:100%;min-height:0}.mail-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(200px,1fr);flex:1;min-height:0;gap:16px;padding:16px;overflow:hidden}.mail-grid.has-detail{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.mail-list-pane,.mail-detail-pane{min-width:0;min-height:0;overflow:hidden}.sender-pane{overflow:auto}.desktop-mail-list{height:100%}.phone-mail-list,.back-to-list{display:none}.mail-detail-pane{display:flex;flex-direction:column}.detail-body{flex:1;min-height:0;overflow:hidden}
 @media(max-width:900px){.mail-grid,.mail-grid.has-detail{display:flex;gap:0;padding:0}.mail-list-pane,.mail-detail-pane{flex:1;width:100%}.sender-pane,.desktop-mail-list{display:none}.phone-mail-list{display:block;height:100%}.has-detail .mail-list-pane{display:none}.back-to-list{display:block;min-height:48px;text-align:left;padding:12px 16px;background:var(--color-muted);color:var(--color-foreground);border:0;cursor:pointer}.mail-workspace{height:calc(100dvh - 100px)}}
</style>
