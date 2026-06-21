<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	// F.9 Block-3: Root-Layout ist Modul-agnostisch. campaignStore-Hydration +
	// Vault-Watcher-SSE leben jetzt in (vault)/+layout.svelte. Hier nur AppShell-
	// Wrap + minimaler layoutStore-Boot mit vaultName.
	onMount(() => {
		layoutStore.init(1, data.vaultName ?? 'vault', 1);
	});
</script>

<AppShell>
	{@render children()}
</AppShell>
