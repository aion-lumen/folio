import { isLedgerDemo, ledgerDemoFile } from './ledger-demo.js';
import { documentBytes, sha256, storedSecurityReceipt } from './file-intake/document-security.js';
import { canonicalHash, validateReconciliation } from './modules/ledger-books/reconciliation.js';
import { readHouseholdContext } from './modules/ledger-books/household.js';

const ids = ['matched', 'ambiguous', 'gap'];
function source(id: string) {
	if (!isLedgerDemo() || !ids.includes(id)) throw new Error('demo_case_unavailable');
	const file = `demo-invoice-${id}.pdf`;
	const proof = JSON.parse(documentBytes(ledgerDemoFile('proofs.json')).toString())[file];
	const receipt = storedSecurityReceipt(proof.clearance.receipt_id);
	const bytes = documentBytes(ledgerDemoFile('inputs/' + file));
	if (receipt.status !== 'clean' || receipt.original_sha256 !== sha256(bytes)
		|| canonicalHash(receipt) !== canonicalHash(proof.clearance)
		|| proof.extraction?.status !== 'extracted' || proof.extraction.original_sha256 !== sha256(bytes)) throw new Error('demo_source_changed');
	const candidateBytes = documentBytes(ledgerDemoFile(`cases/${id}-candidate.json`));
	const candidate = JSON.parse(candidateBytes.toString());
	const result = JSON.parse(documentBytes(ledgerDemoFile(`cases/${id}-result.json`)).toString());
	const { batch } = readHouseholdContext();
	if (candidate.source?.sha256 !== sha256(bytes) || !validateReconciliation(result, candidateBytes, batch.batch_sha256)) throw new Error('demo_result_changed');
	const expected: Record<string, string> = { matched: 'matched', ambiguous: 'ambiguous', gap: 'unknown_due_to_missing_coverage' };
	if (result.status !== expected[id]) throw new Error('demo_scenario_changed');
	return { bytes, candidate, result, batch };
}
export function ledgerDemoDocument(id: string) { return source(id).bytes; }
export function ledgerDemoCases() {
	return ids.map(id => {
		const { candidate, result, batch } = source(id);
		const request = candidate.match_request;
		const bank = batch.entries.filter(e => result.matches.some((m: { observation_id: string }) => m.observation_id === e.observation_id));
		return { id, amount: request.amount, currency: request.currency, party: request.counterparty, reference: request.references[0],
			status: result.status, generatedAt: result.generated_at, confirmed: result.system_confirmation.confirmed,
			gapCount: result.coverage.gaps.length,
			bankDocuments: bank.flatMap(e => e.evidence.map(p => ({ date: e.booking_date, url: `/api/ledger/household/entries/${e.entry_id}/documents/statement/${p.sha256}?batch=${batch.batch_sha256}` }))) };
	});
}
