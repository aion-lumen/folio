<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	$effect(() => {
		layoutStore.vaultName = data.vaultName ?? 'vault';
	});

	// F.9 Block-3: Root-Layout ist Modul-agnostisch. campaignStore-Hydration +
	// Vault-Watcher-SSE leben jetzt in (vault)/+layout.svelte. Hier nur AppShell-
	// Wrap + minimaler layoutStore-Boot mit vaultName.
	onMount(() => {
		if (data.ledgerDemo) return;
		layoutStore.init(1, data.vaultName ?? 'vault', 1);
	});
</script>

{#if data.ledgerDemo}
 <div class="demo-banner"><a href="/demo/ledger">Folio · Ledger</a><span>Erfundene Daten · Vorführung ohne Schreibzugriff</span><a href="/ledger/wealth">Haushaltsbuch ↗</a></div>
 {@render children()}
{:else}
 <AppShell>{@render children()}</AppShell>
{/if}
<style>
 .demo-banner{display:flex;gap:1.5rem;align-items:center;justify-content:space-between;padding:.85rem 1.5rem;background:#edf3f9;color:#274765;border-bottom:1px solid #cbd8e5;font-size:.85rem;flex-wrap:wrap}.demo-banner a{font-weight:650;text-decoration:none}
</style>
