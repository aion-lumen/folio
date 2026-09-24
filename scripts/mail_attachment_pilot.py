#!/usr/bin/env python3
from __future__ import annotations
import argparse, email.policy, hashlib, json, os, shutil, sqlite3, tempfile, uuid
from datetime import datetime, timezone
from email.parser import BytesParser
from pathlib import Path

POLICY = "mail-attachment-quarantine-v1"
ACTIVE_EXTENSIONS = {'.app','.bat','.cmd','.com','.dmg','.exe','.html','.htm','.iso','.jar','.js','.jse','.lnk','.msi','.pkg','.ps1','.scr','.svg','.vbs','.wsf','.docm','.dotm','.xlsm','.xltm','.pptm','.potm'}
ARCHIVE_EXTENSIONS = {'.7z','.bz2','.gz','.rar','.tar','.tgz','.xz','.zip'}
ACTIVE_MIME_TYPES = {'text/html','image/svg+xml','application/javascript','text/javascript','application/x-msdownload','application/x-msdos-program','application/java-archive'}
ARCHIVE_MIME_TYPES = {'application/zip','application/x-7z-compressed','application/vnd.rar','application/gzip','application/x-tar'}

def digest(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def safe_name(value: str | None) -> str | None:
    if not value: return None
    value = Path(value.replace('\\','/')).name.replace('\x00','').strip()
    value = ''.join('_' if ord(c)<32 or c in '/\\:' else c for c in value)[:180]
    return value or None
def detected_mime(data: bytes, declared: str) -> str:
    signatures=((b'%PDF-','application/pdf'),(b'PK\x03\x04','application/zip'),(b'\x89PNG\r\n\x1a\n','image/png'),(b'\xff\xd8\xff','image/jpeg'),(b'GIF8','image/gif'),(b'Rar!','application/vnd.rar'))
    for prefix,mime in signatures:
        if data.startswith(prefix): return mime
    return declared or 'application/octet-stream'
def private_dir(path: Path) -> None:
    path.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(path,0o700)
def file_catalog_hashes() -> set[str]:
    path=Path.home()/'.folio/file-intake/ledger.json'
    if not path.exists(): return set()
    try:
        rows=json.loads(path.read_text()).get('items',[])
        return {r['sha256'] for r in rows if isinstance(r,dict) and isinstance(r.get('sha256'),str)}
    except Exception: return set()
def write_blob(root: Path, sha: str, data: bytes) -> Path:
    quarantine=root/'quarantine';private_dir(quarantine)
    target=quarantine/sha[:2]/sha
    private_dir(target.parent)
    if target.exists():
        if target.stat().st_size!=len(data) or digest(target.read_bytes())!=sha: raise RuntimeError('quarantine_hash_conflict')
        return target
    fd,tmp=tempfile.mkstemp(prefix='.part-',dir=target.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'wb') as out:
            out.write(data);out.flush();os.fsync(out.fileno())
        os.replace(tmp,target)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    return target
def atomic_json(path: Path, value: object) -> None:
    private_dir(path.parent)
    fd,tmp=tempfile.mkstemp(prefix='.report-',dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as out:
            json.dump(value,out,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def run(args: argparse.Namespace) -> dict:
    root=Path(args.eml_root).resolve(strict=True);state=Path(args.state_root).resolve()
    if not root.is_dir() or root.is_symlink(): raise RuntimeError('unsafe_eml_root')
    if args.max_parts<1 or args.max_parts>500 or args.max_part_bytes<1 or args.max_total_bytes<1: raise RuntimeError('invalid_limits')
    private_dir(state)
    if shutil.disk_usage(state.parent if state.parent.exists() else Path.home()).free < 2*1024**3: raise RuntimeError('insufficient_free_space')
    conn=sqlite3.connect(args.folio_db);conn.execute('PRAGMA foreign_keys=ON')
    now=datetime.now(timezone.utc).isoformat();catalog=file_catalog_hashes();total=0;parts=0;emls=0
    counts={'inventoried':0,'quarantined':0,'blocked_active_content':0,'blocked_archive':0,'blocked_size':0,'decode_failed':0,'duplicate_blob':0,'catalog_duplicate':0}
    blob_hashes=[]
    try:
      for path in sorted(root.rglob('*.eml')):
        if path.is_symlink() or not path.is_file(): continue
        emls+=1;raw=path.read_bytes();msg=BytesParser(policy=email.policy.default).parsebytes(raw)
        source_path_hash=digest(str(path.relative_to(root)).encode());message_id=str(msg.get('Message-ID',''))[:1000] or None
        walk=[p for p in msg.walk() if not p.is_multipart()]
        for index,part in enumerate(walk,1):
            filename=safe_name(part.get_filename());disposition=part.get_content_disposition() or ''
            if not filename and disposition not in ('attachment','inline'): continue
            parts+=1;part_id=str(index);source_key=f"eml:{args.account}:{source_path_hash}:{part_id}"
            declared=part.get_content_type();encoding=str(part.get('Content-Transfer-Encoding',''))[:100]
            try: payload=part.get_payload(decode=True)
            except Exception: payload=None
            state_name='inventoried';reason=None;decoded_size=None;found=None;sha_link=None
            if payload is None: state_name='decode_failed';reason='mime_decode_failed';counts[state_name]+=1
            else:
                decoded_size=len(payload);found=detected_mime(payload,declared);ext=Path(filename or '').suffix.lower()
                if decoded_size>args.max_part_bytes or total+decoded_size>args.max_total_bytes or parts>args.max_parts:
                    state_name='blocked_size';reason='pilot_budget_or_part_limit';counts[state_name]+=1
                else:
                    sha=digest(payload);already=conn.execute('SELECT 1 FROM mail_attachment_blobs WHERE sha256=?',(sha,)).fetchone() is not None
                    target=write_blob(state,sha,payload);total+=0 if already else decoded_size
                    if already: counts['duplicate_blob']+=1
                    if sha in catalog: counts['catalog_duplicate']+=1
                    state_name='blocked_active_content' if ext in ACTIVE_EXTENSIONS or declared in ACTIVE_MIME_TYPES or found in ACTIVE_MIME_TYPES else 'blocked_archive' if ext in ARCHIVE_EXTENSIONS or declared in ARCHIVE_MIME_TYPES or found in ARCHIVE_MIME_TYPES else 'quarantined'
                    reason='active_content_not_scanned' if ext in ACTIVE_EXTENSIONS else 'archive_not_expanded_or_scanned' if ext in ARCHIVE_EXTENSIONS else 'awaiting_security_adapter'
                    counts[state_name]+=1;blob_hashes.append(sha)
                    conn.execute('INSERT OR IGNORE INTO mail_attachment_blobs VALUES (?,?,?,?,?,?,?)',(sha,decoded_size,found,str(target),'not_scanned',POLICY,now));sha_link=sha
            counts['inventoried']+=1
            conn.execute('''INSERT INTO mail_attachment_parts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(source_key) DO UPDATE SET detected_mime=excluded.detected_mime,decoded_size=excluded.decoded_size,state=excluded.state,reason_code=excluded.reason_code,updated_at=excluded.updated_at''',
              (source_key,'eml',args.account,'local-export',0,0,part_id,message_id,source_path_hash,filename,declared,found,disposition,encoding,len(str(part.get_payload() or '')),decoded_size,state_name,reason,now,now))
            if sha_link: conn.execute('INSERT OR IGNORE INTO mail_attachment_sources VALUES (?,?,?)',(source_key,sha_link,now))
      conn.commit()
    finally: conn.close()
    report={'schema':'folio/mail-attachment-pilot/v1','report_id':str(uuid.uuid4()),'created_at':now,'mode':'local_eml_quarantine','policy_version':POLICY,'limits':{'max_parts':args.max_parts,'max_part_bytes':args.max_part_bytes,'max_total_bytes':args.max_total_bytes,'minimum_free_bytes':2*1024**3},'summary':{'eml_files':emls,'parts':parts,'new_blob_bytes':total,**counts},'blob_hashes':sorted(set(blob_hashes)),'security':{'malware_scanner':'not_available','final_placement':False,'automatic_open':False},'source_root_hash':digest(str(root).encode())}
    report_path=state/'reports'/f"attachment-pilot-{report['report_id']}.json";atomic_json(report_path,report);report['path']=str(report_path)
    return report
def main():
    p=argparse.ArgumentParser();p.add_argument('--eml-root',required=True);p.add_argument('--folio-db',required=True);p.add_argument('--state-root',required=True);p.add_argument('--account',required=True);p.add_argument('--max-parts',type=int,required=True);p.add_argument('--max-part-bytes',type=int,required=True);p.add_argument('--max-total-bytes',type=int,required=True)
    print(json.dumps(run(p.parse_args()),indent=2))
if __name__=='__main__': main()
