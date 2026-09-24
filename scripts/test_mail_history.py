import unittest,sqlite3,sys,types,dataclasses
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mail_history import fingerprint,bind,folders,schema
@dataclasses.dataclass
class Envelope:
    message_id:str='same-id';from_addr:str='sender@example.com';subject:str='Synthetic';date:str='2026-09-06';body_text:str='Body';body_truncated:bool=False
class HistoryIdentityTests(unittest.TestCase):
    def test_reused_message_id_with_different_content_stays_distinct(self):
        self.assertNotEqual(fingerprint(Envelope()),fingerprint(Envelope(body_text='Other')))
    def test_same_uid_in_different_folders_does_not_collide(self):
        with sqlite3.connect(':memory:') as c:
            bind(c,'account','INBOX',1,42,Envelope(),10)
            bind(c,'account','Sent',1,42,Envelope(body_text='Other'),11)
            self.assertEqual(c.execute('SELECT count(*) FROM mail_intake_locations').fetchone()[0],2)
            bind(c,'account','Archive',2,88,Envelope(),10)
            self.assertEqual(c.execute('SELECT count(*) FROM mail_intake_canonical').fetchone()[0],2)
    def test_gmail_labels_not_counted_as_additional_mailboxes(self):
        rows=[b'(\\HasNoChildren) "/" "INBOX"',b'(\\All) "/" "All Mail"',b'(\\HasNoChildren) "/" "Work"',b'(\\Junk) "/" "Spam"']
        result=folders(types.SimpleNamespace(conn=types.SimpleNamespace(list=lambda:('OK',rows))))
        self.assertEqual({r[0] for r in result},{'INBOX','All Mail','Spam'})
    def test_listing_failure_not_reported_as_empty(self):
        with self.assertRaises(RuntimeError):folders(types.SimpleNamespace(conn=types.SimpleNamespace(list=lambda:('NO',[]))))

class ReconcileTests(unittest.TestCase):
    def test_folder_copies_reuse_one_feedback_and_replay_does_no_work(self):
        self.check_reconcile(False)
    def test_unbound_empty_legacy_is_preserved_and_captured_separately(self):
        self.check_reconcile(True)
    def check_reconcile(self,empty_legacy):
        import tempfile,argparse
        from mail_history import reconcile
        with tempfile.TemporaryDirectory() as d,sqlite3.connect(':memory:') as c:
            feedback=Path(d)/'feedback.db'
            with sqlite3.connect(feedback) as f:
                f.execute('CREATE TABLE feedback(id,subject,sender,body_excerpt,account_id,imap_uid)')
                if empty_legacy:f.execute("INSERT INTO feedback VALUES (99,'Synthetic','sender@example.com','','synthetic',1)")
            c.executescript('CREATE TABLE mail_intake_sources(feedback_id INTEGER PRIMARY KEY,account,uid,uidvalidity,body,truncated);CREATE TABLE mail_intake_source_capture(feedback_id INTEGER PRIMARY KEY,capture_version);CREATE TABLE mail_intake_runs(value TEXT);CREATE TABLE mail_intake_coverage(account TEXT PRIMARY KEY,value TEXT);CREATE TABLE worker_run_logs(run_uuid,mail_id,event_type);')
            @dataclasses.dataclass
            class Mail(Envelope):uid:int=1
            class Server:
                selected=''
                def list(self):return 'OK',[b'(\\HasNoChildren) "/" "INBOX"',b'(\\HasNoChildren) "/" "Archive"',b'(\\HasNoChildren) "/" "Sent"']
                def select(self,name,readonly=False):
                    assert readonly;self.selected=name.strip('"');return 'OK',[b'1']
                def response(self,key):return key,[b'7']
                def uid(self,*args):return 'OK',[b'1']
            server=Server();session=types.SimpleNamespace(conn=server,fetch_envelopes=lambda ids:iter([Mail(body_text='Other' if server.selected=='Sent' else ('' if empty_legacy else 'Body'))]))
            worker=types.SimpleNamespace(FEEDBACK_DB=feedback,loaded_processed_uids=lambda account:set())
            calls=[]
            def log(run,voice,event,text,mail_id):c.execute('INSERT INTO worker_run_logs VALUES (?,?,?)',(run,mail_id,event));c.commit()
            def persist(env,epoch,args,*rest):
                calls.append(env);
                if empty_legacy:assert args.account=='synthetic-history'
                fid=len(calls);log(args.run_uuid,'','classified','',fid);return fid
            args=argparse.Namespace(account='synthetic',run_uuid='run')
            self.assertEqual(reconcile(c,session,args,worker,5,log,persist),3) # duplicate is also in the same pending review scope
            self.assertEqual(len(calls),2)
            if empty_legacy:
                with sqlite3.connect(feedback) as f:self.assertEqual(f.execute('SELECT id,body_excerpt FROM feedback').fetchall(),[(99,'')])
            self.assertEqual(c.execute('SELECT count(*) FROM mail_intake_locations').fetchone()[0],3)
            self.assertEqual(reconcile(c,session,args,worker,5,log,persist),0)
            self.assertEqual(len(calls),2)

if __name__=='__main__':unittest.main()
