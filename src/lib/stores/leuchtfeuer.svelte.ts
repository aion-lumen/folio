class LeuchtfeuerStore {
	ids = $state<string[]>([]);
	week = $state<number>(0);
	maxReachedError = $state(false);
	private timer: ReturnType<typeof setTimeout> | null = null;

	async load() {
		try {
			const res = await fetch('/api/vault/leuchtfeuer');
			if (!res.ok) return;
			const data = await res.json();
			this.ids = data.ids ?? [];
			this.week = data.week ?? 0;
		} catch {
			// silently fail — leuchtfeuer is non-critical
		}
	}

	async toggle(objectiveId: string) {
		try {
			const res = await fetch('/api/vault/leuchtfeuer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ objective_id: objectiveId })
			});
			if (!res.ok) return;
			const data = await res.json();
			if (data.max_reached) {
				this.flashMaxError();
				return;
			}
			this.ids = data.ids ?? [];
		} catch {
			// silently fail
		}
	}

	isLit(id: string): boolean {
		return this.ids.includes(id);
	}

	private flashMaxError() {
		this.maxReachedError = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.maxReachedError = false;
		}, 4000);
	}
}

export const leuchtfeuerStore = new LeuchtfeuerStore();
