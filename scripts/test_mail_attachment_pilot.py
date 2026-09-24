from __future__ import annotations

import argparse
from contextlib import closing
import importlib.util
import sqlite3
import tempfile
import unittest
from email.message import EmailMessage
from pathlib import Path


SCRIPT = Path(__file__).with_name('mail_attachment_pilot.py')
SPEC = importlib.util.spec_from_file_location('mail_attachment_pilot', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


SCHEMA = '''
CREATE TABLE mail_attachment_parts (
 source_key TEXT PRIMARY KEY,source_kind TEXT NOT NULL,account TEXT NOT NULL,folder TEXT NOT NULL,uidvalidity INTEGER NOT NULL,uid INTEGER NOT NULL,part_specifier TEXT NOT NULL,
 message_id TEXT,source_path_hash TEXT,declared_filename TEXT,declared_mime TEXT,detected_mime TEXT,disposition TEXT,transfer_encoding TEXT,declared_size INTEGER,decoded_size INTEGER,
 state TEXT NOT NULL,reason_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE mail_attachment_blobs (sha256 TEXT PRIMARY KEY,byte_size INTEGER NOT NULL,detected_mime TEXT NOT NULL,quarantine_path TEXT NOT NULL,security_status TEXT NOT NULL,policy_version TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE mail_attachment_sources (source_key TEXT NOT NULL REFERENCES mail_attachment_parts(source_key),sha256 TEXT NOT NULL REFERENCES mail_attachment_blobs(sha256),created_at TEXT NOT NULL,PRIMARY KEY(source_key,sha256));
'''


def write_mail(path: Path, message_id: str, filename: str, data: bytes, mime: tuple[str, str]) -> None:
    message = EmailMessage()
    message['From'] = 'sender@example.test'
    message['To'] = 'owner@example.test'
    message['Subject'] = 'Untrusted attachment fixture'
    message['Message-ID'] = message_id
    message.set_content('Fixture body')
    message.add_attachment(data, maintype=mime[0], subtype=mime[1], filename=filename)
    path.write_bytes(message.as_bytes())


class AttachmentPilotTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.eml = self.base / 'eml'
        self.state = self.base / 'state'
        self.db = self.base / 'folio.db'
        self.eml.mkdir()
        with closing(sqlite3.connect(self.db)) as connection:
            connection.executescript(SCHEMA)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def args(self) -> argparse.Namespace:
        return argparse.Namespace(eml_root=str(self.eml), folio_db=str(self.db), state_root=str(self.state), account='fixture', max_parts=20, max_part_bytes=1024 * 1024, max_total_bytes=4 * 1024 * 1024)

    def test_quarantines_safe_bytes_dedupes_sources_and_is_idempotent(self) -> None:
        payload = b'%PDF-1.7\nfixture'
        write_mail(self.eml / 'one.eml', '<one@example.test>', '../resume.pdf', payload, ('application', 'pdf'))
        write_mail(self.eml / 'two.eml', '<two@example.test>', 'resume-copy.pdf', payload, ('application', 'pdf'))
        first = MODULE.run(self.args())
        self.assertEqual(first['summary']['parts'], 2)
        self.assertEqual(first['summary']['quarantined'], 2)
        self.assertEqual(first['summary']['duplicate_blob'], 1)
        self.assertEqual((self.state.stat().st_mode & 0o777), 0o700)
        self.assertEqual(((self.state / 'quarantine').stat().st_mode & 0o777), 0o700)
        self.assertEqual(((self.state / 'reports').stat().st_mode & 0o777), 0o700)
        with closing(sqlite3.connect(self.db)) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM mail_attachment_blobs').fetchone()[0], 1)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM mail_attachment_sources').fetchone()[0], 2)
            self.assertEqual(connection.execute('SELECT declared_filename FROM mail_attachment_parts ORDER BY source_key').fetchall(), [('resume.pdf',), ('resume-copy.pdf',)])
        second = MODULE.run(self.args())
        self.assertEqual(second['summary']['new_blob_bytes'], 0)
        self.assertEqual(second['summary']['duplicate_blob'], 2)

    def test_blocks_active_and_archive_content_by_extension_or_mime(self) -> None:
        write_mail(self.eml / 'active.eml', '<active@example.test>', 'readme.txt', b'<html>payload</html>', ('text', 'html'))
        write_mail(self.eml / 'archive.eml', '<archive@example.test>', 'bundle.data', b'PK\x03\x04payload', ('application', 'octet-stream'))
        write_mail(self.eml / 'macro.eml', '<macro@example.test>', 'form.docm', b'active-office-fixture', ('application', 'octet-stream'))
        report = MODULE.run(self.args())
        self.assertEqual(report['summary']['blocked_active_content'], 2)
        self.assertEqual(report['summary']['blocked_archive'], 1)
        self.assertFalse(report['security']['final_placement'])

    def test_hard_part_limit_records_metadata_without_writing_more_blobs(self) -> None:
        for index in range(3):
            write_mail(self.eml / f'{index}.eml', f'<{index}@example.test>', f'{index}.pdf', f'%PDF-{index}'.encode(), ('application', 'pdf'))
        args = self.args()
        args.max_parts = 2
        report = MODULE.run(args)
        self.assertEqual(report['summary']['parts'], 3)
        self.assertEqual(report['summary']['quarantined'], 2)
        self.assertEqual(report['summary']['blocked_size'], 1)
        with closing(sqlite3.connect(self.db)) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM mail_attachment_blobs').fetchone()[0], 2)


if __name__ == '__main__':
    unittest.main()
