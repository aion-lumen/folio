import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getVaultPath } from '$lib/server/env.js';

interface MailboxState {
	last_run?: string;
	stats?: { total_processed?: number; errors?: number };
}

interface AccountState {
	[mailbox: string]: MailboxState;
}

function formatLastRun(isoDate: string | null | undefined): { label: string; sub: string; hours: number } {
	if (!isoDate) return { label: 'noch nie gelaufen', sub: '—', hours: Infinity };
	const date = new Date(isoDate);
	if (isNaN(date.getTime())) return { label: 'unbekannt', sub: '—', hours: Infinity };

	const hours = (Date.now() - date.getTime()) / 3_600_000;
	let label: string;
	if (hours < 1) label = `vor ${Math.round(hours * 60)} Min.`;
	else if (hours < 24) label = `vor ${Math.round(hours)} Std.`;
	else {
		const days = Math.floor(hours / 24);
		if (days === 1) label = 'vor 1 Tag';
		else if (days < 7) label = `vor ${days} Tagen`;
		else if (days < 30) label = `vor ${Math.floor(days / 7)} Wochen`;
		else label = 'vor mehr als einem Monat';
	}
	const sub = date.toLocaleString('de-CH', {
		hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
	});
	return { label, sub, hours };
}

export async function GET() {
	let raw: string;
	try {
		raw = await readFile(join(getVaultPath(), '_meta', 'mail', 'state.json'), 'utf-8');
	} catch {
		return json({ badge: null, fallback: true });
	}

	let state: { version?: number; accounts?: Record<string, AccountState> };
	try {
		state = JSON.parse(raw);
	} catch {
		return json({
			badge: 'red',
			error: { code: 'STATE_PARSE_ERROR', msg: 'state.json ist kein gültiges JSON.' }
		});
	}

	const accountsData = state.accounts ?? {};

	// Per-account: find latest last_run across all mailboxes, sum stats
	const perAccount = Object.entries(accountsData).map(([name, mailboxes]) => {
		let latestRun: string | null = null;
		let totalProcessed = 0;
		let totalErrors = 0;

		for (const mbox of Object.values(mailboxes)) {
			if (mbox.last_run && (!latestRun || mbox.last_run > latestRun)) {
				latestRun = mbox.last_run;
			}
			totalProcessed += mbox.stats?.total_processed ?? 0;
			totalErrors += mbox.stats?.errors ?? 0;
		}

		const { hours } = formatLastRun(latestRun);
		return { name, latestRun, totalProcessed, totalErrors, hoursAgo: hours };
	});

	// Overall: most recent run across all accounts
	const latestAccount = [...perAccount]
		.filter((a) => a.latestRun)
		.sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
	const latestRun = latestAccount?.latestRun ?? null;

	const { label: lastLabel, sub: lastSub, hours: lastHours } = formatLastRun(latestRun);
	const neverRun = !latestRun;
	const hasError = perAccount.some((a) => a.totalErrors > 0);

	const badge = hasError ? 'red' : neverRun || lastHours > 12 ? 'amber' : 'green';

	const totalProcessed = perAccount.reduce((s, a) => s + a.totalProcessed, 0);
	const accountNames = perAccount.map((a) => a.name);

	// Chip text shown in modal header
	const chipText = hasError
		? 'fehler · siehe details'
		: neverRun
		? 'noch nie gelaufen'
		: lastHours > 24
		? 'stillstand · >24 std.'
		: lastHours > 12
		? 'stillstand · >12 std.'
		: 'aktuell · gemma · lokal';

	return json({
		badge,
		chipText,
		conn: {
			nm: `${accountNames.length} Account${accountNames.length === 1 ? '' : 's'} · IMAP`,
			sub: accountNames.join(', '),
			dot: badge
		},
		last: { nm: lastLabel, sub: lastSub, dot: badge },
		today: {
			nm: `${totalProcessed} verarbeitet`,
			sub: neverRun ? 'noch nicht gelaufen' : 'insgesamt seit Start'
		},
		error: hasError
			? {
				code: 'PIPELINE_ERROR',
				t: lastSub,
				msg: 'Ein oder mehrere Accounts hatten Fehler beim letzten Lauf.',
				fix: 'Prüfe den Terminal-Output mit:',
				cmd: 'python3 pipeline.py --account <name>',
				post: ''
			}
			: null,
		perAccount: perAccount.map(({ name, hoursAgo }) => ({ name, hoursAgo }))
	});
}
