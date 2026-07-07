import { cp, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitInboxItems } from './commit.js';
import { resolveInboxDirs, scanInbox } from './scanner.js';

describe('inbox import roundtrip', () => {
	let baseDir: string;
	let vaultDir: string;
	let ledgerPath: string;
	let dirs: ReturnType<typeof resolveInboxDirs>;

	beforeEach(async () => {
		baseDir = join(tmpdir(), `folio-inbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		vaultDir = join(baseDir, 'vault');
		ledgerPath = join(baseDir, 'ledger.json');
		dirs = resolveInboxDirs(join(baseDir, 'inbox'));

		await mkdir(dirs.inbox, { recursive: true });
		await mkdir(dirs.rejected, { recursive: true });
		await mkdir(dirs.imported, { recursive: true });

		const demoVault = join(process.cwd(), 'templates/demo-vault');
		await cp(demoVault, vaultDir, { recursive: true });

		process.env.HOME = baseDir;
		process.env.VAULT_PATH = vaultDir;
		process.env.FOLIO_INBOX_PATH = dirs.inbox;
		await mkdir(join(baseDir, '.folio'), { recursive: true });
		await writeFile(
			join(baseDir, '.folio/active-vault.json'),
			JSON.stringify({ path: vaultDir })
		);

		const fixtures = join(process.cwd(), 'tests/fixtures/inbox');
		await writeFile(
			join(dirs.inbox, 'valid-directive.md'),
			await readFile(join(fixtures, 'valid-directive.md'), 'utf-8')
		);
	});

	afterEach(() => {
		delete process.env.VAULT_PATH;
		delete process.env.FOLIO_INBOX_PATH;
		delete process.env.HOME;
	});

	it('scans valid directive and rejects invalid files', async () => {
		const fixtures = join(process.cwd(), 'tests/fixtures/inbox');
		await writeFile(
			join(dirs.inbox, 'invalid-missing-id.md'),
			await readFile(join(fixtures, 'invalid-missing-id.md'), 'utf-8')
		);

		const scan = await scanInbox(dirs, ledgerPath);
		expect(scan.valid).toBe(1);
		expect(scan.invalid).toBe(1);
		expect(scan.items.find((i) => i.id === 'test-directive-fixture-001')?.status).toBe('valid');
	});

	it('commits directive to vault internal/imports', async () => {
		const scan = await scanInbox(dirs, ledgerPath);
		const valid = scan.items.filter((i) => i.status === 'valid').map((i) => i.filename);
		const result = await commitInboxItems(valid, dirs, ledgerPath);
		expect(result.committed).toHaveLength(1);
		expect(result.committed[0].ok).toBe(true);

		const dest = join(vaultDir, 'internal/imports/test-directive-fixture-001.md');
		const content = await readFile(dest, 'utf-8');
		expect(content).toContain('test-directive-fixture-001');
		expect(content).toContain('Test directive');
	});

	it('rejects duplicate id on second import', async () => {
		const scan1 = await scanInbox(dirs, ledgerPath);
		await commitInboxItems(
			scan1.items.filter((i) => i.status === 'valid').map((i) => i.filename),
			dirs,
			ledgerPath
		);

		const fixtures = join(process.cwd(), 'tests/fixtures/inbox');
		await writeFile(
			join(dirs.inbox, 'valid-directive-dup.md'),
			await readFile(join(fixtures, 'valid-directive.md'), 'utf-8')
		);

		const scan2 = await scanInbox(dirs, ledgerPath);
		expect(scan2.duplicate).toBe(1);
		expect(scan2.items[0].status).toBe('duplicate');
	});

	it('commits objective-update patch', async () => {
		const fixtures = join(process.cwd(), 'tests/fixtures/inbox');
		await writeFile(
			join(dirs.inbox, 'valid-objective-update.md'),
			await readFile(join(fixtures, 'valid-objective-update.md'), 'utf-8')
		);

		const scan = await scanInbox(dirs, ledgerPath);
		const result = await commitInboxItems(
			scan.items.filter((i) => i.status === 'valid').map((i) => i.filename),
			dirs,
			ledgerPath
		);
		expect(result.committed[0].ok).toBe(true);

		const chapter = await readFile(
			join(vaultDir, '_campaign/chapters/01-neustart.md'),
			'utf-8'
		);
		expect(chapter).toContain('Inbox test patch');
	});

	it('commits field-note to internal/fieldnotes', async () => {
		const fixtures = join(process.cwd(), 'tests/fixtures/inbox');
		await writeFile(
			join(dirs.inbox, 'valid-field-note.md'),
			await readFile(join(fixtures, 'valid-field-note.md'), 'utf-8')
		);

		const scan = await scanInbox(dirs, ledgerPath);
		const result = await commitInboxItems(
			scan.items.filter((i) => i.status === 'valid').map((i) => i.filename),
			dirs,
			ledgerPath
		);
		expect(result.committed[0].ok).toBe(true);

		const dest = join(vaultDir, 'internal/fieldnotes/test-fieldnote-fixture-001.md');
		const content = await readFile(dest, 'utf-8');
		expect(content).toContain('test-fieldnote-fixture-001');
	});
});
