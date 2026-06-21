<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { onMount } from 'svelte';
	import type { Objective, ObjectiveStatus } from '$lib/types/campaign.js';
	import ObjectiveCard from './ObjectiveCard.svelte';
	import ObjectiveDetailsPanel from '$lib/components/details/ObjectiveDetailsPanel.svelte';
	import { selectionStore } from '$lib/stores/selection.svelte.js';
	import { leuchtfeuerStore } from '$lib/stores/leuchtfeuer.svelte.js';

	let {
		objectives,
		chapterSlugMap,
		onMove
	}: {
		objectives: Objective[];
		chapterSlugMap: Record<number, string>;
		onMove: (objectiveId: string, slug: string, newStatus: ObjectiveStatus) => Promise<void>;
	} = $props();

	type Column = { id: ObjectiveStatus; label: string; empty: string };
	const columns: Column[] = [
		{ id: 'not_started', label: 'Offen', empty: 'Noch nichts geplant.' },
		{ id: 'in_progress', label: 'In Arbeit', empty: 'Nichts in Arbeit.' },
		{ id: 'blocked', label: 'Blockiert', empty: 'Nichts blockiert 🙂' },
		{ id: 'done', label: 'Erledigt', empty: 'Hier landen erledigte Ziele.' }
	];

	type DndItem = Objective & { id: string };

	let showAllDone = $state(false);

	function sortItems(items: DndItem[], columnId: ObjectiveStatus): DndItem[] {
		if (columnId !== 'in_progress') return items;
		return [...items].sort((a, b) => {
			const aLit = leuchtfeuerStore.isLit(a.id);
			const bLit = leuchtfeuerStore.isLit(b.id);
			if (aLit !== bLit) return aLit ? -1 : 1;
			if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
			if (a.deadline) return -1;
			if (b.deadline) return 1;
			return 0;
		});
	}

	function buildColumnItems(): Record<ObjectiveStatus, DndItem[]> {
		return Object.fromEntries(
			columns.map((c) => [
				c.id,
				sortItems(
					objectives
						.filter((o) => o.status === c.id || (c.id === 'not_started' && o.status === 'todo'))
						.map((o) => ({ ...o, id: o.id })),
					c.id
				)
			])
		) as Record<ObjectiveStatus, DndItem[]>;
	}

	let columnItems = $state<Record<ObjectiveStatus, DndItem[]>>(buildColumnItems());

	// Re-build when objectives change OR when leuchtfeuer changes (re-sorts in_progress)
	$effect(() => {
		void leuchtfeuerStore.ids; // track leuchtfeuer reactively
		columnItems = buildColumnItems();
	});

	onMount(() => {
		leuchtfeuerStore.load();
	});

	async function handleDrop(columnId: ObjectiveStatus, items: DndItem[]) {
		const moved = items.find((item) => {
			const original = objectives.find((o) => o.id === item.id);
			return original && original.status !== columnId;
		});
		columnItems[columnId] = items;
		if (moved) {
			const slug = chapterSlugMap[moved.chapter_number] ?? '';
			await onMove(moved.id, slug, columnId);
		}
	}

	const allOrderedIds = $derived(
		columns.flatMap((c) => (columnItems[c.id] ?? []).map((o) => o.id))
	);

	function handleBoardClick(e: MouseEvent) {
		if (e.target === e.currentTarget) selectionStore.clear();
	}
	function handleColumnClick(e: MouseEvent) {
		if (e.target === e.currentTarget) selectionStore.clear();
	}
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') selectionStore.clear();
	}

	let detailsObjective = $state<Objective | null>(null);
	function handleOpenDetails(obj: Objective) {
		detailsObjective = obj;
	}
	async function handleSaveDetails(
		id: string,
		patch: { status?: ObjectiveStatus; progress_note?: string; deadline?: string }
	) {
		const res = await fetch(`/api/vault/objectives/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (!res.ok) throw new Error(`Save failed: ${await res.text()}`);
	}

	const colColors: Record<string, string> = {
		not_started: 'bg-slate-50 border-slate-200',
		in_progress: 'bg-amber-50/60 border-amber-200',
		blocked: 'bg-red-50 border-red-200',
		done: 'bg-green-50 border-green-200'
	};
</script>

<svelte:window onkeydown={handleKeyDown} />

<ObjectiveDetailsPanel
	objective={detailsObjective}
	onClose={() => (detailsObjective = null)}
	onSave={handleSaveDetails}
/>

<!-- Max-3 error banner -->
{#if leuchtfeuerStore.maxReachedError}
	<div class="lumen-warn">
		Maximal 3 Leuchtfeuer pro Woche. Erst eins entfernen.
	</div>
{/if}

<div class="kanban" onclick={handleBoardClick} role="presentation">
	{#each columns as col}
		{@const items = columnItems[col.id] ?? []}
		{@const isPrimary = col.id === 'in_progress'}
		{@const isDone = col.id === 'done'}
		{@const visibleItems = isDone && !showAllDone ? items.slice(0, 5) : items}

		<div class="col" class:col-primary={isPrimary}>
			<!-- Column header -->
			<div class="col-head" class:col-head-primary={isPrimary}>
				<span class="col-label">{col.label}</span>
				<span class="col-count" class:col-count-primary={isPrimary}>{items.length}</span>
			</div>

			<!-- Drop zone (only full list for dnd) -->
			<div
				class="col-body {colColors[col.id]}"
				onclick={handleColumnClick}
				role="presentation"
				use:dndzone={{ items: columnItems[col.id] ?? [], flipDurationMs: 150 }}
				onconsider={(e) => { columnItems[col.id] = e.detail.items; }}
				onfinalize={(e) => handleDrop(col.id, e.detail.items)}
			>
				{#if visibleItems.length === 0 && items.length === 0}
					<p class="empty-hint">{col.empty}</p>
				{/if}

				{#each (isDone && !showAllDone ? columnItems[col.id].slice(0, 5) : (columnItems[col.id] ?? [])) as obj (obj.id)}
					<ObjectiveCard
						objective={obj}
						{allOrderedIds}
						isLeuchtfeuer={leuchtfeuerStore.isLit(obj.id)}
						onStatusChange={(id, slug, status) => onMove(id, slug, status)}
						onOpenDetails={handleOpenDetails}
						onToggleLeuchtfeuer={(id) => leuchtfeuerStore.toggle(id)}
					/>
				{/each}

				{#if isDone && !showAllDone && items.length > 5}
					<button class="show-more" onclick={() => (showAllDone = true)}>
						{items.length - 5} weitere anzeigen
					</button>
				{/if}
				{#if isDone && showAllDone && items.length > 5}
					<button class="show-more" onclick={() => (showAllDone = false)}>
						Weniger anzeigen
					</button>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.kanban {
		display: flex;
		gap: 14px;
		overflow-x: auto;
		padding-bottom: 1rem;
		align-items: flex-start;
	}

	.col {
		flex-shrink: 0;
		width: 15rem;
		display: flex;
		flex-direction: column;
	}
	.col-primary {
		width: 19rem;
	}

	.col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		padding: 0 2px;
	}
	.col-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-foreground);
		letter-spacing: 0.01em;
	}
	.col-head-primary .col-label {
		color: var(--color-lumen-ember);
	}
	.col-count {
		font-family: var(--font-mono);
		font-size: 10px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		border-radius: 99px;
		padding: 1px 7px;
	}
	.col-count-primary {
		background: hsl(32 100% 60% / 0.15);
		color: var(--color-lumen-ember);
	}

	.col-body {
		min-height: 8rem;
		border-radius: 10px;
		border: 1px solid;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.empty-hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		text-align: center;
		padding: 1.5rem 0.5rem;
		font-style: italic;
		opacity: 0.7;
	}

	.show-more {
		background: none;
		border: 1px dashed var(--color-border);
		border-radius: 6px;
		padding: 5px 10px;
		font-size: 11px;
		color: var(--color-muted-foreground);
		cursor: pointer;
		width: 100%;
		transition: background 150ms, color 150ms;
		font-family: inherit;
	}
	.show-more:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.lumen-warn {
		background: hsl(32 100% 60% / 0.12);
		border: 1px solid hsl(32 100% 60% / 0.35);
		border-radius: 8px;
		padding: 8px 14px;
		font-size: 12px;
		color: var(--color-lumen-ember);
		margin-bottom: 12px;
		font-weight: 500;
	}
</style>
