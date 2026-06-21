class ToastStore {
	message = $state<string | null>(null);
	sticky = $state(false); // F.8 BUG-I3: persistent run-summary toasts haben sticky=true
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(msg: string, durationMs: number | 'sticky' = 2500) {
		this.message = msg;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (durationMs === 'sticky') {
			this.sticky = true;
			return;
		}
		this.sticky = false;
		this.timer = setTimeout(() => {
			this.message = null;
			this.sticky = false;
		}, durationMs);
	}

	dismiss() {
		this.message = null;
		this.sticky = false;
		if (this.timer) clearTimeout(this.timer);
	}
}

export const toastStore = new ToastStore();
