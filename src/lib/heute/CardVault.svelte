<!--
  F.9 Block-4 — Vault-Card im Heute-Hub.
  Zeigt Vault-Status. Bei nicht-initialisiertem Vault: Setup-CTA.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Map, ArrowRight } from 'lucide-svelte';

	let { vaultPresent }: { vaultPresent: boolean } = $props();

	function open(href: string) {
		goto(href);
	}
</script>

<button class="card" type="button" onclick={() => open(vaultPresent ? '/vault' : '/setup')}>
	<header class="card-head">
		<Map size={18} class="icon" />
		<span class="title">Vault</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if vaultPresent}
		<p class="primary">Kampagne aktiv</p>
		<p class="hint">Hierarchie, Kapitel und Leuchtfeuer-Objektive im Vault-Module verwalten.</p>
	{:else}
		<p class="primary muted">Noch nicht eingerichtet</p>
		<p class="hint">Vault optional — Mail-Audit und Pipeline laufen ohne. Klick → Setup-Routine.</p>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		text-align: left;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		cursor: pointer;
		transition: border-color 150ms, transform 150ms;
		font-family: inherit;
		color: var(--color-foreground);
	}
	.card:hover {
		border-color: var(--color-foreground);
		transform: translateY(-1px);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-muted-foreground);
	}
	.card-head .icon { color: var(--color-foreground); }
	.title {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		flex: 1;
	}
	.arrow { opacity: 0.4; transition: opacity 150ms, transform 150ms; }
	.card:hover .arrow { opacity: 1; transform: translateX(2px); }

	.primary {
		font-size: 18px;
		font-weight: 500;
		margin: 4px 0 0;
		color: var(--color-foreground);
	}
	.primary.muted { color: var(--color-muted-foreground); }
	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
