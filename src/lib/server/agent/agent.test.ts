import { cp, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTriageCache } from './cache.js';
import { assessDocument, runInboxTriage } from './triage.js';
import { validateGuardrails } from './guardrails.js';
import { _resetTrustedSourcesCache } from './trusted-sources.js';
import { createObjective } from '../vault/writer.js';
import { resolveInboxDirs, scanInbox } from '../inbox/scanner.js';
import type { TriageAssessment } from './types.js';

const TASK_RESPONSE = JSON.stringify({
	verdict: 'task',
	confidence: 0.92,
	chapter_slug: '01-neustart',
	objective: {
		title: 'Test objective from triage',
		threshold: 'Deliverable X completed and verified',
		weight: 1.5,
		related_goals: ['karriere'],
		deadline: '2026-12-31'
	},
	reasoning: 'Klares neues Ziel mit messbarem Threshold.'
});

const UNCLEAR_RESPONSE = JSON.stringify({
	verdict: 'unclear',
	confidence: 0.55,
	chapter_slug: null,
	objective: null,
	reasoning: 'Kapitel unklar.'
});

const NOT_TASK_RESPONSE = JSON.stringify({
	verdict: 'not-a-task',
	confidence: 0.88,
	chapter_slug: null,
	objective: null,
	reasoning: 'Nur Beobachtung, kein neues Ziel.'
});

describe.sequential('folio agent triage', () => {
	let baseDir: string;
	let vaultDir: string;
	let ledgerPath: string;
	let dirs: ReturnType<typeof resolveInboxDirs>;

	beforeEach(async () => {
		baseDir = join(tmpdir(), `folio-agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		vaultDir = join(baseDir, 'vault');
		ledgerPath = join(baseDir, 'ledger.json');
		dirs = resolveInboxDirs(join(baseDir, 'inbox'));

		await mkdir(dirs.inbox, { recursive: true });
		await mkdir(dirs.rejected, { recursive: true });
		await mkdir(dirs.imported, { recursive: true });
		await mkdir(join(baseDir, '.folio'), { recursive: true });

		await cp(join(process.cwd(), 'templates/demo-vault'), vaultDir, { recursive: true });

		process.env.HOME = baseDir;
		process.env.VAULT_PATH = vaultDir;
		process.env.FOLIO_INBOX_PATH = dirs.inbox;
		process.env.FOLIO_AGENT_CONFIDENCE = '0.8';
		process.env.FOLIO_AGENT_AUTO = '0';

		// Trust-policy fixture: `test-agent` is trusted so the baseline auto-commit tests still pass.
		const trustedPath = join(baseDir, 'trusted_sources.yaml');
		await writeFile(trustedPath, 'trusted_sources:\n  - test-agent\n', 'utf-8');
		process.env.FOLIO_TRUSTED_SOURCES_PATH = trustedPath;
		_resetTrustedSourcesCache();

		await writeFile(join(baseDir, '.folio/active-vault.json'), JSON.stringify({ path: vaultDir }));
		await clearTriageCache();
	});

	afterEach(() => {
		delete process.env.VAULT_PATH;
		delete process.env.FOLIO_INBOX_PATH;
		delete process.env.HOME;
		delete process.env.FOLIO_AGENT_CONFIDENCE;
		delete process.env.FOLIO_AGENT_AUTO;
		delete process.env.FOLIO_TRUSTED_SOURCES_PATH;
		_resetTrustedSourcesCache();
	});

	async function writeInboxDoc(
		name: string,
		body: string,
		opts?: { source?: string; derived_from_external?: boolean }
	) {
		const source = opts?.source ?? 'test-agent';
		const derivedLine =
			opts?.derived_from_external !== undefined
				? `derived_from_external: ${opts.derived_from_external}\n`
				: '';
		const content = `---
folio_import: v1
type: note
target: chapter-1
id: ${name.replace('.md', '')}
source: ${source}
created: 2026-07-07
${derivedLine}title: Test document
---

${body}`;
		await writeFile(join(dirs.inbox, name), content, 'utf-8');
		return content;
	}

	it('createObjective appends block with next id', async () => {
		const id = await createObjective('01-neustart', {
			title: 'Unit test objective',
			threshold: 'Test passes',
			weight: 1,
			related_goals: ['karriere']
		});
		expect(id).toBe('obj-01-08');
		const chapter = await readFile(join(vaultDir, '_campaign/chapters/01-neustart.md'), 'utf-8');
		expect(chapter).toContain('### obj-01-08: Unit test objective');
		expect(chapter).toContain('obj-01-08');
	});

	it('guardrails reject low confidence task', () => {
		const assessment: TriageAssessment = {
			verdict: 'task',
			confidence: 0.5,
			chapter_slug: '01-neustart',
			objective: {
				title: 'X',
				threshold: 'Y done',
				weight: 1,
				related_goals: ['karriere']
			},
			reasoning: 'test'
		};
		expect(validateGuardrails(assessment, 0.8)).toMatch(/below threshold/);
	});

	it('auto-commits clear task via mock LLM', async () => {
		await writeInboxDoc(
			'triage-auto-task.md',
			'# Neues Ziel\n\nBitte Objective anlegen: Test deliverable bis Ende Jahr.'
		);

		const scan = await scanInbox(dirs, ledgerPath);
		expect(scan.valid).toBe(1);

		const { result } = await runInboxTriage(scan, dirs, {
			ledgerPath,
			autoCommit: true,
			mockResponse: TASK_RESPONSE
		});
		expect(result.auto_committed).toHaveLength(1);
		expect(result.auto_committed[0].objective_id).toMatch(/^obj-01-\d+$/);

		const chapter = await readFile(join(vaultDir, '_campaign/chapters/01-neustart.md'), 'utf-8');
		expect(chapter).toContain('Test objective from triage');
		expect(chapter).toContain(result.auto_committed[0].objective_id!);

		const scan2 = await scanInbox(dirs, ledgerPath);
		expect(scan2.valid).toBe(0);
		expect(scan2.duplicate).toBe(0);
	});

	it('untrusted source: high-confidence task goes to review, not auto-commit', async () => {
		await writeInboxDoc(
			'triage-untrusted.md',
			'# Neues Ziel\n\nBitte Objective anlegen: Test deliverable bis Ende Jahr.',
			{ source: 'some-random-source' }
		);

		const scan = await scanInbox(dirs, ledgerPath);
		expect(scan.valid).toBe(1);

		const { result } = await runInboxTriage(scan, dirs, {
			ledgerPath,
			autoCommit: true,
			mockResponse: TASK_RESPONSE
		});
		expect(result.auto_committed).toHaveLength(0);
		expect(result.awaiting_review).toContain('triage-untrusted.md');

		// Item stays in inbox — nothing committed to the vault.
		const scan2 = await scanInbox(dirs, ledgerPath);
		expect(scan2.valid).toBe(1);
	});

	it('derived_from_external: even a trusted source goes to review, not auto-commit', async () => {
		await writeInboxDoc(
			'triage-derived.md',
			'# Neues Ziel\n\nBitte Objective anlegen: Test deliverable bis Ende Jahr.',
			{ source: 'test-agent', derived_from_external: true }
		);

		const scan = await scanInbox(dirs, ledgerPath);
		expect(scan.valid).toBe(1);
		expect(scan.items[0].derived_from_external).toBe(true);

		const { result } = await runInboxTriage(scan, dirs, {
			ledgerPath,
			autoCommit: true,
			mockResponse: TASK_RESPONSE
		});
		expect(result.auto_committed).toHaveLength(0);
		expect(result.awaiting_review).toContain('triage-derived.md');
	});

	it('leaves unclear items for review', async () => {
		const raw = await writeInboxDoc('triage-unclear.md', '# Vielleicht ein Ziel?');

		const scan = await scanInbox(dirs, ledgerPath);
		const { scan: enriched, result } = await runInboxTriage(scan, dirs, {
			ledgerPath,
			autoCommit: true,
			mockResponse: UNCLEAR_RESPONSE
		});
		expect(result.auto_committed).toHaveLength(0);
		expect(result.awaiting_review).toContain('triage-unclear.md');
		expect(enriched.items[0].triage?.verdict).toBe('unclear');

		const stillThere = await readFile(join(dirs.inbox, 'triage-unclear.md'), 'utf-8');
		expect(stillThere).toBe(raw);
	});

	it('skips not-a-task without commit', async () => {
		await writeInboxDoc('triage-note.md', '# Beobachtung\n\nNur Info.');

		const scan = await scanInbox(dirs, ledgerPath);
		const { result, scan: enriched } = await runInboxTriage(scan, dirs, {
			ledgerPath,
			autoCommit: true,
			mockResponse: NOT_TASK_RESPONSE
		});
		expect(result.auto_committed).toHaveLength(0);
		expect(enriched.items[0].triage?.verdict).toBe('not-a-task');
		expect(enriched.valid).toBe(1);
	});

	it('assessDocument returns unclear when LLM unavailable', async () => {
		const raw = await writeInboxDoc('triage-no-llm.md', '# Test');
		const a = await assessDocument('triage-no-llm.md', raw, { useCache: false, mockResponse: null });
		expect(a.verdict).toBe('unclear');
		expect(a.confidence).toBe(0);
	});
});
