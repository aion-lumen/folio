<script lang="ts">
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { leuchtfeuerStore } from '$lib/stores/leuchtfeuer.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	import { ChevronLeft, ChevronRight, Star, Bookmark, Map } from 'lucide-svelte';

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

	const collapsed = $derived(layoutStore.leftPanelCollapsed);
	const campaign = $derived(campaignStore.campaign);

	const selectedAct = $derived(
		campaignStore.acts.find((a) => a.act_number === layoutStore.selectedAct) ?? null
	);

	const actChapters = $derived(
		campaignStore.chapters.filter((c) => c.parent_act === layoutStore.selectedAct)
	);

	const actHeader = $derived(
		selectedAct
			? `Kapitel · Akt ${ROMAN[selectedAct.act_number] ?? selectedAct.act_number} · ${selectedAct.title}`
			: 'Kapitel'
	);
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
			e.preventDefault();
			layoutStore.toggleLeftPanel();
		}
	}}
/>

<aside class="panel" class:collapsed>
	<!-- Collapse button -->
	<div class="collapse-row">
		{#if !collapsed}
			<span class="panel-title">Navigation</span>
		{/if}
		<button
			class="collapse-btn"
			onclick={() => layoutStore.toggleLeftPanel()}
			title={collapsed ? 'Ausklappen (Ctrl+B)' : 'Einklappen (Ctrl+B)'}
			aria-label={collapsed ? 'Panel ausklappen' : 'Panel einklappen'}
		>
			{#if collapsed}
				<ChevronRight size={15} />
			{:else}
				<ChevronLeft size={15} />
			{/if}
		</button>
	</div>

	<!-- Kampagnen section -->
	<div class="section">
		{#if !collapsed}
			<p class="section-header">Kampagnen</p>
		{/if}
		{#if campaign}
			<button
				class="nav-item"
				class:nav-active={true}
				onclick={() => layoutStore.setSelectedAct(campaign.current_act)}
				title={collapsed ? campaignStore.campaignTitle : undefined}
			>
				<Map size={16} class="nav-icon" />
				{#if !collapsed}
					<span class="nav-label">{campaignStore.campaignTitle}</span>
				{/if}
			</button>
		{/if}
	</div>

	<!-- Kapitel section -->
	<div class="section kapitel-section">
		{#if !collapsed}
			<p class="section-header kapitel-header" title={actHeader}>{actHeader}</p>
		{/if}
		{#each actChapters as chapter}
			{@const isActive = chapter.chapter_number === layoutStore.selectedChapter}
			<button
				class="nav-item chapter-item"
				class:chapter-active={isActive}
				onclick={() => layoutStore.setSelectedChapter(chapter.chapter_number)}
				title={collapsed ? (chapter.title || `Kapitel ${chapter.chapter_number}`) : undefined}
			>
				{#if !collapsed}
					<span class="chapter-indicator" aria-hidden="true">›</span>
					<span class="nav-label">{chapter.title || `Kapitel ${chapter.chapter_number}`}</span>
				{:else}
					<span class="chapter-num" class:chapter-num-active={isActive}>
						{chapter.chapter_number}
					</span>
				{/if}
			</button>
		{/each}
		{#if actChapters.length === 0 && !collapsed}
			<p class="empty-note">Noch keine Kapitel definiert</p>
		{/if}
	</div>

	<!-- Shortcuts section -->
	<div class="section shortcuts">
		{#if !collapsed}
			<p class="section-header">Shortcuts</p>
		{/if}
		<button
			class="nav-item"
			class:nav-active={layoutStore.leuchtfeuerFilterActive}
			onclick={() => layoutStore.toggleLeuchtfeuerFilter()}
			title={collapsed ? 'Leuchtfeuer-Filter' : undefined}
		>
			<Star size={16} class="nav-icon" fill={layoutStore.leuchtfeuerFilterActive ? 'currentColor' : 'none'} />
			{#if !collapsed}
				<span class="nav-label">Leuchtfeuer</span>
				{#if leuchtfeuerStore.ids.length > 0}
					<span class="badge">{leuchtfeuerStore.ids.length}</span>
				{/if}
			{/if}
		</button>
		<button
			class="nav-item"
			onclick={() => toastStore.show('Vault-Explorer kommt in v0.2')}
			title={collapsed ? 'Vault öffnen' : undefined}
		>
			<Bookmark size={16} class="nav-icon" />
			{#if !collapsed}
				<span class="nav-label">Vault</span>
			{/if}
		</button>
	</div>
</aside>

<style>
	.panel {
		width: 240px;
		height: 100%;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		background: var(--color-card);
		flex-shrink: 0;
		transition: width 200ms ease-out;
		overflow: hidden;
	}
	.panel.collapsed {
		width: 48px;
	}

	/* ── Collapse row ── */
	.collapse-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 8px 6px;
		flex-shrink: 0;
	}
	.panel-title {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground);
		text-transform: uppercase;
		margin: 0;
		padding-left: 4px;
		white-space: nowrap;
	}
	.collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 4px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		transition: background 150ms, color 150ms;
		flex-shrink: 0;
		margin-left: auto;
	}
	.collapse-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	/* ── Sections ── */
	.section {
		padding: 4px 8px;
		border-top: 1px solid var(--color-border);
	}
	.kapitel-section {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}
	.section.shortcuts {
		margin-top: auto;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.section-header {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		margin: 6px 4px 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 0.7;
	}
	.kapitel-header {
		letter-spacing: 0.05em;
	}

	/* ── Nav items ── */
	.nav-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
		text-align: left;
		transition: background 150ms, color 150ms;
		min-width: 0;
	}
	.nav-item:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.nav-item.nav-active {
		background: var(--color-lumen, hsl(45 96% 55%));
		color: hsl(0 0% 10%);
	}
	.nav-item.nav-active:hover {
		opacity: 0.9;
	}

	.nav-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Chapter items ── */
	.chapter-item {
		gap: 6px;
		padding: 5px 8px;
		font-size: 12px;
		color: var(--color-muted-foreground);
	}
	.chapter-item:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.chapter-item.chapter-active {
		color: var(--color-lumen, hsl(45 96% 55%));
		font-weight: 500;
	}
	.chapter-item.chapter-active:hover {
		background: hsl(45 96% 55% / 0.08);
	}

	.chapter-indicator {
		flex-shrink: 0;
		opacity: 0.4;
		font-size: 13px;
		line-height: 1;
	}
	.chapter-active .chapter-indicator {
		opacity: 1;
	}

	/* Collapsed: chapter number pill */
	.chapter-num {
		width: 100%;
		text-align: center;
		font-size: 11px;
		font-weight: 500;
		color: var(--color-muted-foreground);
		line-height: 1;
	}
	.chapter-num.chapter-num-active {
		color: var(--color-lumen, hsl(45 96% 55%));
		font-weight: 700;
	}

	.empty-note {
		font-size: 11px;
		color: var(--color-muted-foreground);
		padding: 6px 8px;
		opacity: 0.6;
		font-style: italic;
	}

	/* ── Shortcuts ── */
	.badge {
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		font-size: 10px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 10px;
		flex-shrink: 0;
	}
	.nav-item.nav-active .badge {
		background: hsl(0 0% 10% / 0.2);
		color: hsl(0 0% 10%);
	}
</style>
