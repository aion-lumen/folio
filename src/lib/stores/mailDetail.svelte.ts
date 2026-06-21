// F.4.E — Detail-Panel-State + Body-Cache.
// State: selectedUid + per-uid body-cache + fetch-lifecycle.
// On open(uid): set selectedUid → trigger lazy fetch via $effect in DetailPanel.
// Cache is Map<uid, MailBodyResponse>; survives DetailPanel-close.

import { tlog, ttrace } from '$lib/util/debug-trace.js';

export interface MailBodyResponse {
	uid: string;
	source: 'kanban' | 'mock' | 'unavailable';
	board: string | null;
	taskId: string | null;
	taskTitle: string | null;
	bodyText: string | null;
	bodyTruncated: boolean;
	summary: string | null;
	evidence: { type: string; content: string; source?: string; weight?: number }[];
	reasoning: string | null;
	classification: string | null;
	confidence: number | null;
}

// F.8 BUG-D Fix-2 + BUG-G2: Snapshot of row data at open-time. Used as fallback
// when row gets filtered out of mailQueueStore.rows post-invalidateAll (z.B. auto-
// mark-as-read removes from "Nur ungelesen"-Filter, or validator-end re-computes
// effective_actionability and shifts row out of default actionable-filter).
// We use `unknown` here to avoid circular import with mailQueue.svelte.ts.
export interface CachedRowSnapshot {
	uid: string;
	row: unknown; // snapshot of UnifiedMailRow at open-time
}

class MailDetailStore {
	selectedUid = $state<string | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	cache = $state<Record<string, MailBodyResponse>>({});
	// F.8: snapshot for resilience when row filtered out
	cachedRow = $state<CachedRowSnapshot | null>(null);

	open(uid: string, row?: unknown): void {
		tlog('detail.open', { uid, prevSelected: this.selectedUid, hasRow: !!row });
		this.selectedUid = uid;
		this.error = null;
		if (row) {
			this.cachedRow = { uid, row };
		}
		if (!this.cache[uid]) {
			this.fetch(uid);
		}
	}

	close(): void {
		// F.8 BUG-J: stack-trace tells us who called close() (ESC, X-button, banner)
		ttrace('detail.close', { prevSelected: this.selectedUid });
		this.selectedUid = null;
		this.cachedRow = null;
		this.error = null;
		this.loading = false;
	}

	private async fetch(uid: string): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const res = await fetch(`/api/mail/body/${encodeURIComponent(uid)}`);
			if (!res.ok) {
				this.error = `HTTP ${res.status}`;
				this.loading = false;
				return;
			}
			const data = (await res.json()) as MailBodyResponse;
			this.cache = { ...this.cache, [uid]: data };
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	}

	get current(): MailBodyResponse | null {
		if (!this.selectedUid) return null;
		return this.cache[this.selectedUid] ?? null;
	}
}

export const mailDetailStore = new MailDetailStore();
