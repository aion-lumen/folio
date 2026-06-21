<script lang="ts">
	import type { Chapter } from '$lib/types/campaign.js';

	let {
		chapters,
		activeChapterNumber,
		onTabClick
	}: {
		chapters: Chapter[];
		activeChapterNumber: number;
		onTabClick: (chapterNumber: number) => void;
	} = $props();

	function activeCount(chapter: Chapter): number {
		return chapter.objectives.filter((o) => o.status !== 'done' && o.status !== 'archived').length;
	}
</script>

<div class="tabs-wrap">
	{#each chapters as chapter}
		<button
			class="tab"
			class:active={chapter.chapter_number === activeChapterNumber}
			onclick={() => onTabClick(chapter.chapter_number)}
		>
			<span class="tab-label">
				Kapitel {chapter.chapter_number} · {chapter.title}
			</span>
			<span class="tab-count">{activeCount(chapter)}</span>
		</button>
	{/each}
</div>

<style>
	.tabs-wrap {
		display: flex;
		gap: 2px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-card);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs-wrap::-webkit-scrollbar {
		display: none;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		border-radius: 6px;
		border: none;
		background: transparent;
		cursor: pointer;
		font-family: inherit;
		font-size: 12px;
		font-weight: 500;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		transition: background 150ms, color 150ms;
	}
	.tab:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.tab.active {
		background: var(--color-primary);
		color: var(--color-primary-foreground);
	}
	.tab.active .tab-count {
		background: hsl(0 0% 100% / 0.2);
		color: var(--color-primary-foreground);
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 99px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
	}
</style>
