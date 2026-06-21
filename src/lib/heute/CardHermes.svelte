<!--
  F.9 Block-4 — Hermes-Card im Heute-Hub.
  Zeigt Chat-Status: offen/zu + Anzahl Messages in der aktuellen Session.
-->
<script lang="ts">
	import { MessageCircle, ArrowRight } from 'lucide-svelte';
	import { chatStore } from '$lib/stores/chat.svelte.js';

	const messageCount = $derived(chatStore.messages?.length ?? 0);
	const isOpen = $derived(chatStore.open);

	function openChat() {
		if (!isOpen) chatStore.toggle();
	}
</script>

<button class="card" type="button" onclick={openChat}>
	<header class="card-head">
		<MessageCircle size={18} class="icon" />
		<span class="title">Hermes</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if messageCount > 0}
		<p class="primary">
			<span class="counter">{messageCount}</span>
			<span class="counter-suffix">Nachricht{messageCount === 1 ? '' : 'en'}</span>
		</p>
		<p class="hint">
			{isOpen ? 'Chat-Panel offen — Kontext-aware Quick-Actions.' : 'Klick → Chat-Panel öffnen (⌘ J).'}
		</p>
	{:else}
		<p class="primary muted">Noch keine Konversation</p>
		<p class="hint">Hermes hilft beim Klassifizieren, Zusammenfassen und Erklären. ⌘ J zum Öffnen.</p>
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
	.arrow { opacity: 0.4; color: var(--color-muted-foreground); transition: opacity 150ms, transform 150ms; }
	.card:hover .arrow { opacity: 1; transform: translateX(2px); }

	.primary {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		font-size: 14px;
		margin: 4px 0 0;
		color: var(--color-foreground);
	}
	.primary.muted {
		font-size: 18px;
		color: var(--color-muted-foreground);
	}
	.counter {
		font-size: 22px;
		font-weight: 600;
	}
	.counter-suffix {
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
