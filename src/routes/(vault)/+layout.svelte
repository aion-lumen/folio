<!--
  F.9 Block-3 — Vault-Layout-Group-Layout.
  Hydriert campaignStore und startet Vault-Watcher-SSE für alle Vault-Routes.
  Ersetzt die vorherige campaign-Hydration im Root-Layout.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';

	let { data, children } = $props();

	// Synchronous init — runs during SSR and initial client render.
	campaignStore.campaign = data.campaign;
	campaignStore.acts = data.acts;
	campaignStore.chapters = data.chapters;

	// Re-sync on SvelteKit navigation within (vault).
	$effect(() => {
		campaignStore.campaign = data.campaign;
		campaignStore.acts = data.acts;
		campaignStore.chapters = data.chapters;
	});

	onMount(() => {
		// 2026-06-08 Bauteil 2.7c: URL-Params ?act=N&chapter=M respektieren.
		// Deep-Link wie /vault?act=2&chapter=4 (z.B. aus CampaignTrack-Link)
		// soll nicht durch layout-init auf current_act/current_chapter
		// zurueck-gesetzt werden. init() wird mit den URL-Werten aufgerufen
		// statt mit den campaign-defaults — selber Code-Pfad, LS-Prefs
		// werden trotzdem geladen.
		const url = new URL(location.href);
		const actParam = parseInt(url.searchParams.get('act') ?? '', 10);
		const chapterParam = parseInt(url.searchParams.get('chapter') ?? '', 10);
		const initAct = Number.isFinite(actParam) ? actParam : (data.campaign?.current_act ?? 1);
		const initChapter = Number.isFinite(chapterParam)
			? chapterParam
			: (data.campaign?.current_chapter ?? 1);
		layoutStore.init(initAct, layoutStore.vaultName, initChapter);
		campaignStore.lastSynced = new Date();
		return campaignStore.subscribeToChanges();
	});
</script>

{@render children()}
