import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { accessSync, chmodSync, closeSync, constants, existsSync, fsyncSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { getFolioDbPath, isDemoVaultActive } from '../env.js';
import type { DocumentExtractionReceipt, DocumentSecurityReceipt } from './security-types.js';

export const SECURITY_POLICY = 'local-document-clamav-v1';
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
export interface SecurityConfig { scanner_bin: string; signatures_dir: string; python_bin: string; }
export interface SecuredDocument { receipt: DocumentSecurityReceipt; receipt_path: string; original_path: string; }
export interface ExtractedDocument { receipt: DocumentExtractionReceipt; receipt_path: string; text_path: string | null; }
export function securityRoot(): string { return join(dirname(getFolioDbPath()), isDemoVaultActive() ? 'file-intake-demo' : 'file-intake', 'security'); }
export function sha256(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
export function privateDirectory(path: string): void {
	if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('unsafe_state_symlink');
	mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700);
}
export function atomicPrivateJson(path: string, value: unknown): void {
	privateDirectory(dirname(path)); const temporary = `${path}.${randomUUID()}.tmp`;
	try { writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); const fd = openSync(temporary, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } renameSync(temporary, path); const dir = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(dir); } finally { closeSync(dir); } }
	finally { if (existsSync(temporary)) rmSync(temporary); }
}
/** Read one regular file, never a symlink; detect changes during the bounded read. */
export function documentBytes(path: string, maxBytes = MAX_DOCUMENT_BYTES): Buffer {
	const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const before = fstatSync(fd);
		if (!before.isFile() || before.size < 1 || before.size > maxBytes) throw new Error('document_size_or_type_denied');
		const data = Buffer.alloc(before.size); let offset = 0;
		while (offset < data.length) { const n = readSync(fd, data, offset, data.length - offset, null); if (!n) break; offset += n; }
		const after = fstatSync(fd);
		if (offset !== data.length || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('source_changed_during_read');
		return data;
	} finally { closeSync(fd); }
}
export function readSecurityConfig(): SecurityConfig | null {
	const path = join(securityRoot(), 'config.json'); if (!existsSync(path)) return null;
	const cfg = JSON.parse(documentBytes(path, 8192).toString('utf8'));
	if (cfg.schema !== 'folio/document-security-config/v1' || !['scanner_bin', 'signatures_dir', 'python_bin'].every(k => typeof cfg[k] === 'string' && isAbsolute(cfg[k]))) throw new Error('invalid_security_config');
	return { scanner_bin: cfg.scanner_bin, signatures_dir: cfg.signatures_dir, python_bin: cfg.python_bin };
}
function executable(path: string): string { const actual = realpathSync(path); accessSync(actual, constants.X_OK); if (!lstatSync(actual).isFile()) throw new Error('invalid_executable'); return actual; }
/** OS sandbox is required. No silent unsandboxed fallback. */
export function sandboxProfile(work: string, reads: string[]): string {
	const literal = (s: string) => JSON.stringify(realpathSync(s));
	// Explicitly authorized: canonicalisation may inspect these ancestors,
	// but never read other file contents below them.
	const parents = new Set<string>();
	for (const path of [work, ...reads]) { let p = dirname(realpathSync(path)); while (p !== '/') { parents.add(p); p = dirname(p); } }
	return `(version 1) (deny default) (allow process*) (allow sysctl-read) (allow mach-lookup)
 (allow file-read* (literal "/") (subpath "/usr") (subpath "/System") (subpath "/Library/Apple") (subpath "/opt/homebrew") (literal "/dev/null") ${reads.map(s => `(subpath ${literal(s)})`).join(' ')} (subpath ${literal(work)}))
 (allow file-read-metadata ${[...parents].map(p => `(literal ${JSON.stringify(p)})`).join(' ')})
 (allow file-write* (literal "/dev/null") (subpath ${literal(work)}))`;
}
export async function isolatedProcess(bin: string, args: string[], work: string, reads: string[], timeout = 60_000, maxOutput = MAX_TEXT_BYTES): Promise<{ code: number; stdout: string; stderrBytes: number }> {
	if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec')) throw new Error('extraction_sandbox_unavailable');
	const actual = executable(bin); const profile = sandboxProfile(work, [...reads, actual]);
	return new Promise((resolvePromise, reject) => {
		const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, bin, ...args], { cwd: work, env: { PATH: '/usr/bin:/bin', TMPDIR: work, LANG: 'en_US.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
		const chunks: Buffer[] = []; let size = 0; let stderrBytes = 0; let failure: Error | null = null;
		const timer = setTimeout(() => { failure = new Error('worker_timeout'); child.kill('SIGKILL'); }, timeout);
		child.stdout.on('data', (b: Buffer) => { size += b.length; if (size > maxOutput) { failure = new Error('worker_output_limit'); child.kill('SIGKILL'); } else chunks.push(b); });
		// Do not persist scanner/parser diagnostics that may include private text.
		child.stderr.on('data', (b: Buffer) => { size += b.length; stderrBytes += b.length; if (size > maxOutput) { failure = new Error('worker_output_limit'); child.kill('SIGKILL'); } });
		child.on('error', e => { clearTimeout(timer); reject(e); });
		child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else resolvePromise({ code: code ?? 2, stdout: Buffer.concat(chunks).toString('utf8'), stderrBytes }); });
	});
}
function signatureNames(path: string): string[] {
	if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error('unsafe_signature_directory');
	const names = readdirSync(path).filter(n => /^(main|daily|bytecode)\.(cvd|cld)$/u.test(n)).sort();
	if (!names.some(n => /^daily\./u.test(n)) || !names.some(n => /^main\./u.test(n))) throw new Error('signatures_missing');
	// Only the three official databases may be used by this adapter.
	if (readdirSync(path).some(n => /\.(cvd|cld|cud|hdb|hsb|ndb|ldb|sdb|mdb|msb|yar|yara|cbc|wdb|pdb|fp|ign|ign2)$/u.test(n) && !names.includes(n))) throw new Error('unexpected_signature_database');
	for (const name of names) { const st = lstatSync(join(path, name)); if (!st.isFile() || st.isSymbolicLink() || !st.size) throw new Error('unsafe_signature_file'); }
	return names;
}
function signatureDigest(path: string): string {
	const names = signatureNames(path);
	// Streaming hash: signature databases must not be read through the document-size gate.
	const h = createHash('sha256');
	for (const name of names) {
		const p = join(path, name); if (!lstatSync(p).isFile() || lstatSync(p).isSymbolicLink()) throw new Error('unsafe_signature_file');
		h.update(name); const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW); const buf = Buffer.alloc(1024 * 1024);
		try { let n; while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { closeSync(fd); }
	}
	return h.digest('hex');
}
function receiptFile(id: string): string { if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('invalid_receipt_id'); return join(securityRoot(), 'receipts', `${id}.json`); }
export function storedSecurityReceipt(id: string): DocumentSecurityReceipt {
	const r = JSON.parse(documentBytes(receiptFile(id), 16_384).toString('utf8')) as DocumentSecurityReceipt;
	if (r.schema !== 'folio/document-security/v1' || r.receipt_id !== id || r.policy_version !== SECURITY_POLICY || !/^[a-f0-9]{64}$/u.test(r.original_sha256) || !Number.isInteger(r.byte_size) || r.byte_size < 1 || r.byte_size > MAX_DOCUMENT_BYTES || !['clean', 'blocked', 'not_scanned', 'error'].includes(r.status) || !Number.isFinite(Date.parse(r.scanned_at))) throw new Error('invalid_security_receipt');
	if (r.status === 'clean' && (!r.scanner || r.scanner.id !== 'clamav' || !/^[a-f0-9]{64}$/u.test(r.scanner.binary_sha256) || !r.signatures || !/^[a-f0-9]{64}$/u.test(r.signatures.database_sha256))) throw new Error('invalid_security_receipt');
	return r;
}
function freshReceipt(r: DocumentSecurityReceipt): boolean { const age = Date.now() - Date.parse(r.scanned_at); return Number.isFinite(age) && age >= 0 && age < 24 * 3600_000; }
export function securityStatus(): { configured: boolean; ready: boolean; reason: string } {
	try {
		const c = readSecurityConfig(); if (!c) return { configured: false, ready: false, reason: 'scanner_not_configured' };
		executable(c.scanner_bin); executable(c.python_bin); signatureNames(c.signatures_dir);
		const healthPath = join(securityRoot(), 'last-check.json');
		if (!existsSync(healthPath)) return { configured: true, ready: false, reason: 'sandbox_scan_not_yet_verified' };
		const health = JSON.parse(documentBytes(healthPath, 8192).toString('utf8'));
		const age = Date.now() - Date.parse(health.checked_at);
		return { configured: true, ready: health.ready === true && age >= 0 && age < 24 * 3600_000, reason: health.ready === true ? 'local_scan_verified_rechecked_per_document' : 'sandbox_or_scanner_check_failed' };
	}
	catch { return { configured: true, ready: false, reason: 'scanner_or_signatures_unavailable' }; }
}
/** Shared by local documents, statement import and quarantined attachment blobs. */
export async function secureDocument(sourcePath: string, sourceRef: string): Promise<SecuredDocument> {
	if (!sourceRef.trim() || sourceRef.length > 2048) throw new Error('invalid_source_ref');
	const bytes = documentBytes(sourcePath); const hash = sha256(bytes); const root = securityRoot();
	const original = join(root, 'quarantine', hash, 'original'); privateDirectory(dirname(original));
	if (!existsSync(original)) writeFileSync(original, bytes, { mode: 0o600, flag: 'wx' });
	if (sha256(documentBytes(original)) !== hash) throw new Error('quarantine_hash_conflict');
	// Each provenance link persists even when a previous scan is reused.
	atomicPrivateJson(join(root, 'sources', `${sha256(sourceRef)}-${hash}.json`), { schema: 'folio/document-security-source/v1', source_ref: sourceRef, original_sha256: hash });
	privateDirectory(join(root, 'jobs')); const work = mkdtempSync(join(root, 'jobs', 'scan-')); chmodSync(work, 0o700);
	let scanner: DocumentSecurityReceipt['scanner'] = null; let signatures: DocumentSecurityReceipt['signatures'] = null;
	let status: DocumentSecurityReceipt['status'] = 'not_scanned'; let reason = 'scanner_not_configured';
	try {
		const config = readSecurityConfig();
		if (config) {
			const bin = executable(config.scanner_bin); const binaryHash = sha256(readFileSync(bin)); const dbHash = signatureDigest(config.signatures_dir);
			const version = await isolatedProcess(bin, [`--database=${config.signatures_dir}`, '--version'], work, [config.signatures_dir], 15_000, 16_384);
			if (version.code !== 0 || !/^ClamAV \S+\/\d+\//u.test(version.stdout.trim())) throw new Error('scanner_version_unverified');
			const line = version.stdout.trim(); scanner = { id: 'clamav', version: line.split('/')[0], binary_sha256: binaryHash }; signatures = { version: line.split('/').slice(1).join('/'), database_sha256: dbHash };
			const pointer = join(root, 'receipts', `hash-${hash}.json`);
			if (existsSync(pointer)) {
				const priorId = JSON.parse(documentBytes(pointer, 8192).toString('utf8')).receipt_id;
				const prior = storedSecurityReceipt(priorId);
				if (prior.status === 'clean' && prior.original_sha256 === hash && prior.byte_size === bytes.length && prior.scanner?.binary_sha256 === binaryHash && prior.signatures?.database_sha256 === dbHash && freshReceipt(prior)) return { receipt: prior, receipt_path: receiptFile(priorId), original_path: original };
			}
			const input = join(work, 'input'); writeFileSync(input, bytes, { mode: 0o600, flag: 'wx' });
			const run = await isolatedProcess(bin, [`--database=${config.signatures_dir}`, '--official-db-only=yes', '--no-summary', '--stdout', '--scan-archive=yes', '--scan-pdf=yes', '--scan-ole2=yes', '--alert-exceeds-max=yes', '--alert-encrypted=yes', '--alert-macros=yes', '--fail-if-cvd-older-than=7', '--max-filesize=20M', '--max-scansize=100M', '--max-recursion=16', '--max-files=500', '--max-scantime=0', '--bytecode-timeout=5000', '--', input], work, [config.signatures_dir]);
			if (sha256(documentBytes(input)) !== hash || signatureDigest(config.signatures_dir) !== dbHash || sha256(readFileSync(bin)) !== binaryHash) throw new Error('scanner_binding_changed');
			status = run.code === 0 && (run.stderrBytes ?? 0) === 0 && run.stdout.trim() === `${input}: OK` ? 'clean' : run.code === 1 ? 'blocked' : 'error';
			reason = status === 'clean' ? 'local_scan_clean' : status === 'blocked' ? 'malware_or_policy_alert' : 'scan_incomplete_or_error';
		}
	} catch (e) { status = 'error'; reason = e instanceof Error && /^[a-z_]+$/u.test(e.message) ? e.message : 'scanner_or_signatures_unavailable'; }
	finally { rmSync(work, { recursive: true, force: true }); }
	const receipt: DocumentSecurityReceipt = { schema: 'folio/document-security/v1', receipt_id: randomUUID(), original_sha256: hash, byte_size: bytes.length, status, reason_code: reason, scanner, signatures, scanned_at: new Date().toISOString(), policy_version: SECURITY_POLICY };
	const path = receiptFile(receipt.receipt_id); atomicPrivateJson(path, receipt); atomicPrivateJson(join(root, 'receipts', `hash-${hash}.json`), { receipt_id: receipt.receipt_id });
	atomicPrivateJson(join(root, 'last-check.json'), { schema: 'folio/document-security-health/v1', checked_at: receipt.scanned_at, ready: status === 'clean' || status === 'blocked' });
	return { receipt, receipt_path: path, original_path: original };
}
export async function extractSecuredDocument(secured: SecuredDocument, contentType: DocumentExtractionReceipt['content_type']): Promise<ExtractedDocument> {
	if (!['pdf', 'docx', 'csv', 'camt', 'xlsx', 'text'].includes(contentType)) throw new Error('unsupported_content_type');
	const stored = storedSecurityReceipt(secured.receipt.receipt_id); const rawReceipt = documentBytes(receiptFile(stored.receipt_id));
	const result: DocumentExtractionReceipt = { schema: 'folio/document-extraction/v1', original_sha256: stored.original_sha256, security_receipt_id: stored.receipt_id, security_receipt_sha256: sha256(rawReceipt), text_sha256: null, extractor: { id: 'folio-isolated-document-text', version: '4' }, extracted_at: new Date().toISOString(), status: 'blocked', trust: 'untrusted_source', content_type: contentType, reason_code: 'security_verdict_not_clean' };
	const root = join(securityRoot(), 'extractions', stored.receipt_id, contentType, randomUUID()); privateDirectory(root); let textPath: string | null = null;
	if (stored.status === 'clean') {
		try {
			const config = readSecurityConfig(); if (!config || !stored.scanner || !stored.signatures) throw new Error('scanner_not_configured');
			if (signatureDigest(config.signatures_dir) !== stored.signatures.database_sha256 || sha256(readFileSync(executable(config.scanner_bin))) !== stored.scanner.binary_sha256 || !freshReceipt(stored)) throw new Error('stale_security_receipt');
			const bytes = documentBytes(secured.original_path); if (sha256(bytes) !== stored.original_sha256) throw new Error('original_hash_mismatch');
			const work = mkdtempSync(join(securityRoot(), 'jobs', 'extract-')); chmodSync(work, 0o700);
			try {
				const input = join(work, 'input'); writeFileSync(input, bytes, { mode: 0o600, flag: 'wx' });
				const helper = resolve('scripts/extract-secured-document.py'); const python = executable(config.python_bin);
				const run = await isolatedProcess(python, ['-I', helper, contentType, input], work, [helper, dirname(dirname(python))], 30_000);
				if (run.code !== 0) throw new Error('extraction_invalid_or_unsupported');
				if (!run.stdout.trim() || Buffer.byteLength(run.stdout) > MAX_TEXT_BYTES) throw new Error('extraction_empty_or_limit');
				if (sha256(documentBytes(input)) !== stored.original_sha256) throw new Error('original_hash_mismatch');
				textPath = join(root, 'text.txt'); writeFileSync(textPath, run.stdout, { mode: 0o600 }); result.text_sha256 = sha256(run.stdout); result.status = 'extracted'; result.reason_code = 'isolated_extraction_complete';
			} finally { rmSync(work, { recursive: true, force: true }); }
		} catch (e) { result.status = 'error'; result.reason_code = e instanceof Error && /^[a-z_]+$/u.test(e.message) ? e.message : 'extraction_worker_unavailable'; }
	}
	const path = join(root, 'receipt.json'); atomicPrivateJson(path, result); return { receipt: result, receipt_path: path, text_path: textPath };
}
