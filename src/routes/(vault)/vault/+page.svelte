<script lang="ts">
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import { chatStore } from '$lib/stores/chat.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { leuchtfeuerStore } from '$lib/stores/leuchtfeuer.svelte.js';
	import CampaignTimeline from '$lib/components/strategic/CampaignTimeline.svelte';
	import ChapterBanner from '$lib/components/strategic/ChapterBanner.svelte';
	import ChapterTabs from '$lib/components/strategic/ChapterTabs.svelte';
	import KanbanBoard from '$lib/components/tactical/KanbanBoard.svelte';
	import HauskaufKanban from '$lib/kampagne/HauskaufKanban.svelte';
	import type { ObjectiveStatus } from '$lib/types/campaign.js';
	import type { PageData } from './$types.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let { data }: { data: PageData } = $props();

	// 2026-06-08 Bauteil 2.7b: URL-Params ?act=N&chapter=M setzen
	// layoutStore-Selektion. Wird vom CampaignTrack-Link
	// (/vault?act=2&chapter=4) genutzt um direkt ins Hauskauf-Kapitel zu
	// springen. Nur einmalig bei Param-Wechsel; layoutStore-Eigen-State
	// gewinnt bei manueller Navigation. Untracked-Reads, damit der Effect
	// nicht bei jedem Store-Update re-feuert.
	$effect(() => {
		const actParam = parseInt(page.url.searchParams.get('act') ?? '', 10);
		const chapterParam = parseInt(page.url.searchParams.get('chapter') ?? '', 10);
		if (!Number.isFinite(actParam) || !Number.isFinite(chapterParam)) return;
		layoutStore.setSelectedAct(actParam);
		layoutStore.setSelectedChapter(chapterParam);
	});

	// Reset selected chapter when act changes to a chapter not belonging to that act
	$effect(() => {
		const belongsToAct = campaignStore.chapters.some(
			(c) => c.chapter_number === layoutStore.selectedChapter && c.parent_act === layoutStore.selectedAct
		);
		if (!belongsToAct) {
			const firstChapter = campaignStore.chapters.find((c) => c.parent_act === layoutStore.selectedAct);
			if (firstChapter) layoutStore.setSelectedChapter(firstChapter.chapter_number);
		}
	});

	// Reset if chapter no longer exists after vault reload
	$effect(() => {
		const exists = campaignStore.chapters.some((c) => c.chapter_number === layoutStore.selectedChapter);
		if (!exists && campaignStore.campaign) {
			layoutStore.setSelectedChapter(campaignStore.campaign.current_chapter);
		}
	});

	onMount(() => {
		chatStore.setContext({
			view: 'strategisch',
			currentChapter: campaignStore.campaign?.current_chapter
		});
	});

	// Chapters for the selected act
	const actChapters = $derived(
		campaignStore.chapters.filter((c) => c.parent_act === layoutStore.selectedAct)
	);

	// Chapter shown in breadcrumb / banner
	const displayChapter = $derived(
		campaignStore.chapters.find((c) => c.chapter_number === layoutStore.selectedChapter) ??
			campaignStore.activeChapter
	);

	// Active act for banner
	const displayAct = $derived(
		campaignStore.acts.find((a) => a.act_number === layoutStore.selectedAct) ??
			campaignStore.activeAct
	);

	// Slug map for KanbanBoard writes
	const chapterSlugMap = $derived(
		Object.fromEntries(campaignStore.chapters.map((c) => [c.chapter_number, c.slug]))
	);

	// Kanban objectives — either leuchtfeuer filter or chapter view
	const kanbanObjectives = $derived(
		layoutStore.leuchtfeuerFilterActive
			? campaignStore.allObjectives.filter((o) => leuchtfeuerStore.ids.includes(o.id))
			: displayChapter?.objectives ?? []
	);

	async function handleMove(objectiveId: string, slug: string, newStatus: ObjectiveStatus) {
		try {
			const res = await fetch('/api/vault/objectives', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slug, objectiveId, status: newStatus })
			});
			if (!res.ok) console.error('Status update failed', await res.text());
		} catch (e) {
			console.error('Status update error', e);
		}
	}
</script>

{#if campaignStore.campaign}
	<div class="strategic-view">
		<CampaignTimeline acts={campaignStore.acts} campaign={campaignStore.campaign} />

		{#if displayChapter && !layoutStore.leuchtfeuerFilterActive}
			<ChapterBanner
				chapter={displayChapter}
				act={displayAct}
				hauskaufCards={data.hauskaufCards}
			/>
		{/if}

		{#if actChapters.length > 1 && !layoutStore.leuchtfeuerFilterActive}
			<ChapterTabs
				chapters={actChapters}
				activeChapterNumber={layoutStore.selectedChapter}
				onTabClick={(n) => layoutStore.setSelectedChapter(n)}
			/>
		{/if}

		{#if layoutStore.leuchtfeuerFilterActive}
			<div class="leuchtfeuer-banner">
				<span class="lf-label">★ Leuchtfeuer-Filter aktiv</span>
				<span class="lf-count">{leuchtfeuerStore.ids.length} Objectives</span>
				<button class="lf-clear" onclick={() => layoutStore.toggleLeuchtfeuerFilter()}>
					Filter aufheben
				</button>
			</div>
		{/if}

		<!-- 2026-06-08 Bauteil 2.7c Rückpfeifung: Hauskauf-Kapitel ist
		     'dynamisch' (Workflow-getrieben), alle anderen 'statisch'
		     (Objective-getrieben). Entweder/oder pro Kapitel, kein zweites
		     Kanban darunter. -->
		{#if displayChapter?.chapter_number === 4 && displayChapter?.parent_act === 2}
			<div class="kanban-area">
				<HauskaufKanban cards={data.hauskaufCards} />
			</div>
		{:else if kanbanObjectives.length > 0 || displayChapter}
			<div class="kanban-area">
				<KanbanBoard
					objectives={kanbanObjectives}
					{chapterSlugMap}
					onMove={handleMove}
				/>
			</div>
		{:else}
			<div class="empty-state">Kein aktives Kapitel gefunden.</div>
		{/if}
	</div>
{:else}
	<div class="loading">Lade Vault…</div>
{/if}

<style>
	.strategic-view {
		margin: -1rem -1rem 0;
	}
	@media (min-width: 768px) {
		.strategic-view {
			margin: -1.5rem -1.5rem 0;
		}
	}

	.kanban-area {
		padding: 1.25rem 1.25rem 2rem;
		overflow-x: auto;
	}

	.leuchtfeuer-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 20px;
		background: hsl(45 96% 55% / 0.1);
		border-bottom: 1px solid hsl(45 96% 55% / 0.3);
	}
	.lf-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-foreground);
	}
	.lf-count {
		font-size: 12px;
		color: var(--color-muted-foreground);
	}
	.lf-clear {
		margin-left: auto;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-muted-foreground);
		padding: 3px 8px;
		border-radius: 5px;
		transition: background 150ms, color 150ms;
		font-family: inherit;
	}
	.lf-clear:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.empty-state {
		padding: 2rem;
		text-align: center;
		color: var(--color-muted-foreground);
		font-size: 14px;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 5rem;
		color: var(--color-muted-foreground);
	}
</style>
