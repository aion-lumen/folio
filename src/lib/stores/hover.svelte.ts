class HoverStore {
	hoveredObjectiveId = $state<string | null>(null);

	enter(id: string) {
		this.hoveredObjectiveId = id;
	}

	leave() {
		this.hoveredObjectiveId = null;
	}
}

export const hoverStore = new HoverStore();
