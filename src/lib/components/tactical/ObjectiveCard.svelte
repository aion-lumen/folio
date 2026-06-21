<script lang="ts">
	import type { Objective, ObjectiveStatus } from '$lib/types/campaign.js';
	import { Star } from 'lucide-svelte';
	import { selectionStore } from '$lib/stores/selection.svelte.js';
	import { hoverStore } from '$lib/stores/hover.svelte.js';

	let {
		objective,
		allOrderedIds = [],
		isLeuchtfeuer = false,
		onStatusChange,
		onOpenDetails,
		onToggleLeuchtfeuer
	}: {
		objective: Objective;
		allOrderedIds?: string[];
		isLeuchtfeuer?: boolean;
		onStatusChange: (id: string, slug: string, status: ObjectiveStatus) => void;
		onOpenDetails?: (obj: Objective) => void;
		onToggleLeuchtfeuer?: (id: string) => void;
	} = $props();

	let dragStartPos = $state<{ x: number; y: number } | null>(null);

	function handleMouseDown(e: MouseEvent) {
		dragStartPos = { x: e.clientX, y: e.clientY };
	}

	function handleClick(e: MouseEvent) {
		if (dragStartPos) {
			const moved = Math.abs(e.clientX - dragStartPos.x) + Math.abs(e.clientY - dragStartPos.y);
			dragStartPos = null;
			if (moved > 5) return;
		}
		e.stopPropagation();
		if (e.metaKey || e.ctrlKey) {
			selectionStore.toggle(objective.id);
		} else if (e.shiftKey) {
			selectionStore.selectRange(objective.id, allOrderedIds);
		} else {
			selectionStore.select(objective.id);
		}
	}

	function handleDoubleClick(e: MouseEvent) {
		e.stopPropagation();
		onOpenDetails?.(objective);
	}

	function handleStarClick(e: MouseEvent) {
		e.stopPropagation();
		onToggleLeuchtfeuer?.(objective.id);
	}

	// Derive progress from note content or status
	function deriveProgress(obj: Objective): number {
		if (obj.status === 'done') return 100;
		if (obj.status === 'archived') return 0;
		if (obj.progress_note) {
			// "17.5 / 24 Monate" or "6 von 9"
			const fracMatch = obj.progress_note.match(/(\d+(?:[.,]\d+)?)\s*[/\/von]\s*(\d+(?:[.,]\d+)?)/);
			if (fracMatch) {
				const num = parseFloat(fracMatch[1].replace(',', '.'));
				const den = parseFloat(fracMatch[2].replace(',', '.'));
				if (!isNaN(num) && !isNaN(den) && den > 0) return Math.min(Math.round((num / den) * 100), 100);
			}
			// "66%"
			const pctMatch = obj.progress_note.match(/(\d+)\s*%/);
			if (pctMatch) return Math.min(parseInt(pctMatch[1]), 100);
		}
		if (obj.status === 'in_progress') return 40;
		if (obj.status === 'blocked') return 20;
		return 0;
	}

	// Strip markdown-style quoting from progress_note for preview
	function notePreview(note: string | undefined): string {
		if (!note) return '';
		return note.replace(/^["'"']+|["'"']+$/g, '').trim();
	}

	const selected = $derived(selectionStore.isSelected(objective.id));
	const progress = $derived(deriveProgress(objective));
	const preview = $derived(notePreview(objective.progress_note));
</script>

<div
	class="card"
	class:selected
	class:lit={isLeuchtfeuer}
	class:done={objective.status === 'done'}
	onmousedown={handleMouseDown}
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') selectionStore.select(objective.id);
	}}
	role="button"
	tabindex="0"
	onmouseenter={() => hoverStore.enter(objective.id)}
	onmouseleave={() => hoverStore.leave()}
>
	<!-- Top row: ID + star -->
	<div class="top-row">
		<span class="obj-id">{objective.id}</span>
		<button
			class="star-btn"
			class:lit={isLeuchtfeuer}
			onclick={handleStarClick}
			title={isLeuchtfeuer ? 'Leuchtfeuer entfernen' : 'Als Leuchtfeuer markieren'}
		>
			<Star size={12} fill={isLeuchtfeuer ? 'currentColor' : 'none'} />
		</button>
	</div>

	<!-- Title -->
	<p class="title">{objective.title}</p>

	<!-- Progress note preview -->
	{#if preview}
		<p class="note">{preview}</p>
	{/if}

	<!-- Goals + deadline row -->
	<div class="meta-row">
		{#if objective.related_goals.length > 0}
			<span class="goals">{objective.related_goals.join(' · ')}</span>
		{/if}
		{#if objective.deadline}
			<span class="deadline">{objective.deadline}</span>
		{/if}
	</div>

	<!-- Progress bar -->
	{#if progress > 0 || objective.status === 'in_progress'}
		<div class="prog-bar">
			<div class="prog-fill" style="width: {progress}%"></div>
		</div>
	{/if}
</div>

<style>
	.card {
		position: relative;
		border-radius: 8px;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		padding: 10px 10px 8px;
		cursor: pointer;
		transition: box-shadow 150ms, transform 150ms, border-color 150ms;
		box-shadow: var(--shadow-xs);
	}
	.card:hover {
		box-shadow: var(--shadow-md);
		transform: scale(1.01);
	}
	.card.selected {
		border-color: hsl(222.2 47.4% 40%);
		box-shadow: 0 0 0 2px hsl(222.2 47.4% 11.2% / 0.15);
		background: hsl(222.2 47.4% 11.2% / 0.03);
	}
	.card.lit {
		border-color: var(--color-lumen);
		box-shadow: 0 0 0 1px hsl(32 100% 60% / 0.25), var(--shadow-sm);
	}
	.card.lit:hover {
		box-shadow: 0 0 0 1px hsl(32 100% 60% / 0.35), var(--shadow-md);
	}
	.card.done {
		opacity: 0.65;
	}

	.top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.obj-id {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.02em;
	}

	.star-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--color-muted-foreground);
		opacity: 0;
		transition: opacity 150ms, color 150ms;
		display: flex;
		align-items: center;
		line-height: 1;
	}
	.card:hover .star-btn,
	.star-btn.lit {
		opacity: 1;
	}
	.star-btn.lit {
		color: var(--color-lumen);
	}
	.star-btn:hover {
		color: var(--color-lumen);
	}

	.title {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--color-foreground);
		margin: 0 0 5px;
	}
	.card.done .title {
		text-decoration: line-through;
		color: var(--color-muted-foreground);
	}

	.note {
		font-size: 11.5px;
		color: var(--color-muted-foreground);
		line-height: 1.4;
		margin: 0 0 6px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		min-height: 16px;
	}
	.goals {
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}
	.deadline {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.prog-bar {
		height: 3px;
		background: var(--color-muted);
		border-radius: 2px;
		overflow: hidden;
		margin-top: 8px;
	}
	.prog-fill {
		height: 100%;
		background: var(--color-primary);
		border-radius: 2px;
		transition: width 300ms ease;
	}
	.card.lit .prog-fill {
		background: var(--color-lumen);
	}
</style>
