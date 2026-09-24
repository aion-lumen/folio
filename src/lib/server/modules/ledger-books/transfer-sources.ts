import { existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { getSessionExchangePath } from '../../env.js';
import { atomicPrivateJson, privateDirectory, documentBytes, extractSecuredDocument, secureDocument, securityRoot, sha256, storedSecurityReceipt } from '../../file-intake/document-security.js';
import { parseWise, parseWiseActivity, deduplicateTransfers, type WiseTransfer, type WiseSourceFormat } from './transfers.js';
interface TransferSource {
    provider: 'wise';
    sha256: string;
    receipt_id: string;
    extraction_path: string;
    owner_names: string[];
    format?: WiseSourceFormat;
}
interface Registry {
    schema: 'folio/transfer-sources/v1';
    sources: TransferSource[];
}
export const transferRegistryPath = () => join(getSessionExchangePath(), 'ledger', 'transfers', 'sources.json');
function readRegistry(): Registry {
    if (!existsSync(transferRegistryPath()))
        return { schema: 'folio/transfer-sources/v1', sources: [] };
    const r = JSON.parse(documentBytes(transferRegistryPath(), 128 * 1024).toString());
    if (r.schema !== 'folio/transfer-sources/v1' || !Array.isArray(r.sources) || r.sources.length > 100)
        throw Error('transfer_registry');
    return r;
}
export function readTransferSource(source: TransferSource) {
    if (source.provider !== 'wise' || !/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9-]{36}$/.test(source.receipt_id) || !Array.isArray(source.owner_names) || !source.owner_names.length || source.owner_names.length > 20 || source.owner_names.some(n => typeof n !== 'string' || n.length > 150))
        throw Error('transfer_source');
    const format = source.format ?? 'wise-csv';
    if (!['wise-csv', 'wise-ui-text'].includes(format)) throw Error('transfer_format');
    const contentType = format === 'wise-ui-text' ? 'text' : 'csv';
    const root = resolve(securityRoot(), 'extractions', source.receipt_id, contentType) + sep;
    if (!resolve(source.extraction_path).startsWith(root) || !/^[-a-f0-9]{36}\/receipt\.json$/.test(resolve(source.extraction_path).slice(root.length)))
        throw Error('transfer_extraction_path');
    const receipt = storedSecurityReceipt(source.receipt_id), extraction = JSON.parse(documentBytes(source.extraction_path, 8192).toString());
    const textPath = join(source.extraction_path, '..', 'text.txt'), text = documentBytes(textPath, 512 * 1024);
    if (receipt.status !== 'clean' || receipt.original_sha256 !== source.sha256 || extraction.schema !== 'folio/document-extraction/v1' || extraction.status !== 'extracted' || extraction.trust !== 'untrusted_source' || extraction.content_type !== contentType || extraction.original_sha256 !== source.sha256 || extraction.security_receipt_id !== receipt.receipt_id || extraction.security_receipt_sha256 !== sha256(documentBytes(join(securityRoot(), 'receipts', receipt.receipt_id + '.json'))) || extraction.text_sha256 !== sha256(text))
        throw Error('transfer_proof_changed');
    const original = documentBytes(join(securityRoot(), 'quarantine', source.sha256, 'original'));
    if (sha256(original) !== source.sha256)
        throw Error('transfer_original_changed');
    return { ...(format === 'wise-ui-text' ? parseWiseActivity : parseWise)(text.toString('utf8'), source.sha256, source.owner_names), original, format };
}
export function readTransferHistory(): {
    records: WiseTransfer[];
    status: 'missing' | 'ready' | 'invalid';
    source_count: number;
} {
    try {
        const r = readRegistry();
        if (!r.sources.length)
            return { records: [], status: 'missing', source_count: 0 };
        const records: WiseTransfer[] = [];
        for (const source of r.sources) {
            records.push(...readTransferSource(source).records);
            if (records.length > 20000)
                throw Error('transfer_history_limit');
        }
        return { records: deduplicateTransfers(records), status: 'ready', source_count: r.sources.length };
    }
    catch {
        return { records: [], status: 'invalid', source_count: 0 };
    }
}
export async function importWiseHistory(file: string, owner_names: string[], format: WiseSourceFormat = 'wise-csv') {
    if (!['wise-csv', 'wise-ui-text'].includes(format)) throw Error('transfer_format');
    const secured = await secureDocument(file, 'transfer-history:' + resolve(file));
    if (secured.receipt.status !== 'clean')
        throw Error('transfer_scan_not_clean');
    const extracted = await extractSecuredDocument(secured, format === 'wise-ui-text' ? 'text' : 'csv');
    if (extracted.receipt.status !== 'extracted' || !extracted.text_path)
        throw Error('transfer_extraction_failed');
    const source: TransferSource = { provider: 'wise', format, sha256: secured.receipt.original_sha256, receipt_id: secured.receipt.receipt_id, extraction_path: extracted.receipt_path, owner_names };
    const checked = readTransferSource(source);
    privateDirectory(dirname(transferRegistryPath()));
    const lock = transferRegistryPath() + '.lock';
    let fd: number;
    try {
        fd = openSync(lock, 'wx', 0o600);
    }
    catch {
        throw Error('transfer_import_locked');
    }
    try {
        const registry = readRegistry();
        const all = [...registry.sources.filter(s => s.sha256 !== source.sha256), source];
        if (all.length > 100)
            throw Error('transfer_registry_limit');
        // Same provider ID must keep the same semantics across overlapping exports.
        const records: WiseTransfer[] = [];
        for (const s of all) {
            records.push(...readTransferSource(s).records);
            if (records.length > 20000) throw Error('transfer_history_limit');
        }
        const unique = deduplicateTransfers(records);
        atomicPrivateJson(transferRegistryPath(), { schema: 'folio/transfer-sources/v1', sources: all });
        return { source_sha256: source.sha256, format, records: checked.records.length, own: checked.records.filter(r => r.own).length, ignored: checked.ignored, deduplicated_records: unique.length };
    }
    finally {
        closeSync(fd);
        unlinkSync(lock);
    }
}
export function transferOriginal(digest: string) {
    return transferDownload(digest).bytes;
}
export function transferDownload(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest))
        throw Error('transfer_source');
    const source = readRegistry().sources.find(s => s.sha256 === digest);
    if (!source)
        throw Error('transfer_source');
    const checked = readTransferSource(source), isText = checked.format === 'wise-ui-text';
    return { bytes: checked.original, contentType: isText ? 'text/plain' : 'text/csv', filename: isText ? 'Wise-Aktivitaetskopie.txt' : 'Wise-Transferhistorie.csv' };
}
