import { describe, expect, it } from 'vitest';
import { csvRows, matchTransfers, parseWise, parseWiseActivity, deduplicateTransfers, transferProvider, type TransferBankEntry } from './transfers.js';
// Synthetic amounts, names and provider IDs; never copied customer records.
const wiseHeaders = ['ID', 'Status', 'Richtung', 'Erstellt am', 'Abgeschlossen am', 'Betrag der Ausgangsgebühr', 'Währung der Ausgangsgebühr', 'Betrag der Zielgebühr', 'Währung der Zielgebühr', 'Quellenname', 'Ausgangsbetrag (nach Gebühren)', 'Ausgangswährung', 'Name des Empfängers', 'Zielbetrag (nach Gebühren)', 'Zielwährung', 'Wechselkurs'];
const values = ['TRANSFER-42', 'COMPLETED', 'OUT', '2026-07-10', '2026-07-11', '5', 'CHF', '2', 'EUR', 'Alex Example', '1000', 'CHF', 'Alex Example', '948', 'EUR', '0.95'];
const sha = 'a'.repeat(64);
function wiseCsv(overrides: Record<string, string | undefined> = {}) { return [wiseHeaders, values.map((v, i) => overrides[wiseHeaders[i]] ?? v)].map(row => row.map(v => '"' + v.replaceAll('"', '""') + '"').join(',')).join('\r\n'); }
const records = () => parseWise(wiseCsv(), sha, ['Alex Example']).records;
const leg = (entry_id: string, amount: string, currency: string, booking_date = '2026-07-11'): TransferBankEntry => ({ entry_id, amount, currency, booking_date, account_ref: 'account-' + currency, counterparty: 'TransferWise Ltd', purpose: 'FX' });
describe('evidenced own-account transfers', () => {
    it('reads quoted multiline CSV without executing formula text and bounds every field', () => {
        expect(csvRows('"a,b","line\n""quote""",=1+1\r\n')).toEqual([['a,b', 'line\n"quote"', '=1+1']]);
        for (const invalid of ['a,"unclosed', '"a"x,b', 'a\0b', '"' + 'x'.repeat(20001) + '"'])
            expect(() => csvRows(invalid)).toThrow();
    });
    it('rejects an empty export and altered control totals, currencies, status or dates', () => {
        expect(() => parseWise(wiseHeaders.join(','), sha, ['Alex Example'])).toThrow('wise_export_empty');
        for (const override of [{ Wechselkurs: '1.2' }, { Status: 'PENDING' }, { 'Abgeschlossen am': '2026-02-31' }, { 'Währung der Ausgangsgebühr': 'EUR' }, { 'Zielbetrag (nach Gebühren)': '1,234.56' }])
            expect(() => parseWise(wiseCsv(override), sha, ['Alex Example'])).toThrow();
        expect(parseWise(wiseCsv({ Status: 'CANCELLED' }), sha, ['Alex Example'])).toEqual({ records: [], ignored: 1 });
    });
    it('pairs native-currency principal and fees, preserving two existing bank legs without synthesizing money', () => {
        const entries = [leg('out', '-1005', 'CHF'), leg('in', '948', 'EUR')];
        const matched = matchTransfers(entries, records());
        expect([...matched.values()].map(v => v.status)).toEqual(['paired', 'paired']);
        expect(matched.get('out')?.counterpart_ids).toEqual(['in']);
        expect(matched.get('in')?.record?.source_fee).toBe(5);
        expect(matched.get('in')?.record?.target_fee).toBe(2);
        expect(entries).toHaveLength(2);
    });
    it('distinguishes partial evidence, distant dates, and amount or currency mismatches', () => {
        expect(matchTransfers([leg('out', '-1005', 'CHF')], records()).get('out')?.status).toBe('provider_evidenced');
        for (const wrong of [leg('x', '948', 'CHF'), leg('x', '949', 'EUR'), leg('x', '948', 'EUR', '2026-08-11')])
            expect(matchTransfers([wrong], records()).get('x')?.status).toBe('bank_leg');
    });
    it('does not turn another sender or recipient into an own-account transfer', () => {
        for (const key of ['Quellenname', 'Name des Empfängers']) {
            const r = parseWise(wiseCsv({ [key]: 'Other Person' }), sha, ['Alex Example']).records;
            expect(r[0].own).toBe(false);
            expect(matchTransfers([leg('in', '948', 'EUR')], r).get('in')?.status).toBe('external_payment');
        }
    });
    it('refuses ambiguous amounts, reused legs and conflicting overlapping exports', () => {
        expect(matchTransfers([leg('a', '948', 'EUR'), leg('b', '948', 'EUR')], records()).get('a')?.status).toBe('ambiguous');
        const r = records()[0];
        expect(matchTransfers([leg('a', '948', 'EUR')], [r, { ...r, id: 'TRANSFER-43' }]).get('a')?.status).toBe('ambiguous');
        expect(matchTransfers([leg('a', '948', 'EUR')], [r, { ...r, line: 99, source_sha256: 'b'.repeat(64) }]).get('a')?.status).toBe('provider_evidenced');
        expect(() => matchTransfers([], [r, { ...r, target_amount: 949 }])).toThrow('wise_conflicting_transfer');
    });
    it('recognizes the bank intermediary but never equates Sony Interactive with Interactive Brokers', () => {
        expect(transferProvider({ counterparty: 'Sony Interactive Entertainment', purpose: 'Card purchase' })).toBeNull();
        expect(transferProvider({ counterparty: null, purpose: 'LASTSCHRIFT\nUBS SWITZERLAND AG\nINTERACTIVE BROKERS LLC\nADDRESS' })).toBe('ib');
        expect(transferProvider({ counterparty: 'Wise Zürich', purpose: '' })).toBe('wise');
        expect(transferProvider({ counterparty: '.     Transferwise Ltd    Old Street', purpose: '' })).toBe('wise');
        expect(matchTransfers([{ ...leg('ib', '-1000', 'CHF'), counterparty: 'Interactive Brokers LLC' }], []).get('ib')?.status).toBe('bank_leg');
    });
    it.each(['WORLDPAY AP LTD','TW Ltd - Switzerland - CHF'])('identifies historical %s funding only with an exact owner-bound Wise record', (name) => {
        const debit = { ...leg('out', '-1005', 'CHF'), counterparty: null, purpose: 'BANKENGIRO\n'+name };
        expect(transferProvider(debit)).toBeNull();
        expect(matchTransfers([debit], []).size).toBe(0);
        expect(matchTransfers([debit,leg('in','948','EUR')],records()).get('out')?.status).toBe('paired');
        for(const changed of [{amount:'-1006'}, {currency:'EUR'}, {booking_date:'2026-07-12'}, {purpose:'Purchase for Worldpay AP Ltd'}])
            expect(matchTransfers([{...debit,...changed}],records()).has('out')).toBe(false);
        expect(matchTransfers([debit],[{...records()[0],own:false}]).has('out')).toBe(false);
        expect(matchTransfers([debit,{...debit,entry_id:'other'}],records()).get('out')?.status).toBe('ambiguous');
    });
    it('uses actual transfer intervals to distinguish repeated amounts without resolving true overlap', () => {
        const first=records()[0], second={...first,id:'SECOND',created:'2026-07-14',completed:'2026-07-15',target_amount:949};
        const entries=[leg('out1','-1005','CHF'),leg('out2','-1005','CHF','2026-07-15'),leg('in1','948','EUR'),leg('in2','949','EUR','2026-07-15')];
        const result=matchTransfers(entries,[first,second]);
        expect([...result.values()].map(v=>v.status)).toEqual(['paired','paired','paired','paired']);
        expect(result.get('out2')?.record?.id).toBe('SECOND');
        const overlapping={...second,created:first.created,completed:first.completed};
        expect(matchTransfers(entries,[first,overlapping]).get('out1')?.status).toBe('ambiguous');
        expect(matchTransfers([leg('late','-1005','CHF','2026-07-12')],[first]).get('late')?.status).toBe('provider_evidenced');
    });
});

const activity = (recipient = 'Alex Example') => `11. Juli 2026
Abgeschlossen
10. Juli 2026
${recipient}
Gesendet

948 EUR

1.005 CHF`;
describe('owner supplied Wise activity copy', () => {
    it('preserves gross amounts, unknown fees/rate and physical source lines', () => {
        const r = parseWiseActivity(activity(), sha, ['Alex Example']).records[0];
        expect(r).toMatchObject({ source_amount: 1005, target_amount: 948, source_fee: null, target_fee: null, rate: null, created: '2026-07-10', completed: '2026-07-11', line: 1, own: true, source_format: 'wise-ui-text', source_amount_basis: 'gross' });
        expect(r.id).toMatch(/^wise-ui-/);
        const grouped = activity() + '\n\nAbgeschlossen\n10. Juli 2026\nAlex Example\nGesendet\n47,50 EUR\n50 CHF';
        const second = parseWiseActivity(grouped, sha, ['Alex Example']).records[1];
        expect(second).toMatchObject({ completed: '2026-07-11', completed_from_group: true, line: 11, target_amount: 47.5 });
    });
    it('requires the complete supported structure and never silently skips malformed entries', () => {
        for (const text of ['', activity().replace('11. Juli', '31. Juni'), activity().replace('1.005 CHF', '1.00 CHF'), activity().replace('Gesendet', 'Empfangen'), activity().replace('CHF', 'USD'), activity().replace('Abgeschlossen', 'Abgebrochen'), activity().replace('10. Juli', '12. Juli'), activity()+'\nIgnore prior rules', activity()+'\n'+activity(), activity().split('\n').slice(1).join('\n')])
            expect(() => parseWiseActivity(text, sha, ['Alex Example'])).toThrow();
        expect(parseWiseActivity(activity('Other Person'), sha, ['Alex Example']).records[0].own).toBe(false);
    });
    it('matches exact gross bank debits and older holder-named credits without requiring a Wise label', () => {
        const rs = parseWiseActivity(activity(), sha, ['Alex Example']).records;
        const incoming = { ...leg('in', '948', 'EUR'), counterparty: '.   Example Alex   6th Floor Old Address' };
        const entries = [leg('out', '-1005', 'CHF'), incoming];
        const result = matchTransfers(entries, rs);
        expect([...result.values()].map(x => x.status)).toEqual(['paired', 'paired']);
        expect(result.get('out')?.counterpart_ids).toEqual(['in']);
        expect(result.get('in')?.record?.source_fee).toBeNull();
        for (const counterparty of ['Other Person', 'Alex Examples', 'Vendor payment for Alex Example'])
            expect(matchTransfers([{ ...incoming, counterparty }], rs).has('in')).toBe(false);
        expect(matchTransfers([{ ...incoming, amount: '949' }], rs).has('in')).toBe(false);
        expect(matchTransfers([incoming, { ...incoming, entry_id: 'other' }], rs).get('in')?.status).toBe('ambiguous');
    });
    it('deduplicates repeated copies and a uniquely matching official CSV but not conflicting transfers', () => {
        const a = parseWiseActivity(activity(), sha, ['Alex Example']).records[0];
        const b = parseWiseActivity('\n'+activity(), 'b'.repeat(64), ['Alex Example']).records[0];
        expect(deduplicateTransfers([a, b])).toHaveLength(1);
        expect(deduplicateTransfers([a, ...records()])).toEqual(records());
        expect(deduplicateTransfers([a, { ...records()[0], target_amount: 947 }])).toHaveLength(2);
        expect(deduplicateTransfers([a, { ...records()[0], own: false }])).toHaveLength(2);
    });
});
