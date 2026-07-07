export interface VaultListEntry {
	path: string;
	name: string;
	title: string;
	currentAct: number | null;
	currentChapter: number | null;
	updated: string | null;
	exists: boolean;
	active: boolean;
}
