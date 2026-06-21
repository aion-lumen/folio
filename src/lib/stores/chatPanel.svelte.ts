const DEFAULT_WIDTH = 320;

class ChatPanelStore {
	width = $state(DEFAULT_WIDTH);
	collapsed = $state(false);

	init() {
		if (typeof window === 'undefined') return;
		const w = localStorage.getItem('dashboard.chatPanelWidth');
		const c = localStorage.getItem('dashboard.chatPanelCollapsed');
		if (w) this.width = Math.max(320, Math.min(800, parseInt(w, 10)));
		if (c) this.collapsed = c === 'true';
	}

	setWidth(w: number) {
		this.width = w;
		if (typeof window !== 'undefined') {
			localStorage.setItem('dashboard.chatPanelWidth', String(w));
		}
	}

	toggleCollapse() {
		this.collapsed = !this.collapsed;
		if (typeof window !== 'undefined') {
			localStorage.setItem('dashboard.chatPanelCollapsed', String(this.collapsed));
		}
	}
}

export const chatPanelStore = new ChatPanelStore();
