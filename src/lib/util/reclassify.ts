// Capability gate for mail re-classification (VerdictStage) + the on-demand council
// object lookup. A mail is re-classifiable when it is a REAL feedback.db row — its uid
// is a numeric feedback_id and it is not a mock. This is the actual capability; it
// replaces the former `account === 'yahoo'` name-proxy, which silently broke once the
// demo mail store was masked to konto-a/konto-b (Aufgabe 1.4). Guard on the capability,
// never on an account/vault name.
export function canReclassify(
	row: { isMock?: boolean; uid?: string | null } | null | undefined
): boolean {
	if (!row || row.isMock) return false;
	const id = Number.parseInt(String(row.uid ?? ''), 10);
	return Number.isFinite(id) && id > 0;
}
