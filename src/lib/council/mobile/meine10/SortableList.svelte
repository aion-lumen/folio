<!--
  Mobile 1d (2026-05-30): generic vertical-sortable list. Pointer-event-
  basiert (unified mouse+touch), keine externe library. Drag startet auf
  einem grip-handle (data-drag-handle), nicht auf der ganzen card — sonst
  fängt der drag jeden tap.

  Verwendung:
    <SortableList items={list} onReorder={(newOrder) => …}>
      {#snippet item({ value, index, isGrabbed, gripProps })}
        <div class="row" use:gripProps={…}>…</div>
      {/snippet}
    </SortableList>

  Hier minimal-API: items raus, item-snippet, gripProps als attribute-spread.
-->
<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';

	let {
		items,
		onReorder,
		itemSnippet
	}: {
		items: T[];
		onReorder: (newOrder: T[]) => void | Promise<void>;
		itemSnippet: Snippet<[{ value: T; index: number; isGrabbed: boolean; gripAttrs: Record<string, unknown> }]>;
	} = $props();

	// internal copy of order — diverges from props during drag
	let order = $state<T[]>([...items]);
	$effect(() => {
		// resync when caller-provided list changes and not currently dragging
		if (!grabbed) order = [...items];
	});

	let grabbed: { id: string; pointerId: number; startY: number; startIndex: number } | null = $state(null);
	let pointerY = $state(0);
	let itemHeight = $state(64); // fallback; measured on first drag

	function indexById(id: string): number {
		return order.findIndex((x) => x.id === id);
	}

	function onPointerDown(e: PointerEvent, id: string) {
		// only primary button on mouse
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const target = e.currentTarget as HTMLElement;
		const row = target.closest('[data-sortable-row]') as HTMLElement | null;
		if (row) itemHeight = row.getBoundingClientRect().height;
		grabbed = { id, pointerId: e.pointerId, startY: e.clientY, startIndex: indexById(id) };
		pointerY = e.clientY;
		target.setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (!grabbed || e.pointerId !== grabbed.pointerId) return;
		pointerY = e.clientY;
		const delta = pointerY - grabbed.startY;
		const slots = Math.round(delta / itemHeight);
		const targetIndex = Math.max(0, Math.min(order.length - 1, grabbed.startIndex + slots));
		const currentIndex = indexById(grabbed.id);
		if (targetIndex !== currentIndex) {
			// swap by removing and re-inserting
			const next = [...order];
			const [moved] = next.splice(currentIndex, 1);
			next.splice(targetIndex, 0, moved);
			order = next;
		}
	}

	async function onPointerUp(e: PointerEvent) {
		if (!grabbed || e.pointerId !== grabbed.pointerId) return;
		const id = grabbed.id;
		grabbed = null;
		// fire callback only if order actually changed vs. props
		const changed = order.some((x, i) => items[i]?.id !== x.id);
		if (changed) {
			const snapshot = [...order];
			try {
				await onReorder(snapshot);
			} catch {
				// revert to caller-list on failure
				order = [...items];
			}
		}
		void id;
	}

	function gripAttrs(id: string): Record<string, unknown> {
		return {
			onpointerdown: (ev: PointerEvent) => onPointerDown(ev, id),
			onpointermove: onPointerMove,
			onpointerup: onPointerUp,
			onpointercancel: onPointerUp,
			style: 'touch-action: none; cursor: grab;'
		};
	}
</script>

<ul class="sortable">
	{#each order as item, i (item.id)}
		{@const isGrabbed = grabbed?.id === item.id}
		<li
			class="sort-row"
			class:grabbed={isGrabbed}
			data-sortable-row
			style={isGrabbed && grabbed ? `transform: translateY(${pointerY - grabbed.startY}px); z-index: 5;` : ''}
		>
			{@render itemSnippet({ value: item, index: i, isGrabbed, gripAttrs: gripAttrs(item.id) })}
		</li>
	{/each}
</ul>

<style>
	.sortable {
		list-style: none;
		margin: 0;
		padding: 0;
		position: relative;
	}
	.sort-row {
		transition: transform 150ms ease, box-shadow 150ms ease;
		position: relative;
	}
	.sort-row.grabbed {
		transition: none;
		box-shadow: 0 10px 24px -8px hsl(0 0% 0% / 0.18);
		opacity: 0.96;
	}
</style>
