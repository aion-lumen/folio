import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicPrivateJson, privateDirectory, securityRoot, sha256, SECURITY_POLICY } from '../../file-intake/document-security.js';
import { importWiseHistory, readTransferHistory, readTransferSource, transferOriginal, transferDownload, transferRegistryPath } from './transfer-sources.js';
const oldDb = process.env.FOLIO_DB_PATH, oldExchange = process.env.FOLIO_SESSION_EXCHANGE_PATH;
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'folio-transfer-test-')); process.env.FOLIO_DB_PATH = join(dir, 'folio.db'); process.env.FOLIO_SESSION_EXCHANGE_PATH = join(dir, 'exchange'); });
afterEach(() => { if (oldDb === undefined)
    delete process.env.FOLIO_DB_PATH;
else
    process.env.FOLIO_DB_PATH = oldDb; if (oldExchange === undefined)
    delete process.env.FOLIO_SESSION_EXCHANGE_PATH;
else
    process.env.FOLIO_SESSION_EXCHANGE_PATH = oldExchange; rmSync(dir, { recursive: true, force: true }); });
function fixture(format: 'wise-csv' | 'wise-ui-text' = 'wise-csv') {
    const text = Buffer.from(format === 'wise-ui-text' ? '11. Juli 2026\nAbgeschlossen\n10. Juli 2026\nAlex Example\nGesendet\n950 EUR\n1.005 CHF' : 'ID,Status,Richtung,Erstellt am,Abgeschlossen am,Betrag der Ausgangsgebühr,Währung der Ausgangsgebühr,Betrag der Zielgebühr,Währung der Zielgebühr,Quellenname,Ausgangsbetrag (nach Gebühren),Ausgangswährung,Name des Empfängers,Zielbetrag (nach Gebühren),Zielwährung,Wechselkurs\nTRANSFER-42,COMPLETED,OUT,2026-07-10,2026-07-11,5,CHF,0,EUR,Alex Example,1000,CHF,Alex Example,950,EUR,0.95');
    const digest = sha256(text), id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const receipt = { schema: 'folio/document-security/v1', receipt_id: id, policy_version: SECURITY_POLICY, original_sha256: digest, byte_size: text.length, status: 'clean', scanned_at: new Date().toISOString(), scanner: { id: 'clamav', binary_sha256: 'a'.repeat(64) }, signatures: { database_sha256: 'b'.repeat(64) } };
    const receiptBytes = Buffer.from(JSON.stringify(receipt));
    privateDirectory(join(securityRoot(), 'receipts'));
    writeFileSync(join(securityRoot(), 'receipts', id + '.json'), receiptBytes);
    const extraction = join(securityRoot(), 'extractions', id, format === 'wise-ui-text' ? 'text' : 'csv', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    privateDirectory(extraction);
    writeFileSync(join(extraction, 'text.txt'), text);
    atomicPrivateJson(join(extraction, 'receipt.json'), { schema: 'folio/document-extraction/v1', status: 'extracted', trust: 'untrusted_source', content_type: format === 'wise-ui-text' ? 'text' : 'csv', original_sha256: digest, security_receipt_id: id, security_receipt_sha256: sha256(receiptBytes), text_sha256: sha256(text) });
    const original = join(securityRoot(), 'quarantine', digest, 'original');
    privateDirectory(join(original, '..'));
    writeFileSync(original, text);
    const source = { provider: 'wise' as const, format, sha256: digest, receipt_id: id, extraction_path: join(extraction, 'receipt.json'), owner_names: ['Alex Example'] };
    atomicPrivateJson(transferRegistryPath(), { schema: 'folio/transfer-sources/v1', sources: [source] });
    return { source, text, original, extraction };
}
describe('private transfer-source provenance', () => {
    it('reports missing history instead of claiming a successful reconciliation', () => expect(readTransferHistory()).toEqual({ records: [], status: 'missing', source_count: 0 }));
    it('reads a source only through its bound clean scan and extraction', () => { const f = fixture(); expect(readTransferHistory().records).toHaveLength(1); expect(transferOriginal(f.source.sha256)).toEqual(f.text); });
    it.each(['original', 'text'])('rejects modified %s bytes and exposes no records', kind => { const f = fixture(); writeFileSync(kind === 'original' ? f.original : join(f.extraction, 'text.txt'), 'changed'); expect(readTransferHistory().status).toBe('invalid'); expect(readTransferHistory().records).toEqual([]); expect(() => transferOriginal(f.source.sha256)).toThrow(); });
    it('rejects an unbound digest and extraction outside its receipt directory', () => { const f = fixture(); expect(() => transferOriginal('c'.repeat(64))).toThrow(); expect(() => readTransferSource({ ...f.source, extraction_path: '/tmp/arbitrary/receipt.json' })).toThrow('transfer_extraction_path'); });
    it('does not import a CSV if the configured security scan is unavailable', async () => { const file = join(dir, 'unsafe.csv'); writeFileSync(file, 'not yet checked'); await expect(importWiseHistory(file, ['Alex Example'])).rejects.toThrow('transfer_scan_not_clean'); expect(readTransferHistory().status).toBe('missing'); });
});

describe('activity text provenance', () => {
    it('binds the original activity copy to a text scan/extraction and preserves its media type', () => {
        const f = fixture('wise-ui-text');
        expect(readTransferHistory()).toMatchObject({status:'ready',source_count:1});
        expect(readTransferHistory().records[0]).toMatchObject({source_format:'wise-ui-text',source_fee:null});
        expect(transferDownload(f.source.sha256)).toEqual({bytes:f.text,contentType:'text/plain',filename:'Wise-Aktivitaetskopie.txt'});
        expect(() => readTransferSource({...f.source,format:'wise-csv'})).toThrow('transfer_extraction_path');
        writeFileSync(f.original, 'changed');
        expect(readTransferHistory().status).toBe('invalid');
    });
    it('does not register unscanned text', async () => {
        const file=join(dir,'activity.txt');writeFileSync(file,'unscanned');
        await expect(importWiseHistory(file,['Alex Example'],'wise-ui-text')).rejects.toThrow('transfer_scan_not_clean');
        expect(readTransferHistory().status).toBe('missing');
    });
});
