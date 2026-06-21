// F.4.E — Mail-Body Lookup.
// Strategy: feedback.db has task_id → look up Hermes-Kanban-Task (per-board kanban.db),
// parse Task.body for `### Body (erste N Zeichen)` codeblock, and latest executor-comment
// JSON for evidence/reasoning. Server-side cache (5min) prevents repeat-CLI/DB-hits.

import Database from 'better-sqlite3';
import { join } from 'path';
import { getHermesHomePath } from '../env.js';
import { readdirSync, statSync } from 'fs';

export interface MailBodyEvidence {
	type: string;
	content: string;
	source?: string;
	weight?: number;
}

export interface MailBodyResult {
	source: 'kanban' | 'unavailable';
	board: string | null;
	taskId: string;
	taskTitle: string | null;
	bodyText: string | null; // First 1000 chars of original email body (kanban-extracted)
	bodyTruncated: boolean; // Always true for kanban-sourced (worker stores only first 1000)
	taskFullBody: string | null; // Raw task body markdown for fallback rendering
	summary: string | null; // From task.result (latest_summary equivalent)
	evidence: MailBodyEvidence[];
	reasoning: string | null;
	classification: string | null;
	confidence: number | null;
	createdAt: number | null; // Task creation unix-ts
	fetchedAt: number;
}

interface CacheEntry {
	data: MailBodyResult;
	expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const BOARD_INDEX_TTL_MS = 60 * 60 * 1000;

const bodyCache = new Map<string, CacheEntry>();
let boardSlugsCache: { slugs: string[]; expiresAt: number } | null = null;

function getBoardsDir(): string {
	return join(getHermesHomePath(), 'kanban/boards');
}

function listBoardSlugs(): string[] {
	const now = Date.now();
	if (boardSlugsCache && boardSlugsCache.expiresAt > now) return boardSlugsCache.slugs;
	const dir = getBoardsDir();
	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		boardSlugsCache = { slugs: [], expiresAt: now + BOARD_INDEX_TTL_MS };
		return [];
	}
	const slugs: string[] = [];
	for (const name of entries) {
		const dbPath = join(dir, name, 'kanban.db');
		try {
			const s = statSync(dbPath);
			if (s.isFile()) slugs.push(name);
		} catch {
			// no kanban.db, skip
		}
	}
	boardSlugsCache = { slugs, expiresAt: now + BOARD_INDEX_TTL_MS };
	return slugs;
}

// Connection pool — one read-only handle per board, opened lazily.
const boardConns = new Map<string, Database.Database>();

function getBoardConn(slug: string): Database.Database | null {
	const cached = boardConns.get(slug);
	if (cached) return cached;
	const dbPath = join(getBoardsDir(), slug, 'kanban.db');
	try {
		const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
		conn.pragma('journal_mode'); // Touch to confirm WAL-aware
		boardConns.set(slug, conn);
		return conn;
	} catch {
		return null;
	}
}

function findTaskOnBoards(taskId: string): { slug: string; row: TaskRow } | null {
	for (const slug of listBoardSlugs()) {
		const conn = getBoardConn(slug);
		if (!conn) continue;
		try {
			const row = conn
				.prepare('SELECT id, title, body, result, created_at FROM tasks WHERE id = ?')
				.get(taskId) as TaskRow | undefined;
			if (row) return { slug, row };
		} catch {
			// Board-DB corruption or schema-mismatch — skip
		}
	}
	return null;
}

interface TaskRow {
	id: string;
	title: string | null;
	body: string | null;
	result: string | null;
	created_at: number | null;
}

interface CommentRow {
	body: string;
	author: string;
	created_at: number;
}

function getLatestExecutorComment(slug: string, taskId: string): CommentRow | null {
	const conn = getBoardConn(slug);
	if (!conn) return null;
	try {
		const row = conn
			.prepare(
				`SELECT body, author, created_at
				 FROM task_comments
				 WHERE task_id = ? AND author = 'executor'
				 ORDER BY created_at DESC
				 LIMIT 1`
			)
			.get(taskId) as CommentRow | undefined;
		return row ?? null;
	} catch {
		return null;
	}
}

// Extract `### Body (erste N Zeichen)\n\n```\n<content>\n```` section from task.body markdown.
function extractBodyExcerpt(taskBody: string): string | null {
	const m = taskBody.match(/### Body[^\n]*\n+```\n([\s\S]*?)\n```/);
	if (!m) return null;
	return m[1];
}

// Parse executor comment which is a ```json ... ``` codeblock with evidence/reasoning.
interface ExecutorPayload {
	result?: { value?: string; confidence?: number; reasoning_summary?: string };
	evidence?: MailBodyEvidence[];
}

function parseExecutorComment(commentBody: string): ExecutorPayload | null {
	const m = commentBody.match(/```json\n([\s\S]*?)\n```/);
	const raw = m ? m[1] : commentBody;
	try {
		return JSON.parse(raw) as ExecutorPayload;
	} catch {
		return null;
	}
}

export function lookupMailBody(taskId: string): MailBodyResult {
	const now = Date.now();
	const cached = bodyCache.get(taskId);
	if (cached && cached.expiresAt > now) return cached.data;

	const found = findTaskOnBoards(taskId);
	if (!found) {
		const fallback: MailBodyResult = {
			source: 'unavailable',
			board: null,
			taskId,
			taskTitle: null,
			bodyText: null,
			bodyTruncated: false,
			taskFullBody: null,
			summary: null,
			evidence: [],
			reasoning: null,
			classification: null,
			confidence: null,
			createdAt: null,
			fetchedAt: now
		};
		bodyCache.set(taskId, { data: fallback, expiresAt: now + CACHE_TTL_MS });
		return fallback;
	}

	const { slug, row } = found;
	const bodyText = row.body ? extractBodyExcerpt(row.body) : null;
	const comment = getLatestExecutorComment(slug, taskId);
	const payload = comment ? parseExecutorComment(comment.body) : null;

	const data: MailBodyResult = {
		source: 'kanban',
		board: slug,
		taskId,
		taskTitle: row.title,
		bodyText,
		bodyTruncated: bodyText != null, // Worker stores only first 1000 chars
		taskFullBody: row.body,
		summary: payload?.result?.reasoning_summary ?? null,
		evidence: payload?.evidence ?? [],
		reasoning: payload?.result?.reasoning_summary ?? null,
		classification: payload?.result?.value ?? row.result,
		confidence: payload?.result?.confidence ?? null,
		createdAt: row.created_at,
		fetchedAt: now
	};
	bodyCache.set(taskId, { data, expiresAt: now + CACHE_TTL_MS });
	return data;
}

// Test-helper: clear caches between runs if needed.
export function _clearCaches(): void {
	bodyCache.clear();
	boardSlugsCache = null;
	for (const conn of boardConns.values()) {
		try {
			conn.close();
		} catch {
			// ignore
		}
	}
	boardConns.clear();
}
