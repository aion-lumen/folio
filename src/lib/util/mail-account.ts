// F.4.C — Account-Type + Inferenz + Color-Map + Confidence-Thresholds.
// Multi-Account-Vorbau (F.4-Plan v13 D2): UI baut für gmail/yahoo/mirhamed.ch.
// F.6 wird inferAccount() durch echte account_id-Column ersetzen.

export type AccountId = 'gmail' | 'yahoo' | 'mirhamed_ch';
export const ACCOUNT_IDS: AccountId[] = ['gmail', 'yahoo', 'mirhamed_ch'];

export interface AccountMeta {
	id: AccountId;
	label: string;
	addr: string;
	desc: string;
}

export const ACCOUNTS: Record<AccountId, AccountMeta> = {
	gmail: {
		id: 'gmail',
		label: 'gmail',
		addr: 'you@example.com',
		desc: 'Privat · langjährig'
	},
	yahoo: {
		id: 'yahoo',
		label: 'yahoo',
		addr: 'you@example.net',
		desc: 'Tranche 1 (aktiv im Refactor)'
	},
	mirhamed_ch: {
		id: 'mirhamed_ch',
		label: 'mirhamed.ch',
		addr: 'you@example.org',
		desc: 'Behörden + Bewerbung'
	}
};

// Account-Color-Token-Map (Tailwind utility-class-strings aus app.css @theme).
export const ACCOUNT_CLASS: Record<AccountId, { dot: string; soft: string; deep: string }> = {
	gmail: {
		dot: 'bg-account-gmail',
		soft: 'bg-account-gmail-soft',
		deep: 'text-account-gmail-deep'
	},
	yahoo: {
		dot: 'bg-account-yahoo',
		soft: 'bg-account-yahoo-soft',
		deep: 'text-account-yahoo-deep'
	},
	mirhamed_ch: {
		dot: 'bg-account-mirhamed',
		soft: 'bg-account-mirhamed-soft',
		deep: 'text-account-mirhamed-deep'
	}
};

// Infer Account aus sender-domain. F.4-Vorbau: feedback.db hat kein account_id-Column.
// Engineer-Pre-Decision P1: yahoo aus DB (alle echten Rows = Yahoo), gmail+mirhamed aus Mock.
// inferAccount() ist Fallback wenn account-id nicht explizit gesetzt ist.
export function inferAccount(senderAddr: string | null | undefined): AccountId {
	if (!senderAddr) return 'yahoo';
	const lower = senderAddr.toLowerCase();
	if (lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com')) return 'gmail';
	if (lower.endsWith('@mirhamed.ch')) return 'mirhamed_ch';
	// All else: yahoo (incl. all yahoo-classified-rows in feedback.db die von 3rd-party-Senders kommen)
	return 'yahoo';
}

// Confidence-Thresholds — mq-shared.jsx:64 (per Plan v15 P4)
export const CONF_LOW_MAX = 0.6;
export const CONF_MID_MAX = 0.8;

export type ConfTier = 'low' | 'mid' | 'high';
export function confTier(confidence: number | null | undefined): ConfTier {
	if (confidence == null || confidence < CONF_LOW_MAX) return 'low';
	if (confidence < CONF_MID_MAX) return 'mid';
	return 'high';
}

export const CONF_CLASS: Record<ConfTier, string> = {
	low: 'text-conf-low',
	mid: 'text-conf-mid',
	high: 'text-conf-high'
};

// Action-Labels (deutsch, kompakt) per mq-shared / sample-data-v2 ACTION_LABELS
export const ACTION_LABELS: Record<string, string> = {
	keep: 'Behalten',
	move_immo_portal: 'Immo · Portal',
	move_immo_privat: 'Immo · Privat',
	move_paketzustellung: 'Paketzustellung',
	move_zu_pruefen: 'Zu prüfen'
};

// Action-Color-Class-Map
export const ACTION_CLASS: Record<string, { bg: string; fg: string; border: string; dot: string }> =
	{
		keep: {
			bg: 'bg-action-keep-bg',
			fg: 'text-action-keep-fg',
			border: 'border-action-keep-border',
			dot: 'bg-action-keep-dot'
		},
		move_immo_portal: {
			bg: 'bg-action-immo-portal-bg',
			fg: 'text-action-immo-portal-fg',
			border: 'border-action-immo-portal-border',
			dot: 'bg-action-immo-portal-dot'
		},
		move_immo_privat: {
			bg: 'bg-action-immo-privat-bg',
			fg: 'text-action-immo-privat-fg',
			border: 'border-action-immo-privat-border',
			dot: 'bg-action-immo-privat-dot'
		},
		move_paketzustellung: {
			bg: 'bg-action-paketzustellung-bg',
			fg: 'text-action-paketzustellung-fg',
			border: 'border-action-paketzustellung-border',
			dot: 'bg-action-paketzustellung-dot'
		},
		move_zu_pruefen: {
			bg: 'bg-action-zu-pruefen-bg',
			fg: 'text-action-zu-pruefen-fg',
			border: 'border-action-zu-pruefen-border',
			dot: 'bg-action-zu-pruefen-dot'
		}
	};

// F.8 — Domain × Actionability (replaces 5-Action-Schema in F.8-views).
// F.8.5: correspondence → kontakt rename + werbung als 8. Domain.
export type DomainKey =
	| 'immo'
	| 'job'
	| 'shopping'
	| 'finance'
	| 'kontakt'
	| 'werbung'
	| 'system'
	| 'unsorted';

// Chip-Order per Architekt-Spec: immo, job, shopping, finance, kontakt, werbung, system, unsorted
export const DOMAIN_KEYS: DomainKey[] = [
	'immo',
	'job',
	'shopping',
	'finance',
	'kontakt',
	'werbung',
	'system',
	'unsorted'
];

export const DOMAIN_LABELS: Record<DomainKey, string> = {
	immo: 'Immo',
	job: 'Job',
	shopping: 'Shopping',
	finance: 'Finance',
	kontakt: 'Kontakt',
	werbung: 'Werbung',
	system: 'System',
	unsorted: 'Unsortiert'
};

// Inline tailwind-color-classes (no app.css extension needed for F.8-MVP).
// F.8.5: werbung in orange (Marketing-Vibe, distinct von shopping-amber).
export const DOMAIN_CLASS: Record<DomainKey, { bg: string; fg: string; dot: string }> = {
	immo: { bg: 'bg-blue-500/15', fg: 'text-blue-700', dot: 'bg-blue-500' },
	job: { bg: 'bg-violet-500/15', fg: 'text-violet-700', dot: 'bg-violet-500' },
	shopping: { bg: 'bg-amber-500/15', fg: 'text-amber-700', dot: 'bg-amber-500' },
	finance: { bg: 'bg-emerald-500/15', fg: 'text-emerald-700', dot: 'bg-emerald-500' },
	kontakt: { bg: 'bg-pink-500/15', fg: 'text-pink-700', dot: 'bg-pink-500' },
	werbung: { bg: 'bg-orange-500/15', fg: 'text-orange-700', dot: 'bg-orange-500' },
	system: { bg: 'bg-slate-500/15', fg: 'text-slate-700', dot: 'bg-slate-500' },
	unsorted: { bg: 'bg-zinc-300/30', fg: 'text-zinc-600', dot: 'bg-zinc-400' }
};

// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang):
// 'uebernommen' = Council-Pipeline holt die Mail (Auto-Promotion bei
// Vier-Stimmen-Vollkonsens oder manuell via Folio-Detail-Panel).
// 'archive' (time-decay) bleibt als Backend-Wert erhalten, wird im UI mit
// 'archive-silent' im Stumm-Tab zusammen gemerged (siehe applyFilters in
// mailQueue.svelte.ts).
// Bauteil-7 G5 (2026-06-09): 'auto_reply' — Makler-Auto-Replies
// (Widerrufsbelehrung, Maklerauftrag etc.). Mail bleibt in domain
// immo/kontakt, aber Council-Ingest skipt, Mail-Tab versteckt im
// Default. IMAP-Cleanup verschiebt in _AionLumen/Korrespondenz
// (bleibt fuer Bauteil 8 Mail-Council-Verlinkung erhalten).
export type ActionabilityKey =
	| 'actionable'
	| 'archive'
	| 'archive-silent'
	| 'uebernommen'
	| 'auto_reply';

export const ACTIONABILITY_KEYS: ActionabilityKey[] = [
	'actionable',
	'uebernommen',
	'auto_reply',
	'archive-silent',
	'archive'
];

// 2026-06-06 Bauteil 2: UI zeigt nur drei Tabs/Chips, time-decay 'archive'
// wird in der Filter-Logik mit 'archive-silent' im Stumm-Tab gemerged
// (siehe applyFilters in mailQueue.svelte.ts).
// Bauteil-7 G5: 'auto_reply' als eigene UI-Spur (Korrespondenz).
export const ACTIONABILITY_UI_KEYS: ActionabilityKey[] = [
	'actionable',
	'uebernommen',
	'auto_reply',
	'archive-silent'
];

// CANONICAL SOURCE: ~/Projects/aion-lumen/multi-agent/config/regelwerk.yaml
// (action_definitions.<key>.label). Server-side wird das Regelwerk via
// $lib/server/regelwerk/loader.ts geladen + an page.data.regelwerk gereicht;
// Komponenten mit page-Kontext sollten primär dort lesen. Diese Konstante
// ist der Cache/Fallback für client-side Imports OHNE page-Kontext und
// MUSS bei Änderungen in regelwerk.yaml manuell synchron gehalten werden.
// Direktive 2026-05-26 Regelwerk-Zentralisierung (deutsche Labels per F3).
export const ACTIONABILITY_LABELS: Record<ActionabilityKey, string> = {
	actionable: 'Aktionable',
	uebernommen: 'Übernommen',
	auto_reply: 'Korrespondenz',
	archive: 'Archiv',
	'archive-silent': 'Stumm'
};

export const ACTIONABILITY_ICONS: Record<ActionabilityKey, string> = {
	actionable: '✓',
	uebernommen: '→',
	auto_reply: '↩',
	archive: '📥',
	'archive-silent': '🔇'
};

export const ACTIONABILITY_CLASS: Record<ActionabilityKey, string> = {
	actionable: 'text-foreground font-semibold',
	uebernommen: 'text-foreground font-semibold',
	auto_reply: 'text-muted-foreground italic',
	archive: 'text-muted-foreground',
	'archive-silent': 'text-muted-foreground/60'
};
