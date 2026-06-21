import type { Objective } from '$lib/types/campaign';

class SelectionStore {
	selectedIds = $state<Set<string>>(new Set());
	lastSelectedId = $state<string | null>(null);

	toggle(id: string) {
		const next = new Set(this.selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
			this.lastSelectedId = id;
		}
		this.selectedIds = next;
	}

	select(id: string) {
		this.selectedIds = new Set([id]);
		this.lastSelectedId = id;
	}

	selectRange(toId: string, allOrderedIds: string[]) {
		if (!this.lastSelectedId) {
			this.select(toId);
			return;
		}
		const fromIdx = allOrderedIds.indexOf(this.lastSelectedId);
		const toIdx = allOrderedIds.indexOf(toId);
		if (fromIdx === -1 || toIdx === -1) {
			this.select(toId);
			return;
		}
		const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
		this.selectedIds = new Set(allOrderedIds.slice(start, end + 1));
		this.lastSelectedId = toId;
	}

	clear() {
		this.selectedIds = new Set();
		this.lastSelectedId = null;
	}

	isSelected(id: string): boolean {
		return this.selectedIds.has(id);
	}

	getSelected(allObjectives: Objective[]): Objective[] {
		return allObjectives.filter((o) => this.selectedIds.has(o.id));
	}
}

export const selectionStore = new SelectionStore();
