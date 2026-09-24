/** Local evidence only. A clean scan grants parsing, never instruction authority. */
export interface DocumentSecurityReceipt {
	schema: 'folio/document-security/v1';
	receipt_id: string;
	original_sha256: string;
	byte_size: number;
	status: 'clean' | 'blocked' | 'not_scanned' | 'error';
	reason_code: string;
	scanner: { id: 'clamav'; version: string; binary_sha256: string } | null;
	signatures: { version: string; database_sha256: string } | null;
	scanned_at: string;
	policy_version: string;
}

export interface DocumentExtractionReceipt {
	schema: 'folio/document-extraction/v1';
	original_sha256: string;
	security_receipt_id: string;
	security_receipt_sha256: string;
	text_sha256: string | null;
	extractor: { id: 'folio-isolated-document-text'; version: string };
	extracted_at: string;
	status: 'extracted' | 'blocked' | 'error';
	trust: 'untrusted_source';
	content_type: 'pdf' | 'docx' | 'csv' | 'camt' | 'xlsx' | 'text';
	reason_code: string;
}
