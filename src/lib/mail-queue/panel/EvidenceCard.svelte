<!--
  Panel-C Werkstatt §1.3: generic kollabierbare Karteikarte.
  Header 36px: [mini-visual snippet] [Label] [mono-summary]→ [▾ chevron]
  Body: max-height-transition ≤200ms.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		summary,
		defaultExpanded = false,
		visual,
		children,
		forceExpandKey
	}: {
		label: string;
		summary?: string;
		defaultExpanded?: boolean;
		visual?: Snippet;
		children: Snippet;
		/** Optional bumping-key from parent (?-shortcut): toggle all cards together. */
		forceExpandKey?: number;
	} = $props();

	// Initial expanded-state aus defaultExpanded; danach lokal toggle-bar.
	let expanded = $state<boolean | null>(null);
	$effect(() => {
		if (expanded === null) expanded = defaultExpanded;
	});

	// React to ?-shortcut bumps from parent.
	let lastBumpSeen = -1;
	$effect(() => {
		if (forceExpandKey !== undefined && forceExpandKey !== lastBumpSeen) {
			lastBumpSeen = forceExpandKey;
			expanded = !expanded;
		}
	});
</script>

<div class="ev-card" class:expanded>
	<button
		type="button"
		class="ev-head"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
	>
		{#if visual}
			<span class="ev-visual">{@render visual()}</span>
		{:else}
			<span class="ev-visual"></span>
		{/if}
		<span class="ev-label">{label}</span>
		{#if summary}
			<span class="ev-summary">{summary}</span>
		{/if}
		<span class="ev-chevron">{expanded ? '▴' : '▾'}</span>
	</button>
	<div class="ev-body" aria-hidden={!expanded}>
		<div class="ev-body-inner">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.ev-card {
		background: white;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md, 6px);
		overflow: hidden;
	}
	.ev-head {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		min-height: 36px;
		background: white;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		color: inherit;
		transition: background 120ms;
	}
	.ev-head:hover {
		background: var(--color-muted);
	}
	.ev-visual {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
	}
	.ev-label {
		font-size: 12px;
		font-weight: 500;
	}
	.ev-summary {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.ev-chevron {
		flex-shrink: 0;
		font-size: 10px;
		color: var(--color-muted-foreground);
		margin-left: 6px;
	}
	.ev-body {
		max-height: 0;
		overflow: hidden;
		transition: max-height 200ms ease-out;
		border-top: 0 solid var(--color-border);
	}
	.ev-card.expanded .ev-body {
		max-height: 800px; /* generous cap; content tends to be short lists */
		border-top: 1px solid var(--color-border);
	}
	.ev-body-inner {
		padding: 10px 12px;
		font-size: 12px;
	}
</style>
