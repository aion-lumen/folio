// F.4.C Mock-Daten-Port — Dev/Storybook only, nicht Produktionspfad.
// Yahoo-Rows kommen aus echter feedback.db; Mock deckt gmail + mirhamed_ch ab.
// ~200 deterministische Rows + 4 Disagreements (Repro-RNG). Ersetzbar wenn
// Multi-Account-IMAP vollständig integriert ist — bis dahin UI-Fixture.

import type { AccountId } from './mail-account.js';
import type { Tier } from './mail-tier.js';

export interface MockRow {
	id: string;
	account: AccountId;
	from_addr: string;
	from_name: string;
	subject: string;
	received_at: string; // ISO timestamp
	classification: string; // werbung | geschaeftspost | privat | spam | unklar
	confidence: number;
	evidence: string;
	suggested_action: string;
	reason: string;
	markers: string[];
	tier: 1 | 2 | 3;
	final_action: string;
	confirmed: boolean;
	response_ms: number;
}

// Deterministic RNG (matches sample-data-v2.js:42-45)
let _rng = 0;
function rng(): number {
	_rng = (_rng * 9301 + 49297) % 233280;
	return _rng / 233280;
}
function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(rng() * arr.length)] as T;
}
function intBetween(lo: number, hi: number): number {
	return lo + Math.floor(rng() * (hi - lo + 1));
}

const NOW = new Date('2026-05-17T11:42:00+02:00');
const DAY_MS = 24 * 3600 * 1000;
function tsFor(daysAgo: number): string {
	const d = new Date(NOW.getTime() - daysAgo * DAY_MS);
	d.setHours(intBetween(6, 22), intBetween(0, 59), 0, 0);
	return d.toISOString();
}

let _id = 0;
function makeRow(r: Omit<MockRow, 'id'>): MockRow {
	_id++;
	return { id: `m_${String(_id).padStart(4, '0')}`, ...r };
}

interface Template {
	addr: string;
	name: string;
	subjects: string[];
	cls: string;
}

function generate(
	templates: Template[],
	action: string,
	accountId: AccountId,
	count: number,
	daysBack: number
): MockRow[] {
	const out: MockRow[] = [];
	for (let i = 0; i < count; i++) {
		const tpl = pick(templates);
		const dayAgo = intBetween(0, daysBack);
		const subject = pick(tpl.subjects);
		const tier: 1 | 2 | 3 = action === 'move_zu_pruefen' ? 3 : rng() < 0.7 ? 1 : 2;
		const conf =
			tier === 1 ? 0.85 + rng() * 0.13 : tier === 2 ? 0.7 + rng() * 0.18 : 0.42 + rng() * 0.18;
		out.push(
			makeRow({
				account: accountId,
				from_addr: tpl.addr,
				from_name: tpl.name,
				subject,
				received_at: tsFor(dayAgo),
				classification: tpl.cls,
				confidence: conf,
				evidence:
					action === 'keep'
						? 'transactional · sender bekannt'
						: action === 'move_immo_portal'
							? 'Portal-Subdomain · standardisierter Betreff'
							: action === 'move_paketzustellung'
								? 'Tracking-Pattern · Logistik-Domain'
								: 'niedrige Konfidenz · Pattern unklar',
				suggested_action: action,
				reason:
					action === 'keep'
						? 'transactional / persönlich'
						: action === 'move_immo_portal'
							? 'Portal-Suchalert'
							: action === 'move_paketzustellung'
								? 'Logistik-Sender'
								: 'Heuristik unsicher',
				markers:
					tier === 1
						? ['domain_known', 'regex_match']
						: tier === 2
							? ['plugin_classified']
							: ['low_confidence'],
				tier,
				final_action: action,
				confirmed: true,
				response_ms: 400 + Math.floor(rng() * 2400)
			})
		);
	}
	return out;
}

// ── Templates per Account (minimaler Sub-Set aus sample-data-v2.js) ──
const gmailKeepTpl: Template[] = [
	{
		addr: 'service@migros.ch',
		name: 'Migros Cumulus',
		subjects: ['Bonscheck', 'Punkte-Auszug', 'Aktion der Woche'],
		cls: 'werbung'
	},
	{
		addr: 'news@nzz.ch',
		name: 'NZZ',
		subjects: ['Morgenbriefing', 'Wochenrückblick'],
		cls: 'werbung'
	},
	{
		addr: 'noreply@sbb.ch',
		name: 'SBB',
		subjects: ['GA Erneuerung', 'Reservation IC 723 → Bern', 'Sparbillett gebucht'],
		cls: 'geschaeftspost'
	},
	{
		addr: 'billing@github.com',
		name: 'GitHub',
		subjects: ['Receipt', 'Subscription renewed'],
		cls: 'geschaeftspost'
	},
	{
		addr: 'info@swisscom.ch',
		name: 'Swisscom',
		subjects: ['Rechnung', 'Vertragsverlängerung', 'Outage-Information'],
		cls: 'geschaeftspost'
	}
];

const gmailImmoPortalTpl: Template[] = [
	{
		addr: 'angebot@suchen.immowelt.de',
		name: 'ImmoWelt',
		subjects: ['3 neue Wohnungen · Zürich', 'Re: Sihlfeld 12', 'Preisanpassung Ihrer Favoriten'],
		cls: 'werbung'
	},
	{
		addr: 'alert@immoscout24.ch',
		name: 'ImmoScout24',
		subjects: ['1 neuer Treffer · Wollishofen', 'Daily Digest'],
		cls: 'werbung'
	}
];

const gmailPaketeTpl: Template[] = [
	{
		addr: 'noreply@amazon.de',
		name: 'Amazon',
		subjects: ['Ihre Bestellung wurde versandt', 'Lieferung am Donnerstag'],
		cls: 'geschaeftspost'
	},
	{
		addr: 'tracking@dhl.de',
		name: 'DHL',
		subjects: ['Sendung XYZ123 unterwegs', 'Lieferung steht an'],
		cls: 'geschaeftspost'
	}
];

const gmailZuPruefenTpl: Template[] = [
	{
		addr: 'hello@rabbit.tech',
		name: 'Rabbit',
		subjects: ['Update: r1 firmware v0.7', 'Your shipping address'],
		cls: 'werbung'
	}
];

const mirhamedKeepTpl: Template[] = [
	{
		addr: 'noreply@steueramt.zh.ch',
		name: 'Steueramt ZH',
		subjects: ['Eingang Steuererklärung', 'Provisorische Rechnung'],
		cls: 'geschaeftspost'
	},
	{
		addr: 'verwaltung@axoflux-engineering.ch',
		name: 'Axoflux',
		subjects: ['Re: Bewerbung Senior Engineer', 'Terminvorschlag Vorstellungsgespräch'],
		cls: 'geschaeftspost'
	}
];

const mirhamedZuPruefenTpl: Template[] = [
	{
		addr: 'noreply@swisspass.ch',
		name: 'SwissPass',
		subjects: ['Account-Update: Bestätigung nötig'],
		cls: 'unklar'
	}
];

// ── Generate-Lists (resets RNG seed for deterministic output) ──
function buildMockRows(): MockRow[] {
	_rng = 0;
	_id = 0;
	const rows: MockRow[] = [];
	// gmail (~80 rows total — reduziert vs sample-data-v2's 3600)
	rows.push(...generate(gmailKeepTpl, 'keep', 'gmail', 55, 90));
	rows.push(...generate(gmailImmoPortalTpl, 'move_immo_portal', 'gmail', 12, 60));
	rows.push(...generate(gmailPaketeTpl, 'move_paketzustellung', 'gmail', 8, 30));
	rows.push(...generate(gmailZuPruefenTpl, 'move_zu_pruefen', 'gmail', 3, 30));

	// gmail Disagreements (overrides — final_action != suggested_action)
	rows.push(
		makeRow({
			account: 'gmail',
			from_addr: 'jobs-noreply@linkedin.com',
			from_name: 'LinkedIn Jobs',
			subject: '7 neue Jobs für dich · Staff Engineer Zürich',
			received_at: tsFor(intBetween(2, 30)),
			classification: 'werbung',
			confidence: 0.54,
			evidence: 'Bulk-Sender · viele Empfänger',
			suggested_action: 'move_zu_pruefen',
			reason: 'Job-Mail zwischen Werbung & relevant',
			markers: ['bulk_sender', 'low_confidence'],
			tier: 2,
			final_action: 'keep',
			confirmed: false,
			response_ms: 5200
		})
	);
	rows.push(
		makeRow({
			account: 'gmail',
			from_addr: 'no-reply@amazon-feedback.de',
			from_name: 'Amazon Feedback',
			subject: 'Ihre Meinung zu Ihrer letzten Bestellung',
			received_at: tsFor(intBetween(2, 90)),
			classification: 'werbung',
			confidence: 0.58,
			evidence: 'Amazon-nahe Domain · Survey-Pattern',
			suggested_action: 'keep',
			reason: 'Amazon-Domain · vermutet transactional',
			markers: ['amazon_adjacent', 'survey_pattern'],
			tier: 2,
			final_action: 'move_zu_pruefen',
			confirmed: false,
			response_ms: 6400
		})
	);
	rows.push(
		makeRow({
			account: 'gmail',
			from_addr: 'verwaltung@blattner-immo.ch',
			from_name: 'Blattner Immo',
			subject: 'Re: Ihre Bewerbung Sihlfeld 12 — Unterlagen erhalten',
			received_at: tsFor(intBetween(10, 40)),
			classification: 'geschaeftspost',
			confidence: 0.62,
			evidence: 'Makler-Domain · individueller Bezug',
			suggested_action: 'move_immo_portal',
			reason: 'Immo-Domain bekannt',
			markers: ['broker_domain', 'application_ref'],
			tier: 2,
			final_action: 'move_immo_privat',
			confirmed: false,
			response_ms: 7800
		})
	);

	// mirhamed_ch (~10 rows — small custom domain)
	rows.push(...generate(mirhamedKeepTpl, 'keep', 'mirhamed_ch', 8, 180));
	rows.push(...generate(mirhamedZuPruefenTpl, 'move_zu_pruefen', 'mirhamed_ch', 2, 60));

	return rows;
}

// Memoized at module-load (deterministic — same import always returns same data)
let _cache: MockRow[] | null = null;
export function getMockRows(): MockRow[] {
	if (!_cache) _cache = buildMockRows();
	return _cache;
}

export function getMockRowsForAccount(id: AccountId): MockRow[] {
	return getMockRows().filter((r) => r.account === id);
}

// Is-Disagreement helper
export function isDisagreement(r: MockRow): boolean {
	return r.final_action !== r.suggested_action || !r.confirmed;
}

// F.4.F — Synthetic stress-data generator for performance testing.
// Generates N rows with mixed account/action/tier/confidence distribution.
// Reuses deterministic RNG; each call resets seed for reproducibility.
const STRESS_ACTIONS = [
	'keep',
	'move_immo_portal',
	'move_immo_privat',
	'move_paketzustellung',
	'move_zu_pruefen'
];
const STRESS_ACCOUNTS: AccountId[] = ['gmail', 'yahoo', 'mirhamed_ch'];
const STRESS_TIERS: (1 | 2 | 3)[] = [1, 2, 3];

export function getStressRows(count: number): MockRow[] {
	_rng = 99999; // Separate seed from mock-base
	const rows: MockRow[] = [];
	for (let i = 0; i < count; i++) {
		const account = pick(STRESS_ACCOUNTS);
		const suggested = pick(STRESS_ACTIONS);
		const confirmed = rng() > 0.3; // ~30% disagreement rate
		const final_action = confirmed ? suggested : pick(STRESS_ACTIONS);
		const conf = 0.4 + rng() * 0.6;
		const daysAgo = intBetween(0, 60);
		const senderDomain =
			account === 'gmail'
				? `${['news', 'updates', 'no-reply', 'team'][intBetween(0, 3)]}@${['nzz.ch', 'srf.ch', 'spiegel.de', 'zeit.de'][intBetween(0, 3)]}`
				: account === 'yahoo'
				? `${['info', 'noreply', 'service'][intBetween(0, 2)]}@${['immowelt.de', 'immoscout24.ch', 'amazon.de', 'paypal.com'][intBetween(0, 3)]}`
				: `${['post', 'kontakt', 'service'][intBetween(0, 2)]}@${['mirhamed.ch', 'bafu.admin.ch', 'sbb.ch'][intBetween(0, 2)]}`;
		rows.push({
			id: `m_${String(900000 + i).padStart(6, '0')}`,
			account,
			from_addr: senderDomain,
			from_name: senderDomain.split('@')[0],
			subject: `[Stress ${i}] Synthetic mail row for performance testing`,
			received_at: tsFor(daysAgo),
			classification: pick(['werbung', 'geschaeftspost', 'newsletter_business', 'privat']),
			confidence: conf,
			evidence: `synthetic_evidence_${i}`,
			suggested_action: suggested,
			reason: `synthetic_reason_${i}`,
			markers: ['stress_synthetic'],
			tier: pick(STRESS_TIERS),
			final_action,
			confirmed,
			response_ms: intBetween(500, 12000)
		});
	}
	return rows;
}
