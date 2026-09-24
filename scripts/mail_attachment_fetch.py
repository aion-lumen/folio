"""Bounded MIME acquisition; no opening attachments, mailbox writes or actions.

Uses the established read-only IMAP adapter, or one explicitly selected local EML.
Only PDF bytes enter the document-security queue. Other parts remain inventoried.
"""
import argparse
import email.policy
import hashlib
import json
import os
import sys
from email.parser import BytesParser
from pathlib import Path
from mail_attachment_pilot import safe_name, detected_mime, ACTIVE_EXTENSIONS, ARCHIVE_EXTENSIONS, ACTIVE_MIME_TYPES
from payment_invoice_fetch import read_bound_message

LIMIT = 20 * 1024 * 1024
MAX_PARTS = 12
sha = lambda b: hashlib.sha256(b).hexdigest()

def inspect_message(raw, request, work):
    import mail_fetcher
    if not 0 < len(raw) <= LIMIT:
        raise ValueError('mail_size_limit')
    msg = BytesParser(policy=email.policy.default).parsebytes(raw)
    old_limit = mail_fetcher.MAX_BODY_CHARS
    try:
        mail_fetcher.MAX_BODY_CHARS = 48000
        body, _, truncated = mail_fetcher._extract_body(msg)
    finally:
        mail_fetcher.MAX_BODY_CHARS = old_limit
    if truncated or sha(body.encode()) != request['body_sha256']:
        raise ValueError('mail_source_changed')
    subject = mail_fetcher._decode(msg.get('Subject', ''))
    sender = email.utils.parseaddr(msg.get('From', ''))[1].lower()
    if subject.strip() != request['subject'].strip() or sender != email.utils.parseaddr(request['sender'])[1].lower():
        raise ValueError('mail_header_changed')
    parts = []
    count = 0
    for index, part in enumerate((p for p in msg.walk() if not p.is_multipart()), 1):
        filename = safe_name(part.get_filename())
        disposition = part.get_content_disposition() or ''
        if not filename and disposition not in ('attachment', 'inline'):
            continue
        if len(parts) >= 100:
            raise ValueError('mime_part_limit')
        declared = part.get_content_type()
        payload = part.get_payload(decode=True)
        detected = detected_mime(payload or b'', declared)
        extension = Path(filename or '').suffix.lower()
        status = 'unsupported_type'
        blob = None
        if extension in ACTIVE_EXTENSIONS or declared in ACTIVE_MIME_TYPES:
            status = 'blocked_active_content'
        elif extension in ARCHIVE_EXTENSIONS:
            status = 'blocked_archive'
        elif detected == 'application/pdf':
            if not payload or not payload.startswith(b'%PDF-'):
                status = 'invalid_pdf'
            elif count >= MAX_PARTS or len(payload) > LIMIT:
                status = 'part_budget'
            else:
                status = 'quarantined'
                blob = sha(payload)
                target = work / blob
                if not target.exists():
                    with target.open('xb') as out:
                        os.fchmod(out.fileno(), 0o600)
                        out.write(payload)
                elif sha(target.read_bytes()) != blob:
                    raise ValueError('blob_hash_conflict')
                count += 1
        parts.append({'part': str(index), 'filename': filename, 'declared_mime': declared,
                      'detected_mime': detected, 'disposition': disposition,
                      'size': len(payload or b''), 'state': status, 'sha256': blob})
    return {'schema': 'folio/mail-attachment-acquisition/v1', 'body_sha256': request['body_sha256'],
            'raw_sha256': sha(raw), 'message_id': str(msg.get('Message-ID',''))[:1000],
            'mailbox_mutated': False, 'parts': parts}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True)
    parser.add_argument('--worker-root', required=True)
    parser.add_argument('--eml')
    args = parser.parse_args()
    from dotenv import load_dotenv
    load_dotenv(Path.home()/'.hermes/.env', override=False)
    os.environ['PATH'] = str(Path.home()/'.local/bin')+':'+os.environ.get('PATH','')
    sys.path.insert(0, str(Path(args.worker_root)/'scripts'))
    import production_worker
    request_path = Path(args.request)
    request = json.loads(request_path.read_text())
    if args.eml:
        path = Path(args.eml)
        if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= LIMIT:
            raise ValueError('unsafe_eml')
        raw = path.read_bytes()
        location = None
    else:
        raw, _, location = read_bound_message(request, production_worker)
    result = inspect_message(raw, request, request_path.parent)
    result['location'] = location
    output = request_path.parent/'attachments.json'
    output.write_text(json.dumps(result))
    output.chmod(0o600)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        allowed = {'bound_mail_unavailable','mail_source_changed','mail_header_changed','mail_size_limit','mime_part_limit','blob_hash_conflict','unsafe_eml'}
        print(str(error) if isinstance(error, ValueError) and str(error) in allowed else 'attachment_source_unavailable')
        sys.exit(2)
