import { createHash } from 'node:crypto';
export type TransferProvider = 'wise' | 'ib';
export type WiseSourceFormat = 'wise-csv' | 'wise-ui-text';
export interface TransferBankEntry {
    entry_id: string;
    booking_date: string;
    amount: string;
    currency: string;
    counterparty: string | null;
    purpose: string;
    account_ref: string;
}
export interface WiseTransfer {
    id: string;
    created: string;
    completed: string;
    source_amount: number;
    source_fee: number | null;
    source_currency: string;
    target_amount: number;
    target_fee: number | null;
    target_currency: string;
    rate: number | null;
    source_format?: WiseSourceFormat;
    source_amount_basis?: 'net' | 'gross';
    recipient_name?: string;
    completed_from_group?: boolean;
    own: boolean;
    line: number;
    source_sha256: string;
}
export interface TransferMatch {
    provider: TransferProvider;
    status: 'bank_leg' | 'provider_evidenced' | 'paired' | 'ambiguous' | 'external_payment';
    record?: WiseTransfer;
    counterpart_ids: string[];
}
const normalized = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export function transferProvider(entry: Pick<TransferBankEntry, 'counterparty' | 'purpose'>): TransferProvider | null {
    const lines = [entry.counterparty ?? '', ...entry.purpose.split(/\r?\n/)].map(s => normalized(s).replace(/^\.\s+/, ''));
    if (lines.some(s => /^INTERACTIVE\s+BROKERS\b/.test(normalized(s))))
        return 'ib';
    if (lines.some(s => /^(?:TRANSFER\s*WISE|WISE)(?:\s|$)/.test(normalized(s))))
        return 'wise';
    return null;
}
/** Bounded RFC4180 records. No formula execution, delimiter inference or partial acceptance. */
export function csvRows(text: string): string[][] {
    if (Buffer.byteLength(text) > 512 * 1024 || text.includes('\0'))
        throw Error('csv_limit');
    const rows: string[][] = [];
    let row: string[] = [], field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                field += c;
            if (field.length > 20000)
                throw Error('csv_limit');
            continue;
        }
        if (c === '"') {
            if (field || closed)
                throw Error('csv_quote');
            quoted = true;
        }
        else if (c === ',' || c === '\n' || c === '\r') {
            row.push(field);
            field = '';
            closed = false;
            if (c !== ',') {
                if (row.some(v => v !== ''))
                    rows.push(row);
                row = [];
                if (c === '\r' && text[i + 1] === '\n')
                    i++;
            }
        }
        else {
            if (closed)
                throw Error('csv_trailing_character');
            field += c;
        }
        if (rows.length > 10000 || row.length > 100 || field.length > 20000)
            throw Error('csv_limit');
    }
    if (quoted)
        throw Error('csv_unclosed_quote');
    if (field || closed || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length > 10000 || rows.some(r => r.length > 100))
        throw Error('csv_limit');
    return rows;
}
function decimal(value: string, allowEmpty = false) {
    if (!value && allowEmpty)
        return 0;
    if (!/^\d+(?:[.,]\d{1,12})?$/.test(value))
        throw Error('wise_amount');
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n > 1e9)
        throw Error('wise_amount');
    return n;
}
function day(value: string) {
    let date = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/)?.[1];
    if (!date) {
        const m = value.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(?:[T ]|$)/);
        if (m)
            date = `${m[3]}-${m[2]}-${m[1]}`;
    }
    if (!date || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date)
        throw Error('wise_date');
    return date;
}
const nameKey = (s: string) => normalized(s).split(/[^A-Z]+/).filter(Boolean).sort().join(' ');
export function parseWise(text: string, source_sha256: string, ownerNames: string[]): {
    records: WiseTransfer[];
    ignored: number;
} {
    const rows = csvRows(text), headers = rows.shift() ?? [];
    const names = ['ID', 'Status', 'Richtung', 'Erstellt am', 'Abgeschlossen am', 'Betrag der Ausgangsgebühr', 'Währung der Ausgangsgebühr', 'Betrag der Zielgebühr', 'Währung der Zielgebühr', 'Quellenname', 'Ausgangsbetrag (nach Gebühren)', 'Ausgangswährung', 'Name des Empfängers', 'Zielbetrag (nach Gebühren)', 'Zielwährung', 'Wechselkurs'];
    if (names.some(n => !headers.includes(n)) || new Set(headers).size !== headers.length)
        throw Error('wise_header_unsupported');
    if (!rows.length)
        throw Error('wise_export_empty');
    if (!/^[a-f0-9]{64}$/.test(source_sha256) || !ownerNames.length || ownerNames.length > 20 || ownerNames.some(n => nameKey(n).length < 4))
        throw Error('wise_identity');
    const records: WiseTransfer[] = [];
    const ids = new Set<string>();
    let ignored = 0;
    for (const [i, row] of rows.entries()) {
        if (row.length !== headers.length)
            throw Error('wise_row_width');
        const get = (name: string) => row[headers.indexOf(name)].trim();
        const status = normalized(get('Status'));
        if (['CANCELLED', 'CANCELED', 'STORNIERT', 'ABGEBROCHEN', 'REFUNDED', 'ZURUCKERSTATTET'].includes(status)) {
            ignored++;
            continue;
        }
        if (!['COMPLETED', 'ABGESCHLOSSEN', 'AUSGEFUHRT'].includes(status))
            throw Error('wise_status_unsupported');
        const id = get('ID');
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id))
            throw Error('wise_duplicate_or_id');
        ids.add(id);
        const source_currency = get('Ausgangswährung'), target_currency = get('Zielwährung');
        if (![source_currency, target_currency].every(c => /^[A-Z]{3}$/.test(c)))
            throw Error('wise_currency');
        const source_fee = decimal(get('Betrag der Ausgangsgebühr'), true), target_fee = decimal(get('Betrag der Zielgebühr'), true);
        if ((source_fee && get('Währung der Ausgangsgebühr') !== source_currency) || (target_fee && get('Währung der Zielgebühr') !== target_currency))
            throw Error('wise_fee_currency');
        const source_amount = decimal(get('Ausgangsbetrag (nach Gebühren)')), target_amount = decimal(get('Zielbetrag (nach Gebühren)')), rate = decimal(get('Wechselkurs'));
        if (source_amount <= 0 || target_amount <= 0 || rate <= 0 || Math.abs(source_amount * rate - (target_amount + target_fee)) > .025)
            throw Error('wise_fx_control');
        const created = day(get('Erstellt am')), completed = day(get('Abgeschlossen am'));
        if (completed < created)
            throw Error('wise_date_order');
        const own = ownerNames.some(n => nameKey(n) === nameKey(get('Quellenname'))) && ownerNames.some(n => nameKey(n) === nameKey(get('Name des Empfängers')));
        records.push({ id, created, completed, source_amount, source_fee, source_currency, target_amount, target_fee, target_currency, rate, own, recipient_name: get('Name des Empfängers'), line: i + 2, source_sha256 });
    }
    return { records, ignored };
}
/** German Wise activity copy. Group headings are completion dates; fees/IDs are absent.
 * The importer explicitly attests that this is the holder's own Wise history.
 * This source never invents provider IDs, fees, FX rates or bank transactions. */
export function parseWiseActivity(text: string, source_sha256: string, ownerNames: string[]): { records: WiseTransfer[]; ignored: number } {
    if (Buffer.byteLength(text) > 512 * 1024 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
        throw Error('wise_text_limit');
    if (!/^[a-f0-9]{64}$/.test(source_sha256) || !ownerNames.length || ownerNames.length > 20 || ownerNames.some(n => nameKey(n).length < 4 || n.length > 150))
        throw Error('wise_identity');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((s, i) => ({ text: s.trim(), line: i + 1 })).filter(x => x.text);
    if (!lines.length) throw Error('wise_export_empty');
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const date = (value: string) => {
        const m = value.match(/^(\d{1,2})\. (\S+) (\d{4})$/), month = m ? months.indexOf(m[2]) + 1 : 0;
        if (!m || !month) throw Error('wise_date');
        return day(`${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    };
    const amount = (value: string, currency: string) => {
        const m = value.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(,\d{2})? ([A-Z]{3})$/);
        if (!m || m[3] !== currency) throw Error('wise_activity_amount');
        const n = decimal(m[1].replaceAll('.', '') + (m[2] ?? ''));
        if (n <= 0) throw Error('wise_activity_amount');
        return n;
    };
    const records: WiseTransfer[] = [], ids = new Set<string>();
    let i = 0, completed: string | null = null;
    while (i < lines.length) {
        const line = lines[i].line, completed_from_group = lines[i].text === 'Abgeschlossen';
        if (!completed_from_group) completed = date(lines[i++].text);
        if (!completed || lines[i]?.text !== 'Abgeschlossen' || lines[i + 3]?.text !== 'Gesendet' || !lines[i + 5])
            throw Error('wise_activity_structure');
        const created = date(lines[i + 1].text), recipient_name = lines[i + 2].text;
        if (created > completed || Date.parse(completed) - Date.parse(created) > 31 * 86400000)
            throw Error('wise_date_order');
        if (!/^[\p{L} .'-]{4,150}$/u.test(recipient_name)) throw Error('wise_identity');
        const source_amount = amount(lines[i + 5].text, 'CHF'), target_amount = amount(lines[i + 4].text, 'EUR');
        const own = ownerNames.some(n => nameKey(n) === nameKey(recipient_name));
        const id = 'wise-ui-' + createHash('sha256').update(JSON.stringify([created, completed, nameKey(recipient_name), source_amount, target_amount])).digest('hex').slice(0, 32);
        if (ids.has(id)) throw Error('wise_activity_duplicate');
        ids.add(id);
        records.push({ id, created, completed, source_amount, source_currency: 'CHF', target_amount, target_currency: 'EUR', source_fee: null, target_fee: null, rate: null, source_amount_basis: 'gross', source_format: 'wise-ui-text', recipient_name, completed_from_group, own, line, source_sha256 });
        if (records.length > 10000) throw Error('transfer_history_limit');
        i += 6;
    }
    return { records, ignored: 0 };
}
export const transferDebit = (r: WiseTransfer) => r.source_amount_basis === 'gross' ? r.source_amount : r.source_amount + (r.source_fee ?? 0);
function namedOwnCredit(e: TransferBankEntry, r: WiseTransfer) {
    if (!r.own || !r.recipient_name || Number(e.amount) <= 0) return false;
    // Older statements name the holder instead of Wise. Only the leading
    // counterparty identity qualifies; a name somewhere in free text does not.
    const words = normalized(e.counterparty ?? '').replace(/^[^A-Z]+/, '').split(/[^A-Z]+/).filter(Boolean);
    const count = nameKey(r.recipient_name).split(' ').length;
    return nameKey(words.slice(0, count).join(' ')) === nameKey(r.recipient_name);
}
function legacyWiseFunding(e: TransferBankEntry, r: WiseTransfer) {
    // Historical funding names are not general provider aliases. Worldpay
    // also processes unrelated payments; require an exact owner-bound record.
    return r.own && r.source_currency === 'CHF' && Number(e.amount) < 0
        && e.booking_date >= r.created && e.booking_date <= r.completed
        && [e.counterparty ?? '', ...e.purpose.split(/\r?\n/)].some(s => /^(?:WORLDPAY AP LTD|TW LTD - SWITZERLAND - CHF)$/.test(normalized(s)));
}
const cents = (n: number) => Math.round(n * 100);
/** No cross-currency matching by guessed rates; ambiguity and reused bank legs fail closed. */
export function matchTransfers(entries: TransferBankEntry[], records: WiseTransfer[]): Map<string, TransferMatch> {
    const matches = new Map<string, TransferMatch>();
    for (const e of entries) {
        const provider = transferProvider(e);
        if (provider)
            matches.set(e.entry_id, { provider, status: 'bank_leg', counterpart_ids: [] });
    }
    const unique = deduplicateTransfers(records);
    const eligible = new Map<string, TransferBankEntry[]>();
    const key = (amount: number, currency: string) => `${currency}:${cents(amount)}`;
    for (const e of entries) {
            const k = key(Number(e.amount), e.currency), list = eligible.get(k) ?? [];
            list.push(e);
            eligible.set(k, list);
        }
    const candidates = unique.filter(r => [r.source_currency, r.target_currency].every(c => ['CHF', 'EUR'].includes(c))).map(r => {
        const within = (e: TransferBankEntry, start: string, end: string) => e.booking_date >= new Date(Date.parse(start) - 3 * 86400000).toISOString().slice(0, 10) && e.booking_date <= new Date(Date.parse(end) + 5 * 86400000).toISOString().slice(0, 10);
        const possibleOutgoing = (eligible.get(key(-transferDebit(r), r.source_currency)) ?? []).filter(e => (transferProvider(e) === 'wise' && within(e, r.created, r.completed)) || legacyWiseFunding(e, r));
        // Prefer the provider's actual creation/completion interval. A broad
        // settlement tolerance must not conflate repeated equal-size transfers.
        const during = possibleOutgoing.filter(e => e.booking_date >= r.created && e.booking_date <= r.completed);
        const outgoing = during.length ? during : possibleOutgoing;
        const incoming = (eligible.get(key(r.target_amount, r.target_currency)) ?? []).filter(e => (transferProvider(e) === 'wise' || namedOwnCredit(e, r)) && within(e, r.completed, r.completed));
        return { r, outgoing, incoming };
    });
    const uses = new Map<string, number>();
    for (const c of candidates)
        for (const e of [...c.incoming, ...c.outgoing])
            uses.set(e.entry_id, (uses.get(e.entry_id) ?? 0) + 1);
    for (const { r, outgoing, incoming } of candidates) {
        const ambiguous = outgoing.length > 1 || incoming.length > 1 || [...outgoing, ...incoming].some(e => uses.get(e.entry_id) !== 1);
        for (const e of [...outgoing, ...incoming])
            matches.set(e.entry_id, { provider: 'wise', status: ambiguous ? 'ambiguous' : !r.own ? 'external_payment' : outgoing.length === 1 && incoming.length === 1 ? 'paired' : 'provider_evidenced', ...(ambiguous ? {} : { record: r }), counterpart_ids: ambiguous ? [] : [...outgoing, ...incoming].filter(x => x.entry_id !== e.entry_id).map(x => x.entry_id) });
    }
    return matches;
}
export function deduplicateTransfers(records: WiseTransfer[]) {
    if (records.length > 20000)
        throw Error('transfer_history_limit');
    const unique = new Map<string, WiseTransfer>();
    for (const r of records) {
        const prior = unique.get(r.id);
        if (prior) {
            const semantic = (x: WiseTransfer) => JSON.stringify({ ...x, line: 0, source_sha256: '', completed_from_group: false });
            if (semantic(prior) !== semantic(r))
                throw Error('wise_conflicting_transfer');
        }
        else
            unique.set(r.id, r);
    }
    // An official export can supersede a text copy only with a unique exact
    // economic match. Different provider IDs or conflicting ownership stay
    // separate and therefore ambiguous at the bank-leg matching boundary.
    const all = [...unique.values()];
    const signature = (r: WiseTransfer) => JSON.stringify([r.created, r.completed, cents(transferDebit(r)), r.source_currency, cents(r.target_amount), r.target_currency, r.own, nameKey(r.recipient_name ?? '')]);
    const official = new Map<string, number>();
    for (const r of all.filter(r => r.source_format !== 'wise-ui-text')) official.set(signature(r), (official.get(signature(r)) ?? 0) + 1);
    return all.filter(r => r.source_format !== 'wise-ui-text' || official.get(signature(r)) !== 1);
}
