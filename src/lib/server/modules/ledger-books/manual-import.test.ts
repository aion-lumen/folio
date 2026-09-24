import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('../../env.js', () => ({ getFolioDbPath: () => process.env.FOLIO_DB_PATH!, getSessionExchangePath: () => join(process.env.FOLIO_DB_PATH!, '..', 'session-exchange'), isDemoVaultActive: () => false }));
const state = vi.hoisted(() => ({ scan: 'clean', worker: 'ready', calls: [] as string[][] }));
vi.mock('../../file-intake/document-security.js', async () => {
	const actual = await vi.importActual<typeof import('../../file-intake/document-security.js')>('../../file-intake/document-security.js');
	return { ...actual, securityStatus: () => ({ configured: true, ready: true, reason: 'synthetic' }), secureDocument: async (path: string) => {
		const bytes = actual.documentBytes(path); const hash = actual.sha256(bytes); const receipt = { schema: 'folio/document-security/v1', receipt_id: 'synthetic', original_sha256: hash, byte_size: bytes.length, status: state.scan, reason_code: state.scan === 'clean' ? 'local_scan_clean' : 'malware_or_policy_alert' };
		const receiptPath = `${path}.receipt`; writeFileSync(receiptPath, JSON.stringify(receipt)); return { receipt, receipt_path: receiptPath, original_path: path };
	}, extractSecuredDocument: async () => ({ receipt: { status: 'extracted' } }), isolatedProcess: async (_bin: string, args: string[]) => {
		state.calls.push(args); if (state.worker === 'blocked') return { code: 2, stdout: JSON.stringify({ schema: 'ledger/manual-import-preview/v0', status: 'blocked', error_code: 'invalid_or_unverified_source', ledger_db_touched: false, may_execute: false }) };
		const get = (key: string) => args[args.indexOf(key) + 1];
		const receipt = JSON.parse(readFileSync(get('--security-receipt'), 'utf8'));
		const batch = { schema: 'ledger/manual-statement-batch/v0', batch_sha256: 'a'.repeat(64), status: 'staged_unbooked', sources: [{ source_sha256: receipt.original_sha256, account_ref: get('--account-ref'), account_version: get('--account-version'), format_version: get('--format-profile'), currency: 'CHF', entries: [], declared_period: null, control_result: { complete: false, issues: ['declared_period_missing'] } }], bookkeeping: { ledger_db_touched: false, accepted_count: 0 } };
		actual.atomicPrivateJson(get('--output'), batch); actual.atomicPrivateJson(get('--observation-output'), { schema: 'ledger/finance-observation-batch/v1', observations: [] });
		return { code: 0, stdout: JSON.stringify({ schema: 'ledger/manual-import-preview/v0', status: 'staged_unbooked', batch_sha256: batch.batch_sha256, preview: { source_count: 1, transaction_count: 0, complete_sources: 0 }, issues: ['coverage_missing'], ledger_db_touched: false, may_execute: false }) };
	} };
});
import { manualImportRoot, previewManualStatement, readManualStatementImport } from './manual-import.js';
let dir: string; let input: string; const oldDb = process.env.FOLIO_DB_PATH; const oldVault = process.env.FOLIO_VAULT_OVERRIDE;
const acct = 'acct_' + 'a'.repeat(20);
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'folio-manual-test-')); process.env.FOLIO_DB_PATH = join(dir, 'folio.db'); process.env.FOLIO_VAULT_OVERRIDE = join(dir, 'test-vault'); state.scan = 'clean'; state.worker = 'ready'; state.calls = [];
	input = join(dir, 'input'); mkdirSync(input); writeFileSync(join(input, 'example.csv'), 'synthetic,not-financial-data');
	mkdirSync(join(dir, 'file-intake')); writeFileSync(join(dir, 'file-intake', 'statement-import.json'), JSON.stringify({ schema: 'folio/manual-statement-config/v1', ledger_root: dir, python_bin: process.execPath, roots: [{ id: 'synthetic', label: 'Synthetic', institute: 'Synthetic', path: input, accounts: [{ ref: acct, label: 'Test', version: 'v1', profiles: ['csv-field-roles-v1'] }] }] }));
});
afterEach(() => { if (oldDb === undefined) delete process.env.FOLIO_DB_PATH; else process.env.FOLIO_DB_PATH = oldDb; if (oldVault === undefined) delete process.env.FOLIO_VAULT_OVERRIDE; else process.env.FOLIO_VAULT_OVERRIDE = oldVault; rmSync(dir, { recursive: true, force: true }); });
const selected = () => readManualStatementImport().files[0];
describe('manual statement boundary', () => {
	it('lists shallow regular exports only; ignores symlinks', () => { symlinkSync(join(input, 'example.csv'), join(input, 'link.csv')); mkdirSync(join(input, 'nested')); writeFileSync(join(input, 'nested', 'hidden.csv'), 'hidden'); expect(readManualStatementImport().files).toHaveLength(1); expect(readManualStatementImport().warnings).toHaveLength(1); });
	it('binds selection to current bytes and exact account/profile registration', async () => {
		const f = selected(); writeFileSync(join(input, f.name), 'changed'); await expect(previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1')).rejects.toThrow('selection_changed_or_missing');
		const next = selected(); await expect(previewManualStatement(next.id, next.sha256, 'acct_' + 'b'.repeat(20), 'csv-field-roles-v1')).rejects.toThrow('account_or_profile_not_registered'); expect(state.calls).toHaveLength(0);
	});
	it('stages only Ledger output; preserves original; repeats use previous batch', async () => {
		const f = selected(); const before = readFileSync(join(input, f.name)); const a = await previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1'); expect(a.status).toBe('staged_unbooked'); expect(a.preview?.preview?.complete_sources).toBe(0); expect(readFileSync(join(input, f.name))).toEqual(before);
		await previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1'); expect(state.calls.at(-1)).toContain('--previous-batch'); expect(readManualStatementImport().attempt?.status).toBe('staged_unbooked');
	});
	it('never invokes Ledger for a nonclean scan', async () => { state.scan = 'blocked'; const f = selected(); const r = await previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1'); expect(r.reason_code).toBe('malware_or_policy_alert'); expect(state.calls).toHaveLength(0); });
	it('keeps blocked parser responses visible and does not stage them', async () => { state.worker = 'blocked'; const f = selected(); const r = await previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1'); expect(r.status).toBe('blocked'); expect(r.preview?.error_code).toBe('invalid_or_unverified_source'); });
	it('does not silently reinterpret a duplicate original under another account', async () => {
		const f = selected(); mkdirSync(manualImportRoot(), { recursive: true }); writeFileSync(join(manualImportRoot(), 'statement-batch.json'), JSON.stringify({ sources: [{ source_sha256: f.sha256, account_ref: 'acct_' + 'b'.repeat(20), account_version: 'v1', format_version: 'csv-field-roles-v1' }] }));
		await expect(previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1')).rejects.toThrow('original_assignment_conflict'); expect(state.calls).toHaveLength(0);
	});
	it('uses no bank PDF legacy parser', () => { writeFileSync(join(input, 'reference.pdf'), '%PDF-unsupported'); expect(readManualStatementImport().files.find(f => f.kind === 'pdf')).toBeTruthy(); expect(state.calls).toHaveLength(0); });
	it('fails closed on a concurrent or interrupted process lock', async () => { const f = selected(); mkdirSync(manualImportRoot(), { recursive: true }); writeFileSync(join(manualImportRoot(), 'import.lock'), '{"pid":123}'); await expect(previewManualStatement(f.id, f.sha256, acct, 'csv-field-roles-v1')).rejects.toThrow('import_busy_or_interrupted_lock'); expect(state.calls).toHaveLength(0); });
});
