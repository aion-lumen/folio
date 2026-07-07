<!--
  Import-Inbox card im Heute-Hub.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { FolderInput, ArrowRight } from 'lucide-svelte';

	let {
		pending,
		triage = { awaiting_review: 0, auto_committed: 0 }
	}: {
		pending: number;
		triage?: { awaiting_review: number; auto_committed: number };
	} = $props();
</script>

<button class="card" type="button" onclick={() => goto('/inbox')}>
	<header class="card-head">
		<FolderInput size={18} class="icon" />
		<span class="title">Import-Inbox</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if pending === 0 && triage.auto_committed === 0}
		<p class="primary muted">Inbox leer</p>
		<p class="hint">Agenten liefern .md-Dateien nach ~/.folio/inbox/</p>
	{:else}
		<p class="primary">
			{#if triage.auto_committed > 0}
				<span class="counter ok">{triage.auto_committed}</span>
				<span class="counter-suffix">auto-angelegt</span>
			{/if}
			{#if pending > 0}
				<span class="counter">{pending}</span>
				<span class="counter-suffix">wartend</span>
			{/if}
		</p>
		<p class="hint">
			{#if triage.awaiting_review > 0}
				{triage.awaiting_review} warten auf Review ·
			{/if}
			Preview &amp; Commit auf /inbox
		</p>
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
		font-size: 14px;
		margin: 4px 0 4px;
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		color: var(--color-foreground);
	}
	.primary.muted {
		font-size: 18px;
		color: var(--color-muted-foreground);
	}
	.counter {
		font-size: 22px;
		font-weight: 600;
		color: var(--color-lumen-warm, hsl(28 92% 58%));
	}
	.counter.ok {
		color: hsl(142 60% 40%);
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
