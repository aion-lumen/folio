import { cp, mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitInboxItems } from './commit.js';
import { resolveInboxDirs, scanInbox } from './scanner.js';
import { validateFrontmatterShape, validateDocument, parseInboxFile } from './schema.js';
import { archiveExpiredLeads } from './lead-ttl.js';

function leadDoc(fields: Record<string, string>): string {
	const base: Record<string, string> = {
		folio_import: 'v1',
		type: 'lead',
		target: 'current',
		id: 'lead-test-1',
		source: 'mail-pipeline',
		created: '2026-07-08T10:00:00+00:00',
		derived_from_external: 'true',
		rolle: 'Senior Python Developer',
		quelle: 'freelancermap',
		deadline: '2026-12-31',
		dedup_key: 'abc123def456'
	};
	const merged = { ...base, ...fields };
	const fm = Object.entries(merged)
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n');
	return `---\n${fm}\n---\n\n# Lead\n\n- Rolle: ${merged.rolle}\n`;
}

describe('inbox lead type', () => {
	let baseDir: string;
	let vaultDir: string;
	let ledgerPath: string;
	let dirs: ReturnType<typeof resolveInboxDirs>;

	beforeEach(async () => {
		baseDir = join(tmpdir(), `folio-lead-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		vaultDir = join(baseDir, 'vault');
		ledgerPath = join(baseDir, 'ledger.json');
		dirs = resolveInboxDirs(join(baseDir, 'inbox'));

		await mkdir(dirs.inbox, { recursive: true });
		await mkdir(dirs.rejected, { recursive: true });
		await mkdir(dirs.imported, { recursive: true });
		await cp(join(process.cwd(), 'templates/demo-vault'), vaultDir, { recursive: true });

		process.env.HOME = baseDir;
		process.env.VAULT_PATH = vaultDir;
		process.env.FOLIO_INBOX_PATH = dirs.inbox;
		await mkdir(join(baseDir, '.folio'), { recursive: true });
		await writeFile(join(baseDir, '.folio/active-vault.json'), JSON.stringify({ path: vaultDir }));
	});

	afterEach(() => {
		delete process.env.VAULT_PATH;
		delete process.env.FOLIO_INBOX_PATH;
		delete process.env.HOME;
	});

	it('validates lead shape: rolle + quelle required', () => {
		const ok = validateFrontmatterShape(parseInboxFile('x.md', leadDoc({})).frontmatter as never);
		expect(ok.ok).toBe(true);

		const missing = validateFrontmatterShape(
			parseInboxFile('x.md', leadDoc({ quelle: '' })).frontmatter as never
		);
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.error).toMatch(/quelle/);
	});

	it('accepts target: current sentinel (skips target-exists check)', async () => {
		const res = await validateDocument(parseInboxFile('x.md', leadDoc({})));
		expect(res.ok).toBe(true);
	});

	it('commits a lead as an objective in the current chapter', async () => {
		await writeFile(join(dirs.inbox, 'lead-test-1.md'), leadDoc({}), 'utf-8');
		const result = await commitInboxItems(['lead-test-1.md'], dirs, ledgerPath);
		expect(result.committed).toHaveLength(1);

		// current_chapter=1 → 01-neustart (status active) in the demo vault
		const chapter = await readFile(join(vaultDir, '_campaign/chapters/01-neustart.md'), 'utf-8');
		expect(chapter).toContain('Lead: Senior Python Developer @ freelancermap');
		expect(chapter).toContain('Bewerbung abgeschickt bis 2026-12-31');

		// file left the inbox
		const scan = await scanInbox(dirs, ledgerPath);
		expect(scan.items.find((i) => i.filename === 'lead-test-1.md')).toBeUndefined();
	});

	it('TTL archives an expired lead (deadline in the past)', async () => {
		await writeFile(
			join(dirs.inbox, 'lead-old.md'),
			leadDoc({ id: 'lead-old', deadline: '2020-01-01' }),
			'utf-8'
		);
		const archived = await archiveExpiredLeads(dirs, ledgerPath, new Date('2026-07-08T00:00:00Z'));
		expect(archived).toBe(1);

		const stillInInbox = (await readdir(dirs.inbox)).filter((f) => f.endsWith('.md'));
		expect(stillInInbox).not.toContain('lead-old.md');
		const importedHasExpired = (await readdir(dirs.imported)).some((f) => f.includes('expired-lead-old'));
		expect(importedHasExpired).toBe(true);
	});

	it('TTL leaves a future-deadline lead untouched', async () => {
		await writeFile(join(dirs.inbox, 'lead-future.md'), leadDoc({ id: 'lead-future' }), 'utf-8');
		const archived = await archiveExpiredLeads(dirs, ledgerPath, new Date('2026-07-08T00:00:00Z'));
		expect(archived).toBe(0);
	});
});
