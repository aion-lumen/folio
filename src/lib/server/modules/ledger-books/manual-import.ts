import { recordPaymentConfirmations } from '../../memory/payment-confirmation.js';
import { reconcileAvailableCases, readReconciliationViews } from './reconciliation.js';
import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, lstatSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { getFolioDbPath, getSessionExchangePath, isDemoVaultActive } from '../../env.js';
import { atomicPrivateJson, documentBytes, extractSecuredDocument, isolatedProcess, privateDirectory, secureDocument, securityStatus, sha256 } from '../../file-intake/document-security.js';

export interface StatementAccount { ref: string; label: string; version: string; profiles: string[]; }
interface StatementRoot { id: string; label: string; path: string; institute: string; accounts: StatementAccount[]; }
interface ImportConfig { schema: 'folio/manual-statement-config/v1'; ledger_root: string; python_bin: string; roots: StatementRoot[]; }
export interface StatementSelection { id: string; label: string; institute: string; name: string; sha256: string; bytes: number; kind: 'pdf' | 'csv' | 'camt'; accounts: StatementAccount[]; }
export interface StatementPreview { schema: 'ledger/manual-import-preview/v0'; status: 'staged_unbooked' | 'blocked'; batch_sha256?: string; preview?: { source_count: number; transaction_count: number; complete_sources: number; [key: string]: unknown }; issues?: string[]; error_code?: string; ledger_db_touched: false; may_execute: false; }
interface ImportRecord { schema: 'folio/manual-statement-attempt/v1'; attempt_id: string; original_sha256: string; selection_id: string; account_ref: string; account_version: string; format_profile: string; created_at: string; status: string; reason_code: string; preview: StatementPreview | null; }
export const manualImportRoot = () => join(getSessionExchangePath(), 'ledger', 'manual-statements');
const configPath = () => join(dirname(getFolioDbPath()), isDemoVaultActive() ? 'file-intake-demo' : 'file-intake', 'statement-import.json');
const profiles = ['csv-field-roles-v1', 'camt.053-v1', 'sparkasse-pdf-v1', 'postfinance-pdf-v1'];
export function statementImportConfig(): ImportConfig | null {
	if (!existsSync(configPath())) return null;
	const c = JSON.parse(documentBytes(configPath(), 65536).toString('utf8')) as ImportConfig;
	if (c.schema !== 'folio/manual-statement-config/v1' || !isAbsolute(c.ledger_root) || !isAbsolute(c.python_bin) || !Array.isArray(c.roots) || c.roots.length > 8) throw new Error('invalid_statement_import_config');
	const ids = new Set<string>();
	for (const r of c.roots) {
		if (!/^[a-z][a-z0-9-]{0,40}$/u.test(r.id) || ids.has(r.id) || !isAbsolute(r.path) || !r.label || !r.institute || !Array.isArray(r.accounts)) throw new Error('invalid_statement_root'); ids.add(r.id);
		for (const a of r.accounts) if (!/^acct_[a-f0-9]{20}$/u.test(a.ref) || !a.label || !a.version || !Array.isArray(a.profiles) || a.profiles.some(p => !profiles.includes(p))) throw new Error('invalid_statement_account');
	}
	return c;
}
const config = statementImportConfig;

/** Same cross-process lock for statement staging and agent reconciliation. */
export async function withStatementLock<T>(work:()=>Promise<T>):Promise<T> {
 const root=manualImportRoot();privateDirectory(root);const path=join(root,'import.lock');
 let fd:number;try{fd=openSync(path,'wx',0o600);}catch{throw new Error('import_busy_or_interrupted_lock');}
 try{writeFileSync(fd,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));return await work();}
 finally{closeSync(fd);rmSync(path);}
}

/** Re-run prepared claims against the current immutable statement batch. */
export async function reconcileStatementPayments() {
	return withStatementLock(async()=>{
	const c = config();
	if (!c) throw new Error('statement_account_setup_required');
	await reconcileAvailableCases(realpathSync(c.ledger_root), c.python_bin);
	return recordPaymentConfirmations();
	});
}
function roots(c: ImportConfig | null): StatementRoot[] {
	if (c) return c.roots;
	if (isDemoVaultActive()) return [];
	return [];
}
function inventory(c: ImportConfig | null) {
	const files: StatementSelection[] = []; const warnings: string[] = [];
	for (const r of roots(c)) {
		if (!existsSync(r.path)) { warnings.push(`${r.label}: Eingangsordner fehlt`); continue; }
		if (!lstatSync(r.path).isDirectory() || lstatSync(r.path).isSymbolicLink()) { warnings.push(`${r.label}: unsicherer Eingangsordner`); continue; }
		for (const name of readdirSync(r.path).sort()) {
			if (name.startsWith('.')) continue;
			const kind = ({ '.pdf': 'pdf', '.csv': 'csv', '.xml': 'camt' } as const)[extname(name).toLowerCase() as '.pdf']; if (!kind) continue;
			try { const bytes = documentBytes(join(r.path, name)); const hash = sha256(bytes); files.push({ id: sha256(`${r.id}\n${name}\n${hash}`), label: r.label, institute: r.institute, name, sha256: hash, bytes: bytes.length, kind, accounts: r.accounts }); }
			catch { warnings.push(`${r.label} · ${name}: keine reguläre Datei oder Grössenlimit`); }
			if (files.length >= 500) { warnings.push('Maximal 500 Dateien pro Auswahl; weitere Exporte bleiben unangetastet.'); return { files, warnings }; }
		}
	}
	return { files, warnings };
}
export interface StatementEntryView { date: string; amount: string; currency: string; direction: string; counterparty: string; purpose: string; locator: string; }
export interface StatementCoverageView { entries: StatementEntryView[]; account: string; currency: string; from: string | null; to: string | null; count: number; complete: boolean; issues: string[]; }
function coverageView(c: ImportConfig | null): StatementCoverageView[] {
	const path = join(manualImportRoot(), 'statement-batch.json');
	if (!existsSync(path)) return [];
	const b = JSON.parse(documentBytes(path, 64 * 1024 * 1024).toString('utf8'));
	if (b.schema !== 'ledger/manual-statement-batch/v0' || b.status !== 'staged_unbooked' || b.bookkeeping?.ledger_db_touched !== false || !Array.isArray(b.sources)) throw new Error('invalid_statement_batch');
	return b.sources.map((source: { account_ref: string; currency: string; declared_period?: { from: string; to: string }; entries: { booking_date: string; amount: string; currency: string; direction: string; counterparty: string | null; purpose: string; locator: string }[]; control_result: { complete: boolean; issues: string[] } }) => {
		const account = c?.roots.flatMap(r => r.accounts).find(a => a.ref === source.account_ref);
		if (!Array.isArray(source.entries) || !Array.isArray(source.control_result?.issues) || typeof source.control_result.complete !== 'boolean') throw new Error('invalid_statement_controls');
		return { entries: source.entries.slice(0, 500).map(e => ({ date: e.booking_date, amount: e.amount, currency: e.currency, direction: e.direction, counterparty: (e.counterparty ?? '').slice(0, 200), purpose: e.purpose.slice(0, 1200), locator: e.locator })), account: account?.label ?? 'Unbekannte Kontozuordnung', currency: source.currency, from: source.declared_period?.from ?? null, to: source.declared_period?.to ?? null, count: source.entries.length, complete: source.control_result.complete, issues: source.control_result.issues };
	}).sort((a: StatementCoverageView, b: StatementCoverageView) => a.account.localeCompare(b.account) || (a.from ?? '').localeCompare(b.from ?? ''));
}
export function readManualStatementImport() {
	try {
		const c = config(); const items = inventory(c); const latest = join(manualImportRoot(), 'latest.json');
		const attempt = existsSync(latest) ? JSON.parse(documentBytes(latest, 65536).toString('utf8')) as ImportRecord : null;
		return { ...items, reconciliations: readReconciliationViews(), coverage: coverageView(c), configured: c !== null, scanner: securityStatus(), attempt, error: null as string | null };
	} catch { return { reconciliations: [], coverage: [] as StatementCoverageView[], files: [] as StatementSelection[], warnings: [], configured: false, scanner: securityStatus(), attempt: null as ImportRecord | null, error: 'Importkonfiguration oder lokaler Prüfstatus ungültig.' }; }
}
let queue: Promise<unknown> = Promise.resolve();
export function previewManualStatement(id: string, expectedHash: string, accountRef: string, formatProfile: string, deferReconciliation = false, repairIncomplete = false): Promise<ImportRecord> {
	const next = queue.then(async () => {
		return withStatementLock(()=>performPreview(id, expectedHash, accountRef, formatProfile, deferReconciliation, repairIncomplete));
	}); queue = next.catch(() => undefined); return next;
}
async function performPreview(id: string, expectedHash: string, accountRef: string, formatProfile: string, deferReconciliation = false, repairIncomplete = false): Promise<ImportRecord> {
	const c = config(); if (!c) throw new Error('statement_account_setup_required');
	const selected = inventory(c).files.find(f => f.id === id && f.sha256 === expectedHash); if (!selected) throw new Error('selection_changed_or_missing');
	const account = selected.accounts.find(a => a.ref === accountRef && a.profiles.includes(formatProfile)); if (!account) throw new Error('account_or_profile_not_registered');
	if ((selected.kind === 'csv' && formatProfile !== 'csv-field-roles-v1') || (selected.kind === 'camt' && formatProfile !== 'camt.053-v1') || (selected.kind === 'pdf' && !['sparkasse-pdf-v1', 'postfinance-pdf-v1'].includes(formatProfile))) throw new Error('unsupported_format_profile');
	const r = c.roots.find(root => root.label === selected.label && root.institute === selected.institute && sha256(`${root.id}\n${selected.name}\n${selected.sha256}`) === id)!;
	const record: ImportRecord = { schema: 'folio/manual-statement-attempt/v1', attempt_id: randomUUID(), original_sha256: selected.sha256, selection_id: id, account_ref: account.ref, account_version: account.version, format_profile: formatProfile, created_at: new Date().toISOString(), status: 'blocked', reason_code: 'not_checked', preview: null };
	const root = manualImportRoot(); privateDirectory(root);
	const previous = join(root, 'statement-batch.json');
	// Reassigning an already ingested original must be an explicit correction, never a duplicate import.
	if (existsSync(previous)) {
		const prior = JSON.parse(documentBytes(previous, 64 * 1024 * 1024).toString('utf8'));
		if (!Array.isArray(prior.sources) || prior.sources.some((s: { source_sha256: string; account_ref: string; account_version: string; format_version: string }) => s.source_sha256 === expectedHash && (s.account_ref !== account.ref || s.account_version !== account.version || s.format_version !== formatProfile))) throw new Error('original_assignment_conflict');
	}
	let work: string | null = null;
	try {
		const secured = await secureDocument(join(r.path, selected.name), `statement:${r.id}:${selected.name}`);
		if (secured.receipt.original_sha256 !== expectedHash) throw new Error('source_changed');
		if (secured.receipt.status !== 'clean') throw new Error(secured.receipt.reason_code);
		const extracted = await extractSecuredDocument(secured, selected.kind); if (extracted.receipt.status !== 'extracted') throw new Error(extracted.receipt.reason_code);
		work = mkdtempSync(join(root, 'preview-')); chmodSync(work, 0o700);
		const input = join(work, 'original'); writeFileSync(input, documentBytes(secured.original_path), { flag: 'wx', mode: 0o600 });
		const receipt = join(work, 'security.json'); writeFileSync(receipt, documentBytes(secured.receipt_path), { flag: 'wx', mode: 0o600 });
		const output = join(work, 'batch.json'); const observations = join(work, 'observations.json');
		const ledgerRoot = realpathSync(c.ledger_root); const script = join(ledgerRoot, 'scripts', 'preview_manual_books.py');
		const args = ['-I', script, '--source', input, '--security-receipt', receipt, '--institute', selected.institute, '--account-ref', account.ref, '--account-version', account.version, '--format-profile', formatProfile, '--output', output, '--observation-output', observations];
		if (selected.kind === 'pdf') {
			if (!extracted.text_path) throw new Error('extracted_text_missing');
			const er = join(work, 'extraction.json'), text = join(work, 'text.txt');
			writeFileSync(er, documentBytes(extracted.receipt_path), { mode: 0o600, flag: 'wx' });
			writeFileSync(text, documentBytes(extracted.text_path), { mode: 0o600, flag: 'wx' });
			args.push('--extraction-receipt', er, '--extracted-text', text);
		}
		if (existsSync(previous)) { const p = join(work, 'previous.json'); writeFileSync(p, documentBytes(previous, 64 * 1024 * 1024), { mode: 0o600, flag: 'wx' }); args.push('--previous-batch', p); }
		if(repairIncomplete){
			atomicPrivateJson(join(root,'attempts',record.attempt_id+'.before-repair.json'),JSON.parse(documentBytes(previous,64 * 1024 * 1024).toString()));
			args.push('--repair-incomplete-source');
		}
		const python = c.python_bin; // Preserve venv identity; sandbox runner resolves only for validation.
		const run = await isolatedProcess(python, args, work, [ledgerRoot, dirname(dirname(python))], 30_000, 65536);
		const preview = JSON.parse(run.stdout) as StatementPreview;
		if (preview.schema !== 'ledger/manual-import-preview/v0' || preview.ledger_db_touched !== false || preview.may_execute !== false || !['staged_unbooked', 'blocked'].includes(preview.status)) throw new Error('invalid_ledger_preview');
		record.preview = preview;
		if (run.code !== 0 || preview.status !== 'staged_unbooked') throw new Error(preview.error_code || 'ledger_preview_blocked');
		const batch = JSON.parse(documentBytes(output, 64 * 1024 * 1024).toString('utf8')); const obs = JSON.parse(documentBytes(observations, 64 * 1024 * 1024).toString('utf8'));
		if (batch.schema !== 'ledger/manual-statement-batch/v0' || batch.status !== 'staged_unbooked' || batch.batch_sha256 !== preview.batch_sha256 || batch.bookkeeping?.ledger_db_touched !== false || batch.bookkeeping?.accepted_count !== 0 || obs.schema !== 'ledger/finance-observation-batch/v1' || !batch.sources.some((s: { source_sha256: string; account_ref: string }) => s.source_sha256 === expectedHash && s.account_ref === account.ref)) throw new Error('invalid_ledger_artifacts');
		// Existing finance-observation contract/intake; no SQL or alternative booking pipeline.
		atomicPrivateJson(join(root, 'statement-observations.json'), obs); atomicPrivateJson(previous, batch);
		record.status = 'staged_unbooked'; record.reason_code = 'ledger_preview_ready';
		if (!deferReconciliation) { await reconcileAvailableCases(ledgerRoot, python); recordPaymentConfirmations(); }
	} catch (e) { record.reason_code = e instanceof Error && /^[a-z_]+$/u.test(e.message) ? e.message : 'local_import_error'; }
	finally { if (work) rmSync(work, { recursive: true, force: true }); }
	atomicPrivateJson(join(root, 'attempts', `${record.attempt_id}.json`), record); atomicPrivateJson(join(root, 'latest.json'), record); return record;
}
