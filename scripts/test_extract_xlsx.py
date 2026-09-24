"""Synthetic archive regression cases for the isolated values-only boundary."""
import json, subprocess, sys, tempfile, unittest, zipfile
from pathlib import Path
SCRIPT=Path(__file__).with_name('extract-secured-document.py')
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
class XlsxBoundary(unittest.TestCase):
    def run_case(self,cell='<c r="A1" t="inlineStr"><is><t>safe &amp; literal</t></is></c>',extra=None,formula_ok=True):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'synthetic.xlsx'
            files={'xl/workbook.xml':f'<workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Test" r:id="r1"/></sheets></workbook>',
                   'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
                   'xl/worksheets/sheet1.xml':f'<worksheet xmlns="{NS}"><sheetData><row r="1">{cell}</row></sheetData></worksheet>'}
            files.update(extra or {})
            with zipfile.ZipFile(f,'w') as z:
                for k,v in files.items():z.writestr(k,v)
            return subprocess.run([sys.executable,'-I',str(SCRIPT),'xlsx',str(f)],capture_output=True,timeout=10)
    def test_values_and_references(self):
        r=self.run_case();self.assertEqual(r.returncode,0,r.stderr)
        c=json.loads(r.stdout)['sheets'][0]['rows'][0]['cells'][0]
        self.assertEqual(c['value'],'safe & literal');self.assertEqual(c['ref'],'A1')
    def test_formula_never_evaluated(self):
        self.assertNotEqual(self.run_case('<c r="A1"><f>WEBSERVICE("https://example.invalid")</f><v>9</v></c>').returncode,0)
    def test_macro_and_embedded_parts(self):
        for n in ['xl/vbaProject.bin','xl/embeddings/object.bin','xl/externalLinks/link.xml','../escape']:
            with self.subTest(n=n):self.assertNotEqual(self.run_case(extra={n:'anything'}).returncode,0)
    def test_external_relationship(self):
        self.assertNotEqual(self.run_case(extra={'_rels/.rels':'<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>'}).returncode,0)
    def test_entity_rejected(self):
        for enc in ['utf-8','utf-16']:
            text='<?xml version="1.0"?><!DOCTYPE test [<!ENTITY a "anything">]><test>&a;</test>'
            self.assertNotEqual(self.run_case(extra={'xl/workbook.xml':text.encode(enc)}).returncode,0)
    def test_shared_negative_index(self):
        self.assertNotEqual(self.run_case('<c r="A1" t="s"><v>-1</v></c>',{'xl/sharedStrings.xml':f'<sst xmlns="{NS}"><si><t>wrong</t></si></sst>'}).returncode,0)
    def test_container_limits(self):
        self.assertNotEqual(self.run_case(extra={f'extra/{i}':'x' for i in range(500)}).returncode,0)
if __name__=='__main__':unittest.main()
