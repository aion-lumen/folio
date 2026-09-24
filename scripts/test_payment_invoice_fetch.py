import hashlib
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('payment_fetch',Path(__file__).with_name('payment_invoice_fetch.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Session:
    def __init__(self,raw,epoch=7,size=None):
        self.raw=raw;self.epoch=epoch;self.size=size or len(raw);self.calls=[];self.conn=self
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def select(self,folder,readonly):
        assert readonly is True
        self.calls.append(('select',folder,readonly));return 'OK',[]
    def response(self,field):
        assert field=='UIDVALIDITY';return 'OK',[str(self.epoch).encode()]
    def uid(self,verb,uid,fields):
        assert verb=='FETCH' and fields in ['(RFC822.SIZE)','(BODY.PEEK[])']
        self.calls.append((verb,uid,fields))
        return ('OK',[f'1 (RFC822.SIZE {self.size})'.encode()]) if fields=='(RFC822.SIZE)' else ('OK',[(b'1',self.raw)])

class FetchTest(unittest.TestCase):
    def setUp(self):
        msg=EmailMessage();msg['Subject']='Invoice';msg.set_content('Bound body')
        msg.add_attachment(b'%PDF-synthetic',maintype='application',subtype='pdf',filename='../../unsafe.pdf')
        self.session=Session(msg.as_bytes())
        self.request={'account':'own','body_sha256':hashlib.sha256(b'Bound body').hexdigest(),'locations':[{'folder':'INBOX','epoch':7,'uid':42}]}
    def run_fetch(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(sys.modules,{'mail_fetcher':types.SimpleNamespace(MAX_BODY_CHARS=2000,_extract_body=lambda m:('Bound body',True,False))}):
            path=Path(tmp)
            module.fetch(self.request,path,types.SimpleNamespace(_open_imap_session=lambda args:self.session))
            self.assertEqual((path/'invoice.pdf').read_bytes(),b'%PDF-synthetic')
            proof=json.loads((path/'source.json').read_text())
            self.assertFalse(proof['mailbox_mutated'])
            self.assertEqual(sorted(p.name for p in path.iterdir()),['invoice.pdf','source.json'])
    def test_reads_without_mutation_and_ignores_untrusted_filename(self):
        self.run_fetch();self.assertIn(('FETCH','42','(BODY.PEEK[])'),self.session.calls)
    def test_epoch_change_prevents_fetch(self):
        self.session.epoch=8
        with self.assertRaises(ValueError):self.run_fetch()
        self.assertFalse(any(c[0]=='FETCH' for c in self.session.calls))
    def test_large_source_never_downloaded(self):
        self.session.size=21*1024*1024
        with self.assertRaises(ValueError):self.run_fetch()
        self.assertFalse(any(c[-1]=='(BODY.PEEK[])' for c in self.session.calls))
    def test_changed_body_cannot_bind_invoice(self):
        self.request['body_sha256']='0'*64
        with self.assertRaises(ValueError):self.run_fetch()
    def test_control_characters_cannot_inject_imap_command(self):
        self.request['locations'][0]['folder']='INBOX\r\nSTORE 42 +FLAGS (\\Deleted)'
        with self.assertRaises(ValueError):self.run_fetch()
        self.assertEqual(self.session.calls,[])
    def test_full_intake_capture_is_used_without_relaxing_the_hash(self):
        body='Invoice notification '*200
        decoder=types.SimpleNamespace(MAX_BODY_CHARS=2000)
        decoder._extract_body=lambda message:(body[:decoder.MAX_BODY_CHARS],True,len(body)>decoder.MAX_BODY_CHARS)
        self.request['body_sha256']=hashlib.sha256(body.encode()).hexdigest()
        with tempfile.TemporaryDirectory() as tmp,patch.dict(sys.modules,{'mail_fetcher':decoder}):
            module.fetch(self.request,Path(tmp),types.SimpleNamespace(_open_imap_session=lambda args:self.session))
            self.assertTrue((Path(tmp)/'invoice.pdf').exists())
            self.assertEqual(decoder.MAX_BODY_CHARS,2000)

if __name__=='__main__':unittest.main()
