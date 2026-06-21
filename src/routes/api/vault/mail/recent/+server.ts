import { json } from '@sveltejs/kit';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { getVaultPath } from '$lib/server/env.js';
import type { RequestHandler } from './$types.js';

const MAIL_ROOTS = ['restricted/mail', 'internal/mail'];

interface MailEntry {
	t: string;
	fr: string;
	subj: string;
	out: 'ok' | 'skip' | 'herm' | 'fail';
	res: string;
}

async function walk(dir: string, files: { path: string; mtime: Date }[]): Promise<void> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			await walk(full, files);
		} else if (e.isFile() && e.name.endsWith('.md')) {
			const s = await stat(full);
			files.push({ path: full, mtime: s.mtime });
		}
	}
}

function outFromLayer(layer: string, urgency: string): MailEntry['out'] {
	if (layer === 'low') return 'skip';
	if (urgency === 'urgent' || urgency === 'action-needed') return 'ok';
	if (layer === 'high') return 'ok';
	return 'skip';
}

function formatTime(date: Date): string {
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
	if (diffDays === 0) return date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
	if (diffDays === 1) return 'gestern';
	return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
}

export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);
	const vaultPath = getVaultPath();

	const allFiles: { path: string; mtime: Date }[] = [];
	for (const root of MAIL_ROOTS) {
		await walk(join(vaultPath, root), allFiles);
	}

	// Sort newest first by mtime, then parse top N
	allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

	const results: MailEntry[] = [];
	for (const file of allFiles.slice(0, limit)) {
		try {
			const raw = await readFile(file.path, 'utf-8');
			const { data } = matter(raw);

			// Prefer classified_at (ISO 8601) over email date header (RFC 2822)
			const dateStr = String(data.classified_at ?? data.date ?? '');
			const date = dateStr ? new Date(dateStr) : file.mtime;

			const layer = String(data.layer ?? 'normal');
			const urgency = String(data.urgency ?? '');
			const category = String(data.category ?? '');
			const out = outFromLayer(layer, urgency);
			const res = category
				? `${category}${urgency === 'action-needed' ? ' · action-needed' : ''}`
				: out === 'skip' ? 'ignoriert' : '—';

			results.push({
				t: formatTime(isNaN(date.getTime()) ? file.mtime : date),
				fr: String(data.from_addr ?? data.from ?? data.sender ?? ''),
				subj: String(data.subject || file.path.split('/').pop()?.replace('.md', '') || ''),
				out,
				res
			});
		} catch {
			// skip unreadable/unparseable files
		}
	}

	return json(results);
};
