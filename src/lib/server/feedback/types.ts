// F.3 — feedback domain types. Mirror of state/feedback.db schema (19 cols).

export interface FeedbackRow {
	id: number;
	task_id: string;
	account_id: string; // F.6: accounts.toml-key ('yahoo' | 'gmail' | 'mirhamed')
	imap_uid: number;
	sender: string;
	subject: string;
	body_hash: string;
	plugin_value: string | null;
	plugin_confidence: number | null;
	plugin_evidence: string | null;
	heuristic_suggested_action: string | null;
	heuristic_reason: string | null;
	heuristic_confidence: string | null;
	heuristic_markers: string | null;
	user_classification: string | null;
	user_final_action: string | null;
	suggested_action_confirmed: number | null;
	response_time_ms: number | null;
	timeout_occurred: number | null;
	created_at: string;
	mail_date: string | null; // F.7-BUG-2: IMAP envelope-Date-Header (NULL für legacy-rows)
	domain: string | null;                  // F.8/F.8.5: immo|job|shopping|finance|kontakt|werbung|system|unsorted
	actionability: string | null;           // F.8: actionable|archive|archive-silent (frozen-at-insert)
	effective_actionability: string | null; // F.8: post time-decay (Worker NULL, Folio computed)
}

export interface FeedbackFilter {
	userFinalAction?: string;
	heuristicAction?: string;
	pluginValue?: string;
	senderDomain?: string;
	disagreementOnly?: boolean;
	dateFrom?: string;
	dateTo?: string;
	limit?: number;
	offset?: number;
}

export interface FeedbackCounts {
	byUserFinalAction: Record<string, number>;
	byHeuristicAction: Record<string, number>;
	total: number;
}

export interface MoveAction {
	action_key: string;
	display_label: string;
	target_folder: string;
	domain_id: string;
	active: boolean;
	sort_order: number;
}
