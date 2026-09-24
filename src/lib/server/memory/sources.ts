import { createHash } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type { MemorySensitivity } from './types.js';

export interface MemorySourceRow {
	source_id: string;
	source_kind: string;
	source_ref: string;
	title: string;
	relative_path: string | null;
	content_hash: string | null;
	sensitivity: MemorySensitivity;
	status: 'candidate' | 'confirmed' | 'rejected' | 'tombstoned';
	origin_run_id: string | null;
	origin_document_id: string | null;
	recorded_at: string;
	updated_at: string;
}

export interface MemorySourceDomainRow {
	source_id: string;
	domain: string;
	role: 'primary' | 'secondary';
	status: 'candidate' | 'confirmed' | 'rejected';
	reviewed_by: string | null;
	recorded_at: string;
}

export interface UpsertMemorySourceInput {
	source_kind: string;
	source_ref: string;
	title: string;
	relative_path?: string | null;
	content_hash?: string | null;
	sensitivity?: MemorySensitivity;
	origin_run_id?: string | null;
	origin_document_id?: string | null;
	primary_domain: string;
	secondary_domains?: string[];
	reviewed_by: string;
}

function required(value: string, name: string, max = 500): string {
	const normalized = value.trim();
	if (!normalized || normalized.length > max) throw new Error(`${name} ist ungültig.`);
	return normalized;
}

function sourceId(sourceRef: string): string {
	return `source-${createHash('sha256').update(sourceRef).digest('hex').slice(0, 32)}`;
}

export function upsertMemorySourceCandidate(input: UpsertMemorySourceInput): MemorySourceRow {
	const sourceRef = required(input.source_ref, 'source_ref', 600);
	const primary = required(input.primary_domain, 'primary_domain', 80);
	const secondary = [...new Set((input.secondary_domains ?? []).map((item) => item.trim()).filter(Boolean))]
		.filter((item) => item !== primary);
	if (secondary.length > 10) throw new Error('Zu viele Nebendomänen.');
	const now = new Date().toISOString();
	const id = sourceId(sourceRef);
	const db = getFolioDb();
	const transaction = db.transaction(() => {
		db.prepare(`INSERT INTO memory_sources (
			source_id, source_kind, source_ref, title, relative_path, content_hash, sensitivity,
			status, origin_run_id, origin_document_id, recorded_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?)
		ON CONFLICT(source_ref) DO UPDATE SET
			title = excluded.title,
			relative_path = excluded.relative_path,
			content_hash = COALESCE(excluded.content_hash, memory_sources.content_hash),
			origin_run_id = excluded.origin_run_id,
			origin_document_id = excluded.origin_document_id,
			status = CASE WHEN memory_sources.status = 'confirmed' THEN 'confirmed' ELSE 'candidate' END,
			updated_at = excluded.updated_at`).run(
			id,
			required(input.source_kind, 'source_kind', 80),
			sourceRef,
			required(input.title, 'title', 500),
			input.relative_path?.trim() || null,
			input.content_hash?.trim() || null,
			input.sensitivity ?? 'private',
			input.origin_run_id?.trim() || null,
			input.origin_document_id?.trim() || null,
			now,
			now
		);
		const row = db.prepare('SELECT source_id FROM memory_sources WHERE source_ref = ?').get(sourceRef) as { source_id: string };
		db.prepare('DELETE FROM memory_source_domains WHERE source_id = ?').run(row.source_id);
		const insert = db.prepare(`INSERT INTO memory_source_domains
			(source_id, domain, role, status, reviewed_by, recorded_at)
			VALUES (?, ?, ?, 'confirmed', ?, ?)`);
		insert.run(row.source_id, primary, 'primary', required(input.reviewed_by, 'reviewed_by', 120), now);
		for (const domain of secondary) insert.run(row.source_id, required(domain, 'domain', 80), 'secondary', input.reviewed_by, now);
	});
	transaction();
	return db.prepare('SELECT * FROM memory_sources WHERE source_ref = ?').get(sourceRef) as MemorySourceRow;
}

export function withdrawMemorySourceCandidate(sourceRef: string): void {
	const db = getFolioDb();
	const row = db.prepare('SELECT source_id, status FROM memory_sources WHERE source_ref = ?').get(sourceRef) as { source_id: string; status: string } | undefined;
	if (!row || row.status === 'confirmed') return;
	const now = new Date().toISOString();
	const transaction = db.transaction(() => {
		db.prepare("UPDATE memory_sources SET status = 'rejected', updated_at = ? WHERE source_id = ?").run(now, row.source_id);
		db.prepare("UPDATE memory_source_domains SET status = 'rejected' WHERE source_id = ?").run(row.source_id);
	});
	transaction();
}

export function listActiveMemorySources(): Array<MemorySourceRow & { domains: MemorySourceDomainRow[] }> {
	const db = getFolioDb();
	const sources = db.prepare("SELECT * FROM memory_sources WHERE status IN ('candidate','confirmed') ORDER BY updated_at DESC").all() as MemorySourceRow[];
	const domains = db.prepare("SELECT * FROM memory_source_domains WHERE status = 'confirmed' ORDER BY source_id, role, domain").all() as MemorySourceDomainRow[];
	const bySource = new Map<string, MemorySourceDomainRow[]>();
	for (const row of domains) bySource.set(row.source_id, [...(bySource.get(row.source_id) ?? []), row]);
	return sources.map((source) => ({ ...source, domains: bySource.get(source.source_id) ?? [] }));
}

export function findActiveMemorySource(sourceRef: string): MemorySourceRow | null {
	const row = getFolioDb().prepare(
		"SELECT * FROM memory_sources WHERE source_ref = ? AND status IN ('candidate','confirmed')"
	).get(required(sourceRef, 'source_ref', 600)) as MemorySourceRow | undefined;
	return row ?? null;
}
