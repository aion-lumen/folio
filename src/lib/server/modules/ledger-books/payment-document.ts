import { join } from 'node:path';
import { documentBytes,securityRoot,sha256,storedSecurityReceipt } from '../../file-intake/document-security.js';
export function clearedInvoiceText(proof:Record<string,any>):string {
 const receipt=storedSecurityReceipt(proof.receipt_id);
 if(!/^[a-f0-9-]{36}$/.test(proof.extraction_id) || receipt.status!=='clean' || receipt.original_sha256!==proof.original_sha256)throw new Error('invoice_security_binding');
 const base=join(securityRoot(),'extractions',receipt.receipt_id,'pdf',proof.extraction_id);
 const bytes=documentBytes(join(base,'receipt.json'),16384),extraction=JSON.parse(bytes.toString());
 const text=documentBytes(join(base,'text.txt'),512*1024);
 if(sha256(documentBytes(join(securityRoot(),'receipts',receipt.receipt_id+'.json')))!==proof.security_sha256 || sha256(documentBytes(join(securityRoot(),'quarantine',receipt.original_sha256,'original')))!==proof.original_sha256 || sha256(bytes)!==proof.extraction_sha256 || extraction.status!=='extracted' || extraction.original_sha256!==proof.original_sha256 || extraction.security_receipt_sha256!==proof.security_sha256 || extraction.text_sha256!==proof.text_sha256 || sha256(text)!==proof.text_sha256)throw new Error('invoice_extraction_binding');
 return text.toString();
}
