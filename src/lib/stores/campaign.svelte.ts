import type { Campaign, Act, Chapter, Objective, VaultData } from '$lib/types/campaign.js';

class CampaignStore {
	campaign = $state<Campaign | null>(null);
	acts = $state<Act[]>([]);
	chapters = $state<Chapter[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	lastSynced = $state<Date | null>(null);
	syncState = $state<'synced' | 'syncing' | 'error'>('synced');

	allObjectives = $derived<Objective[]>(this.chapters.flatMap((c) => c.objectives));

	activeChapter = $derived(
		this.chapters.find(
			(c) => c.chapter_number === this.campaign?.current_chapter && c.status === 'active'
		) ?? null
	);

	activeAct = $derived(
		this.acts.find((a) => a.act_number === this.campaign?.current_act) ?? null
	);

	get campaignTitle(): string {
		const m = this.campaign?.body.match(/^#\s+(.+)/m);
		return m ? m[1].trim() : 'LIFE-Kampagne';
	}

	init(data: VaultData) {
		this.campaign = data.campaign;
		this.acts = data.acts;
		this.chapters = data.chapters;
	}

	async reload() {
		this.loading = true;
		this.syncState = 'syncing';
		this.error = null;
		try {
			const res = await fetch('/api/vault');
			if (!res.ok) throw new Error(`Vault fetch failed: ${res.status}`);
			const data: VaultData = await res.json();
			this.campaign = data.campaign;
			this.acts = data.acts;
			this.chapters = data.chapters;
			this.lastSynced = new Date();
			this.syncState = 'synced';
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			this.syncState = 'error';
		} finally {
			this.loading = false;
		}
	}

	subscribeToChanges() {
		const es = new EventSource('/api/watch');
		es.onmessage = () => {
			this.reload();
		};
		es.onerror = () => {
			setTimeout(() => this.subscribeToChanges(), 5000);
			es.close();
		};
		return () => es.close();
	}
}

export const campaignStore = new CampaignStore();
