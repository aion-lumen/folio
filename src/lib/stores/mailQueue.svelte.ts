// F.4.C Runes-Store für Mail-Queue-View.
// State: rows, filters, sse-status.
// Live-Update via SSE → silent refetch via SvelteKit invalidateAll().
// Per-Account-aware Counts via $derived.

import { browser } from '$app/environment';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { AccountId } from '$lib/util/mail-account.js';
import { inferAccount } from '$lib/util/mail-account.js';
import { inferTier, type Tier } from '$lib/util/mail-tier.js';
import { workerRunStore } from './workerRun.svelte.js';
import { tlog } from '$lib/util/debug-trace.js';

// F.5 — Correction-shape gemirrort von folio-db/types.ts (Client-side flat copy).
// Server-Load attached die latest correction per row in +page.server.ts (in-memory JOIN).
// F.8 Block-E: corrected_domain + corrected_actionability added (2-axes primary).
export interface RowCorrection {
	id: number;
	feedback_id: number;
	imap_uid: number;
	previous_action: string | null;
	corrected_action: string; // compact `${domain}/${actionability}` for back-compat
	corrected_domain: string | null;
	corrected_actionability: string | null;
	note: string | null;
	correction_marker: string | null; // D.9 2026-05-27: 'zu-weit' | 'zu-klein' | null
	source: string;
	corrected_at: string;
}

// F.7 + F.8 Block-E — Validator-Opinion shape mit 2-axes columns.
export interface RowValidatorOpinion {
	id: number;
	feedback_id: number;
	imap_uid: number;
	validator_model: string;
	validator_action: string; // compact `${domain}/${actionability}` for back-compat
	validator_domain: string | null;
	validator_actionability: string | null;
	validator_confidence: number | null;
	validator_reasoning: string | null;
	evaluated_at: string;
}

// Unified row type — Daten-Quelle-agnostic (echte feedback.db oder Mock).
export interface UnifiedMailRow {
	uid: string; // feedback.db id-as-string ODER m_NNNN (mock)
	task_id: string | null;
	account: AccountId;
	from_addr: string;
	from_name: string | null;
	subject: string;
	received_at: string; // ISO — envelope date if available, else import-time
	imported_at: string | null; // F.7-BUG-2: Worker-Import-Time (created_at) — null bei mock
	classification: string | null;
	confidence: number | null;
	heuristic_suggested_action: string | null;
	heuristic_reason: string | null;
	heuristic_markers: string[] | null;
	user_classification: string | null;
	user_final_action: string | null;
	suggested_action_confirmed: boolean | null;
	response_time_ms: number | null;
	timeout_occurred: boolean;
	tier: Tier;
	isMock: boolean;
	correction?: RowCorrection | null; // F.5: present nur bei yahoo-rows mit folio.db-Korrektur
	reviewed?: boolean; // F.7: review_state.feedback_id exists
	validator_opinion?: RowValidatorOpinion | null; // F.7: latest opinion per feedback (legacy, kept for Detail-Panel)
	// F.8 — 2-Achsen-Classification
	domain?: string | null;                  // immo|job|shopping|finance|kontakt|werbung|system|unsorted
	actionability?: string | null;           // actionable|archive|archive-silent (frozen-at-insert)
	effective_actionability?: string | null; // post time-decay (Folio computed)
	// Lens-UI Stimmen-Streifen (Direktive lens-ui-2026-05-26): multi-opinion + pre-computed
	// consensus state. voices is a structurally-typed array of Voice (kind discriminated);
	// server-side typed via $lib/server/lenses/voices.ts. UI imports the Voice type as well.
	voices?: import('$lib/server/lenses/voices.js').Voice[];
	consensus_state?: 'still' | 'ne' | 'ne-strong';
	// Review-Followup D.10 2026-05-27: server-side pre-compute per row,
	// gespeist aus regelwerk + user_context. DetailPanel-Info-Icon zeigt sie.
	active_rules?: import('$lib/server/regelwerk/active-rules.js').ActiveRules;
}

// F.9 BUG-K2 (2026-05-22) — Filterleiste konsolidiert: Sort-Menü zeigt separate
// Items pro Richtung (Architekt-Q3). Vorher 3 Werte (time-desc, confidence-asc,
// disagreement-first) → jetzt 6 inkl. Reverse-Richtungen + Sender A→Z.
export type SortBy =
	| 'time-desc'
	| 'time-asc'
	| 'confidence-asc'
	| 'confidence-desc'
	| 'disagreement-first'
	| 'sender-asc';

export const SORT_OPTIONS: { value: SortBy; label: string; arrow: string }[] = [
	{ value: 'time-desc', label: 'Zeit', arrow: '↓' },
	{ value: 'time-asc', label: 'Zeit', arrow: '↑' },
	{ value: 'confidence-asc', label: 'Konfidenz', arrow: '↑' },
	{ value: 'confidence-desc', label: 'Konfidenz', arrow: '↓' },
	{ value: 'disagreement-first', label: 'Disagreement zuerst', arrow: '≠' },
	{ value: 'sender-asc', label: 'Sender (A→Z)', arrow: '↑' }
];

export interface Filters {
	account: AccountId | 'all';
	actions: string[];
	sortBy: SortBy;
	senderFilter: string | null;
	disagreementOnly: boolean;
	unreviewedOnly: boolean; // F.7
	validatorOnly: boolean; // F.7-BUG-B: nur Mails mit validator_opinion
	domains: string[]; // F.8: filter by domain (empty = all)
	actionabilityLevels: string[]; // F.8: filter by actionability (empty = all levels)
	recentImportedOnly: boolean; // 2026-05-25 — nur mails imported in letzter 1h (für Smoke nach Worker-Run)
}

// Threshold für recentImportedOnly-Filter (in ms). Default 1h.
export const RECENT_IMPORT_WINDOW_MS = 60 * 60 * 1000;

export const DEFAULT_FILTERS: Filters = {
	account: 'all',
	actions: [],
	sortBy: 'time-desc',
	senderFilter: null,
	disagreementOnly: false,
	unreviewedOnly: false,
	validatorOnly: false,
	domains: [],
	actionabilityLevels: [], // empty = all levels (no actionability pre-filter)
	recentImportedOnly: false
};

// Disagreement-Definition: L1 action-override OR L2 confirmed=0.
// F.5: effectiveAction = corrected_action (falls Korrektur vorhanden) sonst user_final_action.
// Korrektur kann Disagreement aufheben (correct == heur) oder neu schaffen (correct != heur).
export function effectiveAction(r: UnifiedMailRow): string | null {
	return r.correction?.corrected_action ?? r.user_final_action;
}

export function isDisagreement(r: UnifiedMailRow): boolean {
	const final = effectiveAction(r);
	if (r.suggested_action_confirmed === false && !r.correction) return true;
	if (
		r.heuristic_suggested_action != null &&
		final != null &&
		r.heuristic_suggested_action !== final
	) {
		return true;
	}
	// F.8 BUG-I2 (Variante A): Validator-Achsen-Divergenz zaehlt als Disagreement.
	// Jede einzelne Achsen-Divergenz (domain ODER actionability) reicht.
	if (isValidatorDisagreement(r)) return true;
	return false;
}

// F.8 BUG-I2 — Validator vs Heuristik (Domain × Actionability).
// Liefert true falls validator_opinion existiert und mind. eine Achse abweicht.
export function isValidatorDisagreement(r: UnifiedMailRow): boolean {
	const vo = r.validator_opinion;
	if (!vo) return false;
	const heurDom = r.domain;
	const heurAct = r.effective_actionability ?? r.actionability;
	if (vo.validator_domain != null && heurDom != null && vo.validator_domain !== heurDom) {
		return true;
	}
	if (
		vo.validator_actionability != null &&
		heurAct != null &&
		vo.validator_actionability !== heurAct
	) {
		return true;
	}
	return false;
}

class MailQueueStore {
	rows = $state<UnifiedMailRow[]>([]);
	filters = $state<Filters>({ ...DEFAULT_FILTERS });
	sse = $state<{ connected: boolean; lastEventAt: string | null }>({
		connected: false,
		lastEventAt: null
	});

	// Derived counts (uses effectiveAction to respect corrections)
	countsByAction = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const r of this.rows) {
			const k = effectiveAction(r) ?? 'pending';
			m[k] = (m[k] ?? 0) + 1;
		}
		return m;
	});

	countsByAccount = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const r of this.rows) m[r.account] = (m[r.account] ?? 0) + 1;
		return m;
	});

	disagreementCount = $derived.by(() => this.rows.filter(isDisagreement).length);

	// F.9 BUG-K2 (2026-05-22) — Filterleiste konsolidiert: "N offen" Stat im
	// InlineStats-Bereich der MailToolbar. Zählt unreviewed-rows der aktuellen Filter.
	unreviewedCount = $derived.by(() => this.rows.filter((r) => r.reviewed === false).length);

	uniqueSenderCount = $derived.by(() => new Set(this.rows.map((r) => r.from_addr)).size);

	total = $derived(this.rows.length);

	confirmedPct = $derived.by(() => {
		if (this.rows.length === 0) return 0;
		const confirmed = this.rows.filter((r) => r.suggested_action_confirmed === true).length;
		return Math.round((confirmed * 100) / this.rows.length);
	});

	private eventSource: EventSource | null = null;

	hydrate(rows: UnifiedMailRow[], filters: Filters): void {
		this.rows = rows;
		this.filters = filters;
	}

	startSSE(): void {
		if (!browser || this.eventSource) return;
		try {
			this.eventSource = new EventSource('/api/mail/watch');
			this.eventSource.onopen = () => {
				this.sse = { connected: true, lastEventAt: this.sse.lastEventAt };
			};
			this.eventSource.onerror = () => {
				this.sse = { connected: false, lastEventAt: this.sse.lastEventAt };
			};
			this.eventSource.onmessage = async (ev) => {
				this.sse = { connected: true, lastEventAt: new Date().toISOString() };
				try {
					JSON.parse(ev.data);
				} catch {
					return;
				}
				// F.8 BUG-I1+I3+J: Wenn der Pipeline-Busy ist (Worker-Run, Validator-Run
				// oder Worker→Auto-Validator-Transition), per-Mail-Event UI-side ignorieren.
				// workerRunStore Pipeline-End-Merge fires einmalig invalidateAll + Toast.
				if (workerRunStore.pipelineBusy) {
					tlog('mailQueue.sse.skip', {
						activeRun: workerRunStore.activeRun?.uuid ?? null,
						pipelineInTransition: workerRunStore.pipelineInTransition
					});
					return;
				}
				tlog('mailQueue.sse.invalidateAll', { reason: 'idle-update' });
				await invalidateAll();
			};
		} catch (e) {
			console.warn('[mailQueue] SSE setup failed:', e);
		}
	}

	stopSSE(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.sse = { connected: false, lastEventAt: this.sse.lastEventAt };
	}

	// URL-bound filter setter (Plan v15 P2).
	async setFilter<K extends keyof Filters>(key: K, value: Filters[K]): Promise<void> {
		if (!browser) return;
		const sp = new URLSearchParams(page.url.search);
		// Special handling per filter type
		if (key === 'account') {
			if (value === 'all') sp.delete('account');
			else sp.set('account', String(value));
			// Sender-Filter ist Cross-Account-Konstrukt → bei Account-Switch obsolet.
			// Verhindert leere Schnittmenge wenn ein vorher gewählter Sender in
			// dem neuen Account nicht existiert (sticky-filter-bug F.4.F-2nd-smoke).
			sp.delete('sender');
		} else if (key === 'actions') {
			const arr = value as string[];
			if (arr.length === 0) sp.delete('actions');
			else sp.set('actions', arr.join(','));
		} else if (key === 'sortBy') {
			if (value === 'time-desc') sp.delete('sortBy');
			else sp.set('sortBy', String(value));
		} else if (key === 'senderFilter') {
			if (!value) sp.delete('sender');
			else sp.set('sender', String(value));
		} else if (key === 'disagreementOnly') {
			if (!value) sp.delete('disagreement');
			else sp.set('disagreement', '1');
		} else if (key === 'unreviewedOnly') {
			if (!value) sp.delete('unreviewed');
			else sp.set('unreviewed', '1');
		} else if (key === 'validatorOnly') {
			if (!value) sp.delete('validator');
			else sp.set('validator', '1');
		} else if (key === 'recentImportedOnly') {
			if (!value) sp.delete('recent');
			else sp.set('recent', '1');
		} else if (key === 'domains') {
			const arr = value as string[];
			if (arr.length === 0) sp.delete('domains');
			else sp.set('domains', arr.join(','));
		} else if (key === 'actionabilityLevels') {
			const arr = value as string[];
			// Default [] (= all levels) not in URL
			if (arr.length === 0) sp.delete('actionability');
			else sp.set('actionability', arr.join(','));
		}
		const newUrl = sp.toString() ? `?${sp}` : '/mail-queue';
		await goto(newUrl.startsWith('?') ? `/mail-queue${newUrl}` : newUrl, {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	toggleAction(action: string): void {
		const current = this.filters.actions;
		const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
		this.setFilter('actions', next);
	}

	clearActions(): void {
		this.setFilter('actions', []);
	}

	// F.5 — Reset alle Filter inkl. Account zurück auf 'all'.
	// Sticky-Filter-Pattern aus F.4.F: URL-Clear bedeutet wirklich alle Filter weg.
	async clearAllFilters(): Promise<void> {
		if (!browser) return;
		await goto('/mail-queue', {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}
}

export const mailQueueStore = new MailQueueStore();

// Helper: parse Filters from URL search-params (used in +page.server.ts + client-mirror).
export function filtersFromUrl(searchParams: URLSearchParams): Filters {
	const account = (searchParams.get('account') ?? 'all') as Filters['account'];
	const actionsStr = searchParams.get('actions');
	const actions = actionsStr ? actionsStr.split(',').filter(Boolean) : [];
	const sortByRaw = searchParams.get('sortBy') ?? 'time-desc';
	const VALID_SORTS: SortBy[] = [
		'time-desc', 'time-asc',
		'confidence-asc', 'confidence-desc',
		'disagreement-first', 'sender-asc'
	];
	const sortBy: SortBy = VALID_SORTS.includes(sortByRaw as SortBy)
		? (sortByRaw as SortBy)
		: 'time-desc';
	return {
		account,
		actions,
		sortBy,
		senderFilter: searchParams.get('sender') ?? null,
		disagreementOnly: searchParams.get('disagreement') === '1',
		unreviewedOnly: searchParams.get('unreviewed') === '1',
		validatorOnly: searchParams.get('validator') === '1',
		recentImportedOnly: searchParams.get('recent') === '1',
		domains: (searchParams.get('domains') ?? '').split(',').filter(Boolean),
		actionabilityLevels: (() => {
			const raw = searchParams.get('actionability');
			if (!raw) return []; // empty = all levels (no pre-filter)
			if (raw === 'all') return []; // back-compat for old bookmarked URLs
			return raw.split(',').filter(Boolean);
		})()
	};
}

// F.6: Map accounts.toml-key (Worker schreibt 'mirhamed') → Folio AccountId-Union
// ('mirhamed_ch'). Rename-Konvergenz wandert nach F.8 (Brand-Migration).
// Defensive fallback auf 'yahoo' für legacy null/empty values vor Migration.
function mapAccountIdFromDb(dbValue: string | null | undefined): AccountId {
	if (dbValue === 'mirhamed') return 'mirhamed_ch';
	// Demo-store structural masking: konto-a / konto-b are never real identifiers.
	if (dbValue === 'konto-a' || dbValue === 'konto_a') return 'konto_a';
	if (dbValue === 'konto-b' || dbValue === 'konto_b') return 'konto_b';
	if (dbValue === 'gmail' || dbValue === 'yahoo' || dbValue === 'mirhamed_ch') return dbValue;
	return 'yahoo';
}

// Helper: convert feedback.db FeedbackRow to UnifiedMailRow (server-side use).
export function unifyFeedbackRow(r: {
	id: number;
	task_id: string;
	account_id?: string | null;
	sender: string;
	subject: string;
	plugin_value: string | null;
	plugin_confidence: number | null;
	heuristic_suggested_action: string | null;
	heuristic_reason: string | null;
	heuristic_markers: string | null;
	user_classification: string | null;
	user_final_action: string | null;
	suggested_action_confirmed: number | null;
	response_time_ms: number | null;
	timeout_occurred: number | null;
	created_at: string;
	mail_date?: string | null;
	domain?: string | null;
	actionability?: string | null;
	effective_actionability?: string | null;
}): UnifiedMailRow {
	let from_addr = r.sender;
	let from_name: string | null = null;
	const m = r.sender.match(/^(.*?)\s*<([^>]+)>$/);
	if (m) {
		from_name = m[1].trim() || null;
		from_addr = m[2].trim();
	}
	let markers: string[] | null = null;
	if (r.heuristic_markers) {
		try {
			const p = JSON.parse(r.heuristic_markers);
			if (Array.isArray(p)) markers = p as string[];
		} catch {
			markers = null;
		}
	}
	return {
		uid: String(r.id),
		task_id: r.task_id,
		account: r.account_id ? mapAccountIdFromDb(r.account_id) : inferAccount(from_addr),
		from_addr,
		from_name,
		subject: r.subject,
		// F.7-BUG-2: prefer envelope-Date-Header; legacy-rows fallback auf import-time
		received_at: r.mail_date ?? r.created_at,
		imported_at: r.created_at,
		domain: r.domain ?? null,
		actionability: r.actionability ?? null,
		effective_actionability: r.effective_actionability ?? null,
		classification: r.plugin_value,
		confidence: r.plugin_confidence,
		heuristic_suggested_action: r.heuristic_suggested_action,
		heuristic_reason: r.heuristic_reason,
		heuristic_markers: markers,
		user_classification: r.user_classification,
		user_final_action: r.user_final_action,
		suggested_action_confirmed: r.suggested_action_confirmed === 1,
		response_time_ms: r.response_time_ms,
		timeout_occurred: r.timeout_occurred === 1,
		tier: inferTier(r.heuristic_markers),
		isMock: false
	};
}

// Helper: convert mock-row to UnifiedMailRow (server-side use).
export function unifyMockRow(m: {
	id: string;
	account: AccountId;
	from_addr: string;
	from_name: string;
	subject: string;
	received_at: string;
	classification: string;
	confidence: number;
	suggested_action: string;
	reason: string;
	markers: string[];
	tier: 1 | 2 | 3;
	final_action: string;
	confirmed: boolean;
	response_ms: number;
}): UnifiedMailRow {
	return {
		uid: m.id,
		task_id: null,
		account: m.account,
		from_addr: m.from_addr,
		from_name: m.from_name,
		subject: m.subject,
		received_at: m.received_at,
		imported_at: null,
		// F.8 Mock-rows get unsorted+actionable defaults
		domain: 'unsorted',
		actionability: 'actionable',
		effective_actionability: 'actionable',
		classification: m.classification,
		confidence: m.confidence,
		heuristic_suggested_action: m.suggested_action,
		heuristic_reason: m.reason,
		heuristic_markers: m.markers,
		user_classification: m.confirmed ? m.classification : null,
		user_final_action: m.final_action,
		suggested_action_confirmed: m.confirmed,
		response_time_ms: m.response_ms,
		timeout_occurred: false,
		tier: (`T${m.tier}` as Tier),
		isMock: true
	};
}

// Server-side: apply filters in-memory to UnifiedRows (server-load uses this).
export function applyFilters(rows: UnifiedMailRow[], filters: Filters): UnifiedMailRow[] {
	let out = rows;
	if (filters.account !== 'all') out = out.filter((r) => r.account === filters.account);
	if (filters.actions.length > 0)
		out = out.filter((r) => {
			const a = effectiveAction(r);
			return a != null && filters.actions.includes(a);
		});
	if (filters.senderFilter)
		out = out.filter((r) => r.from_addr.toLowerCase().includes(filters.senderFilter!.toLowerCase()));
	if (filters.disagreementOnly) out = out.filter(isDisagreement);
	if (filters.validatorOnly) out = out.filter((r) => r.validator_opinion != null);
	if (filters.recentImportedOnly) {
		const cutoff = Date.now() - RECENT_IMPORT_WINDOW_MS;
		out = out.filter((r) => {
			if (!r.imported_at) return false;
			return new Date(r.imported_at).getTime() >= cutoff;
		});
	}
	// F.8 — Domain-Filter (multi-select)
	if (filters.domains.length > 0) {
		out = out.filter((r) => r.domain != null && filters.domains.includes(r.domain));
	}
	// F.8 — Actionability-Filter (multi-select, default ['actionable'])
	// 2026-06-06 Bauteil 2: Stumm-Tab (UI-Wert 'archive-silent') merged auch
	// time-decay-'archive' mit ein — UI hat nur 3 Tabs (Aktionable /
	// Übernommen / Stumm), backend 'archive' war historisch wenig genutzt
	// und teilt semantisch das „nicht im Aktionable-Pool"-Bucket.
	if (filters.actionabilityLevels.length > 0) {
		const levels = new Set(filters.actionabilityLevels);
		if (levels.has('archive-silent')) levels.add('archive');
		// Bauteil-7 G5 (2026-06-09): Auto-Reply ist eigene UI-Spur
		// ("Korrespondenz"). Wenn User explizit 'auto_reply' selektiert,
		// wirken die Pattern direkt; sonst landet auto_reply im
		// Stumm-Tab analog 'archive-silent' (User sieht nicht aktiv
		// als To-Do, kann aber via Stumm-Filter rauspicken).
		if (levels.has('archive-silent')) levels.add('auto_reply');
		out = out.filter((r) => {
			const a = r.effective_actionability ?? r.actionability;
			return a != null && levels.has(a);
		});
	}
	// Sort
	// F.8 BUG-H1: ISO-strings mit gemischten TZ-Offsets (immowelt: -06:00, linkedin: +00:00)
	// können lex-string-DESC nicht korrekt ordnen — `T08:30` > `T04:42` als Substring, obwohl
	// `04:42-06:00` (= 10:42 UTC) NEWER ist als `08:30+00:00`. Date-parse normalisiert TZ.
	const tsDesc = (a: UnifiedMailRow, b: UnifiedMailRow) =>
		new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
	if (filters.sortBy === 'time-desc') {
		out = [...out].sort(tsDesc);
	} else if (filters.sortBy === 'time-asc') {
		out = [...out].sort((a, b) =>
			new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
		);
	} else if (filters.sortBy === 'confidence-asc') {
		out = [...out].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
	} else if (filters.sortBy === 'confidence-desc') {
		out = [...out].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
	} else if (filters.sortBy === 'disagreement-first') {
		out = [...out].sort((a, b) => {
			const ad = isDisagreement(a) ? 1 : 0;
			const bd = isDisagreement(b) ? 1 : 0;
			if (ad !== bd) return bd - ad;
			return tsDesc(a, b);
		});
	} else if (filters.sortBy === 'sender-asc') {
		out = [...out].sort((a, b) =>
			a.from_addr.localeCompare(b.from_addr, 'de-CH', { sensitivity: 'base' })
		);
	}
	return out;
}
