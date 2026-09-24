import hashlib
import tempfile
import types
import sys
import unittest
from pathlib import Path
from email.message import EmailMessage
from unittest.mock import patch
import mail_attachment_fetch as module

class AttachmentAcquisitionTest(unittest.TestCase):
    def setUp(self):
        self.mail=EmailMessage();self.mail['From']='sender@example.invalid';self.mail['Subject']='Document'
        self.mail.set_content('Bound source')
        self.request={'body_sha256':hashlib.sha256(b'Bound source').hexdigest(),'sender':'Sender <sender@example.invalid>','subject':'Document'}
        self.decoder=types.SimpleNamespace(MAX_BODY_CHARS=2000,_extract_body=lambda m:('Bound source',True,False),_decode=lambda s:s)
    def inspect(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(sys.modules,{'mail_fetcher':self.decoder}):
            result=module.inspect_message(self.mail.as_bytes(),self.request,Path(tmp))
            return result,[p.name for p in Path(tmp).iterdir()]
    def test_pdf_duplicates_keep_each_part_and_one_blob(self):
        for name in ['../../one.pdf','copy.pdf']:
            self.mail.add_attachment(b'%PDF-synthetic',maintype='application',subtype='pdf',filename=name)
        result,files=self.inspect()
        self.assertEqual(len(result['parts']),2);self.assertEqual(len(files),1)
        self.assertEqual(result['parts'][0]['filename'],'one.pdf')
        self.assertFalse(result['mailbox_mutated'])
    def test_active_name_cannot_disguise_pdf_bytes(self):
        self.mail.add_attachment(b'%PDF-synthetic',maintype='application',subtype='pdf',filename='open.js')
        result,files=self.inspect();self.assertEqual(files,[])
        self.assertEqual(result['parts'][0]['state'],'blocked_active_content')
    def test_fake_pdf_is_never_quarantined_for_parsing(self):
        self.mail.add_attachment(b'not a pdf',maintype='application',subtype='pdf',filename='invoice.pdf')
        result,files=self.inspect();self.assertEqual(files,[])
        self.assertEqual(result['parts'][0]['state'],'invalid_pdf')
    def test_body_or_header_change_blocks_binding(self):
        for key,value in [('body_sha256','0'*64),('sender','wrong@example.invalid'),('subject','Other')]:
            with self.subTest(key=key):
                old=self.request[key];self.request[key]=value
                with self.assertRaises(ValueError):self.inspect()
                self.request[key]=old
    def test_none_is_a_recorded_result_not_unknown(self):
        result,files=self.inspect();self.assertEqual(result['parts'],[]);self.assertEqual(files,[])
    def test_part_budget_is_visible_and_decoder_limit_restored(self):
        for n in range(13):self.mail.add_attachment(b'%PDF-synthetic',maintype='application',subtype='pdf',filename=f'{n}.pdf')
        result,_=self.inspect();self.assertEqual(result['parts'][-1]['state'],'part_budget')
        self.assertEqual(self.decoder.MAX_BODY_CHARS,2000)

if __name__=='__main__':unittest.main()
