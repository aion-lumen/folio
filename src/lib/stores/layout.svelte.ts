function readLS(key: string): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(key);
}

function writeLS(key: string, val: string) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(key, val);
}

class LayoutStore {
	focusMode = $state(false);
	leftPanelCollapsed = $state(false);
	selectedAct = $state(1);
	selectedChapter = $state(1);
	leuchtfeuerFilterActive = $state(false);
	vaultName = $state('vault');

	init(currentAct: number, vaultName: string, currentChapter = 1) {
		this.selectedAct = currentAct;
		this.selectedChapter = currentChapter;
		this.vaultName = vaultName;
		const lpc = readLS('dashboard.leftPanelCollapsed');
		if (lpc !== null) this.leftPanelCollapsed = lpc === 'true';
		const fm = readLS('dashboard.focusMode');
		if (fm !== null) this.focusMode = fm === 'true';
	}

	toggleFocus() {
		this.focusMode = !this.focusMode;
		writeLS('dashboard.focusMode', String(this.focusMode));
	}

	exitFocus() {
		this.focusMode = false;
		writeLS('dashboard.focusMode', 'false');
	}

	toggleLeftPanel() {
		this.leftPanelCollapsed = !this.leftPanelCollapsed;
		writeLS('dashboard.leftPanelCollapsed', String(this.leftPanelCollapsed));
	}

	setSelectedAct(n: number) {
		this.selectedAct = n;
		this.leuchtfeuerFilterActive = false;
	}

	setSelectedChapter(n: number) {
		this.selectedChapter = n;
	}

	toggleLeuchtfeuerFilter() {
		this.leuchtfeuerFilterActive = !this.leuchtfeuerFilterActive;
	}
}

export const layoutStore = new LayoutStore();
