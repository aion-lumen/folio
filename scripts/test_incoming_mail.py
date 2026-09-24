import importlib.util, sqlite3, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('incoming_mail',Path(__file__).with_name('incoming-mail.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class Session:
    epoch=12
    uids=[9,10,11,12,13]
    unread={12}
    def select_folder(self,_):return 10,self.epoch
    def search_uids(self,**kw):self.kw=kw;return sorted(self.unread) if kw.get("unseen") else self.uids
def locations(db):
    db.execute("CREATE TABLE mail_intake_locations(account TEXT,folder TEXT,epoch INTEGER,uid INTEGER,feedback_id INTEGER,PRIMARY KEY(account,folder,epoch,uid))")

class IncrementalTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.execute('CREATE TABLE mail_intake_cursors(account TEXT PRIMARY KEY,uidvalidity INTEGER,last_uid INTEGER)');self.session=Session();locations(self.db)
    def test_new_only_oldest_first_and_no_star_range_duplicate(self):
        target,epoch,_,_=mod.select_incremental(self.session,self.db,'gmail',{1,10},2,'2026-09-06T00:00:00+00:00');self.assertEqual(target,[11,12]);self.assertEqual(epoch,12)
    def test_uidvalidity_change_blocks_without_advancing(self):
        self.db.execute("INSERT INTO mail_intake_cursors VALUES ('gmail',11,10)")
        with self.assertRaisesRegex(RuntimeError,'UIDVALIDITY'):mod.select_incremental(self.session,self.db,'gmail',{10},30,'2026-09-06T00:00:00+00:00')
        self.assertEqual(self.db.execute('SELECT last_uid FROM mail_intake_cursors').fetchone()[0],10)
    def test_no_history_is_date_bounded(self):
        mod.select_incremental(self.session,self.db,'gmail',set(),30,'2026-09-06T00:00:00+00:00');self.assertEqual(self.session.kw['date_since'],'06-Sep-2026')
    def test_unread_first_preserves_read_gaps_and_retries_without_duplicates(self):
        self.session.uids=[9,10,11,12,13,14];self.session.unread={10,12,14}
        target,epoch,eligible,unread=mod.select_incremental(self.session,self.db,'gmail',{10},2,'2026-09-06T00:00:00+00:00',unread_first=True)
        self.assertEqual(target,[12,14]);self.assertEqual(unread,{12,14})
        # Persist one item then crash: the higher unread UID cannot advance the floor.
        self.db.execute("INSERT INTO mail_intake_locations VALUES ('gmail','INBOX',12,12,112)")
        mod.advance_incremental_cursor(self.db,'gmail',eligible,{12})
        self.assertEqual(self.db.execute('SELECT last_uid FROM mail_intake_cursors').fetchone()[0],10)
        target,_,eligible,_=mod.select_incremental(self.session,self.db,'gmail',{10,12},1,'2026-09-06T00:00:00+00:00',unread_first=True)
        self.assertEqual(target,[14])
        self.db.execute("INSERT INTO mail_intake_locations VALUES ('gmail','INBOX',12,14,114)")
        mod.advance_incremental_cursor(self.db,'gmail',eligible,{12,14})
        target,_,eligible,_=mod.select_incremental(self.session,self.db,'gmail',{10,12,14},2,'2026-09-06T00:00:00+00:00',unread_first=True)
        self.assertEqual(target,[11,13])
        mod.advance_incremental_cursor(self.db,'gmail',eligible,{11,12,14})
        self.assertEqual(self.db.execute('SELECT last_uid FROM mail_intake_cursors').fetchone()[0],12)
        mod.advance_incremental_cursor(self.db,'gmail',eligible,{11,12,13,14})
        self.assertEqual(self.db.execute('SELECT last_uid FROM mail_intake_cursors').fetchone()[0],14)
        self.assertEqual(mod.select_incremental(self.session,self.db,'gmail',{10,12,14},10,'2026-09-06T00:00:00+00:00',unread_first=True)[0],[])
    def test_expunged_uid_gap_and_other_folder_do_not_block_or_hide_inbox(self):
        self.session.uids=[11,14];self.session.unread={14}
        self.db.execute("INSERT INTO mail_intake_locations VALUES ('gmail','Archive',12,11,111)")
        target,_,eligible,_=mod.select_incremental(self.session,self.db,'gmail',{10},2,'2026-09-06T00:00:00+00:00',unread_first=True)
        self.assertEqual(target,[14,11])
        mod.advance_incremental_cursor(self.db,'gmail',eligible,{11,14})
        self.assertEqual(self.db.execute('SELECT last_uid FROM mail_intake_cursors').fetchone()[0],14)
    def test_unread_priority_keeps_activation_date_and_existing_capture_scope(self):
        self.db.execute("INSERT INTO mail_intake_locations VALUES ('gmail','INBOX',12,12,112)")
        target,_,_,_=mod.select_incremental(self.session,self.db,'gmail',set(),30,'2026-09-06T00:00:00+00:00',unread_first=True)
        self.assertEqual(target,[9,10,11,13]);self.assertEqual(self.session.kw['date_since'],'06-Sep-2026')

    def test_unseen_search_retains_uid_and_date_scope_and_never_writes_flags(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        connection=Mock();connection.uid.return_value=('OK',[b'12 14'])
        self.assertEqual(mod.search_inbox_uids(SimpleNamespace(conn=connection),since_uid=10,date_since='06-Sep-2026',unseen=True),[12,14])
        connection.uid.assert_called_once_with('SEARCH',None,'UID 11:* SINCE 06-Sep-2026 UNSEEN')
        connection.uid.return_value=('NO',[b'not available'])
        with self.assertRaisesRegex(RuntimeError,'Inbox search failed'):mod.search_inbox_uids(SimpleNamespace(conn=connection),unseen=True)
    def test_history_batch_is_not_artificially_capped_at_five(self):
        self.assertEqual(mod.history_batch_size(10),10);self.assertEqual(mod.history_batch_size(20),20)
        with self.assertRaises(ValueError):mod.history_batch_size(31)

class ExportTests(unittest.TestCase):
    def test_stable_identity_and_missing_pair(self):
        import tempfile,json,sys,types
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules,{'mail_fetcher':types.SimpleNamespace(_parse_envelope=lambda uid,flags,raw:raw)}):
            root=Path(directory)
            def add(name,identity,time):
                (root/(name+'.eml')).write_bytes(b'Subject: Synthetic\r\n\r\nBody')
                (root/(name+'.metadata.json')).write_text(json.dumps({'Payload':{'ID':identity,'Time':time}}))
            add('first','identity-a',2)
            uid=mod.export_entries(root)[0][0]
            add('second','identity-b',1)
            self.assertEqual(mod.export_entries(root)[1][0],uid)
            (root/'first.eml').unlink()
            with self.assertRaisesRegex(RuntimeError,'message missing'):mod.export_entries(root)
    def test_initial_import_has_no_date_floor(self):
        db=sqlite3.connect(':memory:');db.execute('CREATE TABLE mail_intake_cursors(account TEXT PRIMARY KEY,uidvalidity INTEGER,last_uid INTEGER)')
        locations(db);session=Session();mod.select_incremental(session,db,'extra',set(),30,'2026-09-06',True)
        self.assertIsNone(session.kw['date_since'])

if __name__=='__main__':unittest.main()
