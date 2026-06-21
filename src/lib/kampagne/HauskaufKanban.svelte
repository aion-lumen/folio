<!--
  2026-06-08 Bauteil 2.7c: HauskaufKanban — 4-Spalten-Brett mit
  Visual-Mimikry des LIFE-KanbanBoard. Eigene Komponente weil Hauskauf-
  Items keine chapter_number/slug haben und der Status-Uebergang direkt
  via POST /api/kampagne erfolgt (kein chapter-spezifischer Endpoint).

  Spalten: Offen / In Arbeit / Blockiert / Erledigt (LIFE-Grammatik).
  Spalten-Toenung analog KanbanBoard: bg-slate/amber/red/green-50.
  Sortierung pro Spalte (im Komponenten-derived, nicht Loader):
    - offen + in_arbeit: nach termin ASC (null ans Ende)
    - blockiert + erledigt: nach recorded_at DESC

  Drag&Drop fuer Spalten-Uebergaenge via svelte-dnd-action.
  Bei Drop auf 'blockiert' oeffnet sich ein Inline-Input fuer
  Block-Grund auf der gedroppten Karte (Promise-resolve nach Submit).
  Kein Drag-Reorder innerhalb Spalte (Direktive-Verbot).
-->
<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { invalidateAll } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	import HauskaufCard from './HauskaufCard.svelte';
	import type { HauskaufCard as HauskaufCardData, MailLink } from './types.js';
	import type { HauskaufStatus } from '$lib/server/folio-db/types.js';

	let { cards }: { cards: HauskaufCardData[] } = $props();

	type Column = { id: HauskaufStatus; label: string; empty: string };
	const columns: Column[] = [
		{ id: 'offen', label: 'Offen', empty: 'Noch keine Anfrage.' },
		{ id: 'in_arbeit', label: 'In Arbeit', empty: 'Kein Termin in Vorbereitung.' },
		{ id: 'blockiert', label: 'Blockiert', empty: 'Nichts blockiert 🙂' },
		{ id: 'erledigt', label: 'Erledigt', empty: 'Hier landen besichtigte Objekte.' }
	];

	// dnd-action braucht items mit string id. Workflow.id ist number — wir
	// stringen es.
	type DndItem = HauskaufCardData & { id: string };

	function parseTsMs(s: string): number {
		const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
		const n = new Date(iso).getTime();
		return Number.isFinite(n) ? n : 0;
	}

	function sortItems(items: DndItem[], col: HauskaufStatus): DndItem[] {
		const sorted = [...items];
		if (col === 'offen' || col === 'in_arbeit') {
			// termin ASC (null/undefined ans Ende)
			sorted.sort((a, b) => {
				const at = a.workflow.termin;
				const bt = b.workflow.termin;
				if (!at && !bt) return 0;
				if (!at) return 1;
				if (!bt) return -1;
				return at.localeCompare(bt);
			});
		} else {
			// blockiert + erledigt: recorded_at DESC
			sorted.sort((a, b) => parseTsMs(b.workflow.recorded_at) - parseTsMs(a.workflow.recorded_at));
		}
		return sorted;
	}

	function buildColumns(): Record<HauskaufStatus, DndItem[]> {
		const out: Record<HauskaufStatus, DndItem[]> = {
			offen: [], in_arbeit: [], blockiert: [], erledigt: []
		};
		for (const c of cards) {
			out[c.workflow.status].push({ ...c, id: String(c.workflow.id) });
		}
		for (const col of columns) out[col.id] = sortItems(out[col.id], col.id);
		return out;
	}

	let columnItems = $state<Record<HauskaufStatus, DndItem[]>>(buildColumns());
	$effect(() => {
		void cards;
		columnItems = buildColumns();
	});

	// Block-Grund-Input bei Drop auf Blockiert
	let blockGrundFor = $state<{ council_object_id: string; workflow: DndItem } | null>(null);
	let blockGrundInput = $state('');

	async function handleDrop(colId: HauskaufStatus, items: DndItem[]) {
		// Welcher Item ist neu in dieser Spalte?
		const moved = items.find((item) => {
			const original = cards.find((c) => String(c.workflow.id) === item.id);
			return original && original.workflow.status !== colId;
		});
		columnItems[colId] = items;
		if (!moved) return;

		if (colId === 'blockiert') {
			blockGrundFor = { council_object_id: moved.workflow.council_object_id, workflow: moved };
			blockGrundInput = moved.workflow.notes ?? '';
			// Wait fuer User-Submit (handleBlockGrundCommit)
			return;
		}

		await postStatusChange(moved, colId, null);
	}

	async function handleBlockGrundCommit() {
		if (!blockGrundFor) return;
		const note = blockGrundInput.trim();
		if (!note) {
			// Cancel: zurueck in alte Spalte
			columnItems = buildColumns();
			blockGrundFor = null;
			blockGrundInput = '';
			return;
		}
		const item = blockGrundFor.workflow;
		blockGrundFor = null;
		blockGrundInput = '';
		await postStatusChange(item, 'blockiert', note);
	}
	function handleBlockGrundCancel() {
		columnItems = buildColumns();
		blockGrundFor = null;
		blockGrundInput = '';
	}
	function onBlockGrundKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void handleBlockGrundCommit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			handleBlockGrundCancel();
		}
	}

	async function postStatusChange(
		item: DndItem,
		newStatus: HauskaufStatus,
		blockNote: string | null
	): Promise<void> {
		const w = item.workflow;
		// Body so bauen dass CHECK-Constraint im DB akzeptiert wird:
		//   in_arbeit braucht termin, erledigt braucht verhandlungspreis,
		//   blockiert akzeptiert notes (block-grund).
		const body: Record<string, unknown> = {
			council_object_id: w.council_object_id,
			status: newStatus,
			termin: w.termin,
			verhandlungspreis: w.verhandlungspreis,
			notes: blockNote ?? w.notes,
			verdict: newStatus === 'erledigt' ? w.verdict : null
		};
		try {
			const res = await fetch('/api/kampagne', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				toastStore.show(`Fehler: HTTP ${res.status} — ${text.slice(0, 80)}`, 3000);
				// Re-build columns vom Loader-Zustand
				columnItems = buildColumns();
				return;
			}
			toastStore.show(`Status: ${newStatus}`, 1500);
			await invalidateAll();
		} catch (e) {
			toastStore.show(`Fehler: ${e instanceof Error ? e.message : String(e)}`, 3000);
			columnItems = buildColumns();
		}
	}

	// Spalten-Farben analog KanbanBoard.svelte:113-118 (LIFE-Konsistenz).
	const colColors: Record<HauskaufStatus, string> = {
		offen: 'bg-slate-50 border-slate-200',
		in_arbeit: 'bg-amber-50/60 border-amber-200',
		blockiert: 'bg-red-50 border-red-200',
		erledigt: 'bg-green-50 border-green-200'
	};
</script>

<div class="hk-kanban">
	{#each columns as col (col.id)}
		{@const items = columnItems[col.id] ?? []}
		{@const isPrimary = col.id === 'in_arbeit'}
		<div class="hk-col" class:hk-col-primary={isPrimary}>
			<div class="hk-col-head" class:hk-col-head-primary={isPrimary}>
				<span class="hk-col-label">{col.label}</span>
				<span class="hk-col-count" class:hk-col-count-primary={isPrimary}>{items.length}</span>
			</div>
			<div
				class="hk-col-body {colColors[col.id]}"
				use:dndzone={{ items: columnItems[col.id] ?? [], flipDurationMs: 150 }}
				onconsider={(e) => { columnItems[col.id] = e.detail.items as DndItem[]; }}
				onfinalize={(e) => handleDrop(col.id, e.detail.items as DndItem[])}
			>
				{#if items.length === 0}
					<div class="hk-empty">{col.empty}</div>
				{/if}
				{#each items as item (item.id)}
					{#if blockGrundFor && String(blockGrundFor.workflow.id) === item.id}
						<div class="hk-block-input">
							<div class="bi-label">Block-Grund</div>
							<input
								type="text"
								class="bi-input"
								placeholder="z.B. Makler bis 12.6. in Ferien"
								bind:value={blockGrundInput}
								onkeydown={onBlockGrundKey}
								autofocus
							/>
							<div class="bi-actions">
								<button type="button" class="bi-cancel" onclick={handleBlockGrundCancel}>Abbrechen</button>
								<button type="button" class="bi-ok" onclick={handleBlockGrundCommit}>Speichern</button>
							</div>
						</div>
					{:else}
						<HauskaufCard
							workflow={item.workflow}
							object={item.object}
							mailLinks={item.mailLinks as MailLink[]}
						/>
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	/* Mimikry von KanbanBoard.svelte:189-254 — LIFE-Konsistenz. */
	.hk-kanban {
		display: flex;
		gap: 14px;
		overflow-x: auto;
		padding-bottom: 1rem;
		align-items: flex-start;
	}
	.hk-col {
		flex-shrink: 0;
		width: 15rem;
		display: flex;
		flex-direction: column;
	}
	.hk-col-primary {
		width: 19rem;
	}
	.hk-col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		padding: 0 2px;
	}
	.hk-col-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-foreground);
		letter-spacing: 0.01em;
	}
	.hk-col-head-primary .hk-col-label {
		color: var(--color-lumen-ember);
	}
	.hk-col-count {
		font-family: var(--font-mono);
		font-size: 10px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		border-radius: 99px;
		padding: 1px 7px;
	}
	.hk-col-count-primary {
		background: hsl(32 100% 60% / 0.15);
		color: var(--color-lumen-ember);
	}
	.hk-col-body {
		min-height: 8rem;
		border-radius: 10px;
		border: 1px solid;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.hk-empty {
		font-size: 12px;
		color: var(--color-muted-foreground);
		text-align: center;
		padding: 1.5rem 0.5rem;
		font-style: italic;
		opacity: 0.7;
	}
	.hk-block-input {
		background: white;
		border: 1px solid hsl(0 65% 50%);
		border-radius: 8px;
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bi-label {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(0 65% 38%);
	}
	.bi-input {
		font: inherit;
		font-size: 12px;
		border: 1px solid hsl(214 25% 88%);
		border-radius: 4px;
		padding: 4px 6px;
		outline: 0;
	}
	.bi-input:focus {
		border-color: hsl(0 65% 50%);
	}
	.bi-actions {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
	}
	.bi-cancel,
	.bi-ok {
		font: inherit;
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
	}
	.bi-cancel {
		background: transparent;
		border: 1px solid hsl(214 25% 85%);
		color: hsl(215 16% 40%);
	}
	.bi-ok {
		background: hsl(0 65% 45%);
		border: 0;
		color: white;
	}
</style>
