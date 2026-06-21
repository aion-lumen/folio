// F.4.D Sender-Aggregation für SenderSidebar.
// Computes Top-N Sender mit Count + Account-Cross-Reference.

import type { UnifiedMailRow } from '$lib/stores/mailQueue.svelte.js';
import type { AccountId } from './mail-account.js';

export interface SenderAggregate {
	domain: string; // sender-domain (e.g. "amazon.de")
	displayName: string; // sender from_name (best-effort) oder addr
	from_addr: string;
	count: number;
	accountIds: AccountId[]; // accounts where sender appears (sorted)
	disagreementCount: number;
}

function extractDomain(addr: string): string {
	const at = addr.lastIndexOf('@');
	return at >= 0 ? addr.slice(at + 1).toLowerCase() : addr.toLowerCase();
}

export function aggregateSenders(rows: UnifiedMailRow[]): SenderAggregate[] {
	const byDomain = new Map<string, SenderAggregate>();
	for (const r of rows) {
		const domain = extractDomain(r.from_addr);
		let agg = byDomain.get(domain);
		if (!agg) {
			agg = {
				domain,
				displayName: r.from_name || r.from_addr,
				from_addr: r.from_addr,
				count: 0,
				accountIds: [],
				disagreementCount: 0
			};
			byDomain.set(domain, agg);
		}
		agg.count++;
		if (!agg.accountIds.includes(r.account)) {
			agg.accountIds.push(r.account);
		}
		// Disagreement check (lightweight reuse — store's isDisagreement-Logic)
		if (r.suggested_action_confirmed === false) agg.disagreementCount++;
		else if (
			r.heuristic_suggested_action != null &&
			r.user_final_action != null &&
			r.heuristic_suggested_action !== r.user_final_action
		)
			agg.disagreementCount++;
	}
	const list = [...byDomain.values()];
	list.sort((a, b) => b.count - a.count);
	return list;
}

export function topSenders(rows: UnifiedMailRow[], n = 20): SenderAggregate[] {
	return aggregateSenders(rows).slice(0, n);
}
