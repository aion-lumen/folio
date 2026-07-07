import matter from 'gray-matter';
import { loadAllActs, loadAllChapters } from '../vault/reader.js';
import type {
	FolioImportFrontmatter,
	FolioImportType,
	ParsedInboxDocument
} from './types.js';

const IMPORT_TYPES = new Set<FolioImportType>([
	'directive',
	'field-note',
	'objective-update',
	'note'
]);

const VALID_STATUSES = new Set([
	'todo',
	'not_started',
	'in_progress',
	'blocked',
	'done',
	'archived'
]);

const OBJECTIVE_ID_RE = /^obj-\d+[a-z]?-\d+$/;

export function parseInboxFile(filename: string, raw: string): ParsedInboxDocument {
	const { data, content } = matter(raw);
	return {
		filename,
		frontmatter: data as FolioImportFrontmatter,
		body: content.trim()
	};
}

export function validateFrontmatterShape(
	fm: Record<string, unknown>
): { ok: true; data: FolioImportFrontmatter } | { ok: false; error: string } {
	if (fm.folio_import !== 'v1') {
		return { ok: false, error: 'unsupported folio_import version' };
	}
	for (const field of ['type', 'target', 'id', 'source', 'created'] as const) {
		const val = fm[field];
		if (val === undefined || val === null || String(val).trim() === '') {
			return { ok: false, error: `missing field: ${field}` };
		}
	}
	const type = String(fm.type) as FolioImportType;
	if (!IMPORT_TYPES.has(type)) {
		return { ok: false, error: `unknown type: ${fm.type}` };
	}
	if (type === 'objective-update') {
		const patch = fm.patch;
		if (!patch || typeof patch !== 'object') {
			return { ok: false, error: 'objective-update requires patch' };
		}
		const p = patch as Record<string, unknown>;
		if (p.status !== undefined && !VALID_STATUSES.has(String(p.status))) {
			return { ok: false, error: `invalid patch.status: ${p.status}` };
		}
	}
	return { ok: true, data: fm as unknown as FolioImportFrontmatter };
}

interface VaultIndex {
	objectiveIds: Set<string>;
	chapterNumbers: Set<string>;
	chapterSlugs: Set<string>;
	actNumbers: Set<number>;
}

async function buildVaultIndex(): Promise<VaultIndex> {
	const [chapters, acts] = await Promise.all([loadAllChapters(), loadAllActs()]);
	const objectiveIds = new Set<string>();
	for (const ch of chapters) {
		for (const obj of ch.objectives) objectiveIds.add(obj.id);
	}
	return {
		objectiveIds,
		chapterNumbers: new Set(chapters.map((c) => String(c.chapter_number))),
		chapterSlugs: new Set(chapters.map((c) => c.slug)),
		actNumbers: new Set(acts.map((a) => a.act_number))
	};
}

export function resolveTargetKind(target: string): 'objective' | 'chapter' | 'act' | 'unknown' {
	if (OBJECTIVE_ID_RE.test(target)) return 'objective';
	if (/^act-\d+$/i.test(target)) return 'act';
	if (/^chapter-[\w]+$|^chapter-\d+[a-z]?$/i.test(target)) return 'chapter';
	if (/^\d+[a-z]?$/.test(target)) return 'chapter';
	return 'chapter'; // treat as slug fallback
}

export async function validateTargetExists(target: string): Promise<boolean> {
	const index = await buildVaultIndex();
	const kind = resolveTargetKind(target);
	if (kind === 'objective') return index.objectiveIds.has(target);
	if (kind === 'act') {
		const n = parseInt(target.replace(/^act-/i, ''), 10);
		return index.actNumbers.has(n);
	}
	if (/^\d+[a-z]?$/.test(target)) return index.chapterNumbers.has(target);
	if (/^chapter-(.+)$/i.test(target)) {
		const num = target.replace(/^chapter-/i, '');
		return index.chapterNumbers.has(num);
	}
	return index.chapterSlugs.has(target);
}

export async function validateDocument(
	doc: ParsedInboxDocument
): Promise<{ ok: true } | { ok: false; error: string }> {
	const shape = validateFrontmatterShape(doc.frontmatter as unknown as Record<string, unknown>);
	if (!shape.ok) return shape;
	if (shape.data.type === 'objective-update' && !OBJECTIVE_ID_RE.test(shape.data.target)) {
		return { ok: false, error: `objective-update target must be objective id, got: ${shape.data.target}` };
	}
	const exists = await validateTargetExists(shape.data.target);
	if (!exists) return { ok: false, error: `unknown target: ${shape.data.target}` };
	return { ok: true };
}

export function displayTitle(doc: ParsedInboxDocument): string {
	if (doc.frontmatter.title) return doc.frontmatter.title;
	const m = doc.body.match(/^#\s+(.+)$/m);
	return m ? m[1].trim() : doc.frontmatter.id;
}
