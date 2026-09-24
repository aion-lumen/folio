"""One bounded, explicitly selected own invoice, through the existing IMAP adapter.

No search, mark-read, move, deletion or sending. Output stays in the private job.
The caller supplies only server-resolved locations and requires an exact body hash.
"""
import argparse
import email.policy
import hashlib
import json
import os
import re
import sys
from email.parser import BytesParser
from pathlib import Path

def read_bound_message(request, worker):
    import mail_fetcher
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,40}', request['account']):
        raise ValueError('account')
    locations = request['locations']
    if not 1 <= len(locations) <= 20:
        raise ValueError('locations')
    with worker._open_imap_session(argparse.Namespace(account=request['account'], imap_fixture=None)) as session:
        for loc in locations:
            folder, epoch, uid = loc['folder'], loc['epoch'], loc['uid']
            if (not isinstance(folder,str) or len(folder)>300 or any(ord(x)<32 for x in folder)
                or not isinstance(epoch,int) or epoch<1 or not isinstance(uid,int) or uid<1):
                raise ValueError('location')
            status, _ = session.conn.select('"'+folder.replace('\\','\\\\').replace('"','\\"')+'"', readonly=True)
            _, epochs = session.conn.response('UIDVALIDITY')
            if status != 'OK' or not epochs or int(epochs[0]) != epoch:
                continue
            status, meta = session.conn.uid('FETCH', str(uid), '(RFC822.SIZE)')
            sizes = re.findall(rb'RFC822.SIZE (\d+)', b' '.join(x for x in meta if isinstance(x,bytes)))
            if status != 'OK' or len(sizes)!=1 or not 0<int(sizes[0])<=20*1024*1024:
                continue
            status, response = session.conn.uid('FETCH', str(uid), '(BODY.PEEK[])')
            messages = [x[1] for x in response if isinstance(x,tuple)]
            if status!='OK' or len(messages)!=1 or len(messages[0])>20*1024*1024:
                continue
            raw = messages[0]
            msg = BytesParser(policy=email.policy.default).parsebytes(raw)
            # Intake stores up to 48k characters; the decoder's 2k default
            # otherwise makes intact historical sources look like changed mail.
            previous_limit = mail_fetcher.MAX_BODY_CHARS
            try:
                mail_fetcher.MAX_BODY_CHARS = 48000
                body, _, truncated = mail_fetcher._extract_body(msg)
            finally:
                mail_fetcher.MAX_BODY_CHARS = previous_limit
            if truncated or hashlib.sha256(body.encode()).hexdigest()!=request['body_sha256']:
                continue
            return raw, msg, {'folder': folder, 'epoch': epoch, 'uid': uid}
    raise ValueError('bound_mail_unavailable')

def fetch(request, work, worker):
    raw, msg, _ = read_bound_message(request, worker)
    parts = [p.get_payload(decode=True) for p in msg.walk() if not p.is_multipart() and p.get_content_type()=='application/pdf']
    if not parts:
        raise ValueError('invoice_attachment_missing')
    if len(parts)!=1:
        raise ValueError('invoice_attachment_ambiguous')
    if not parts[0] or not parts[0].startswith(b'%PDF-') or len(parts[0])>20*1024*1024:
        raise ValueError('invoice_attachment_invalid')
    target = work/'invoice.pdf'
    with target.open('xb') as out:
        os.chmod(target,0o600)
        out.write(parts[0])
    proof = {'schema':'folio/payment-mail-fetch/v1','body_sha256':request['body_sha256'],
        'original_sha256':hashlib.sha256(parts[0]).hexdigest(), 'raw_sha256':hashlib.sha256(raw).hexdigest(),
        'message_id':str(msg.get('Message-ID',''))[:1000], 'mailbox_mutated':False}
    target=work/'source.json'
    target.write_text(json.dumps(proof));target.chmod(0o600)
    return

def main():
    p=argparse.ArgumentParser();p.add_argument('--request',required=True);p.add_argument('--worker-root',required=True)
    args=p.parse_args();path=Path(args.request);request=json.loads(path.read_text())
    from dotenv import load_dotenv
    load_dotenv(Path.home()/'.hermes/.env',override=False)
    os.environ['PATH']=str(Path.home()/'.local/bin')+':'+os.environ.get('PATH','')
    sys.path.insert(0,str(Path(args.worker_root)/'scripts'))
    import production_worker
    fetch(request,path.parent,production_worker)

if __name__=='__main__':
    try: main()
    except Exception as error:
        # IMAP exceptions can include server data; never relay those to chat/logs.
        allowed={'bound_mail_unavailable','invoice_attachment_missing','invoice_attachment_ambiguous','invoice_attachment_invalid'}
        print(str(error) if isinstance(error,ValueError) and str(error) in allowed else 'invoice_source_unavailable');sys.exit(2)
