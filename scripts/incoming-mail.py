#!/usr/bin/env python3
"""Bounded, read-only incremental adapter around the existing production importer.
Checkpoints advance only after feedback, full-text evidence and scoped handoff persist.
No mailbox mutations or outbound messages. History is explicitly owner-configured.
"""
import argparse, datetime, logging, sqlite3, sys, os, json, hashlib
from pathlib import Path

def search_inbox_uids(session, since_uid=0, skip_classified=False, date_since=None, unseen=False):
    terms=[]
    if since_uid:terms+=['UID',f'{since_uid+1}:*']
    if date_since:terms+=['SINCE',date_since]
    if unseen:terms+=['UNSEEN']
    status,data=session.conn.uid('SEARCH',None,' '.join(terms) or 'ALL')
    if status!='OK' or not data:raise RuntimeError('Inbox search failed')
    return [int(x) for x in (data[0] or b'').split()]

def select_incremental(session, conn, account, processed, batch, activated, initial=False, unread_first=False):
    _, epoch = session.select_folder('INBOX')
    row = conn.execute('SELECT uidvalidity,last_uid FROM mail_intake_cursors WHERE account=?',(account,)).fetchone()
    if row and row[0] != epoch:
        raise RuntimeError('UIDVALIDITY changed; account requires reconciliation')
    if epoch <= 0: raise RuntimeError('UIDVALIDITY unavailable; import blocked')
    floor = row[1] if row else max(processed, default=0)
    # Existing accounts start after their last imported UID, without draining old gaps.
    # With no local history, only the day of activation is eligible; never the archive.
    date_since = None if floor or initial else datetime.datetime.fromisoformat(activated).strftime('%d-%b-%Y')
    uids = session.search_uids(since_uid=floor, skip_classified=False, date_since=date_since)
    eligible = sorted(set(u for u in uids if u > floor))
    captured = {r[0] for r in conn.execute("SELECT uid FROM mail_intake_locations WHERE account=? AND folder='INBOX' AND epoch=?", (account,epoch))}
    pending = [u for u in eligible if u not in captured]
    unread = set(session.search_uids(since_uid=floor, skip_classified=False, date_since=date_since, unseen=True)) & set(eligible) if unread_first else set()
    target = sorted(pending, key=lambda u: (u not in unread, u))[:batch]
    if not row:
        conn.execute('INSERT INTO mail_intake_cursors VALUES (?,?,?)',(account,epoch,floor)); conn.commit()
    return target, epoch, eligible, unread

def advance_incremental_cursor(conn, account, eligible, captured):
    # Unread UIDs may arrive out of order. Cross only a fully persisted prefix,
    # never jump over a still-unimported read message. Locations survive retries.
    through = None
    for uid in eligible:
        if uid not in captured: break
        through = uid
    if through is not None:
        conn.execute('UPDATE mail_intake_cursors SET last_uid=MAX(last_uid,?) WHERE account=?',(through,account));conn.commit()

def export_entries(root):
    from mail_fetcher import _parse_envelope
    entries=[]; ids=set()
    for meta in Path(root).glob('*.metadata.json'):
        data=json.loads(meta.read_text())['Payload']
        eml=meta.with_name(meta.name.replace('.metadata.json','.eml'))
        if not eml.is_file(): raise RuntimeError('Export message missing')
        raw=eml.read_bytes()
        uid=int(hashlib.sha256(data['ID'].encode()).hexdigest()[:12],16)
        if uid in ids: raise RuntimeError('Export identity collision')
        ids.add(uid)
        entries.append((data['Time'],uid,raw))
    if not entries: raise RuntimeError('Empty export')
    if len(list(Path(root).glob('*.eml')))!=len(entries): raise RuntimeError('Export metadata missing')
    return [(uid,_parse_envelope(uid,[],raw),hashlib.sha256(raw).hexdigest()) for _,uid,raw in sorted(entries)]

def persist(env,epoch,args,conn,worker,processed,write_log):
    uid=env.uid
    from mail_history import schema,fingerprint,bind
    schema(conn)
    canonical=conn.execute('SELECT feedback_id FROM mail_intake_canonical WHERE account=? AND fingerprint=?',(args.account,fingerprint(env))).fetchone()
    if canonical:
        fid=canonical[0]
        write_log(args.run_uuid,'heuristik','classified',f'#{fid} matched',mail_id=fid)
        if not conn.execute("SELECT 1 FROM worker_run_logs WHERE run_uuid=? AND mail_id=? AND event_type='classified'",(args.run_uuid,fid)).fetchone():raise RuntimeError('Import handoff missing')
        bind(conn,args.account,'INBOX',epoch,uid,env,fid)
        return fid
    if uid not in processed:
        if worker.process_envelope(env,epoch,args)!='processed': raise RuntimeError('Import incomplete; checkpoint preserved')
    with sqlite3.connect(f'file:{worker.FEEDBACK_DB}?mode=ro',uri=True) as feedback:
        row=feedback.execute('SELECT id,body_hash FROM feedback WHERE account_id=? AND imap_uid=?',(args.account,uid)).fetchone()
    if not row: raise RuntimeError('Imported feedback missing')
    text=env.body_text or ''
    if row[1]!=hashlib.sha256(text[:5000].encode('utf-8')).hexdigest(): raise RuntimeError('Source identity changed')
    conn.execute('INSERT OR IGNORE INTO mail_intake_sources VALUES (?,?,?,?,?,?)',(row[0],args.account,uid,epoch,text[:48000],int(bool(env.body_truncated) or len(text)>48000)))
    conn.execute('INSERT OR IGNORE INTO mail_intake_source_capture VALUES (?,?)',(row[0],'decoded-body-v2'));conn.commit()
    write_log(args.run_uuid,'heuristik','classified',f'#{row[0]} imported',mail_id=row[0])
    if not conn.execute("SELECT 1 FROM worker_run_logs WHERE run_uuid=? AND mail_id=? AND event_type='classified'",(args.run_uuid,row[0])).fetchone(): raise RuntimeError('Import handoff missing')
    if args.account not in ['proton'] and not args.account.endswith('-history'):bind(conn,args.account,'INBOX',epoch,uid,env,row[0])
    return row[0]

def coverage(conn,account,total,remaining,scope,unread_remaining=None):
    value={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'total':total,'remaining':remaining,'scope':scope}
    if unread_remaining is not None:value['unread_remaining']=unread_remaining
    conn.execute('INSERT INTO mail_intake_coverage VALUES (?,?) ON CONFLICT(account) DO UPDATE SET value=excluded.value',(account,json.dumps(value)));conn.commit()

def history_batch_size(requested):
    if not 1 <= requested <= 30:raise ValueError('history batch outside supported range')
    return requested

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--worker-root',required=True);ap.add_argument('--folio-db',required=True)
    ap.add_argument('--history',action='store_true');ap.add_argument('--account',required=True);ap.add_argument('--run-uuid',required=True);ap.add_argument('--accounts-file')
    ap.add_argument('--batch',type=int,default=30);ap.add_argument('--activated',required=True)
    ap.add_argument('--unread-first',action='store_true')
    a=ap.parse_args();assert 1<=a.batch<=30
    registry=[]
    if a.accounts_file and Path(a.accounts_file).exists():
        raw=json.loads(Path(a.accounts_file).read_text())
        registry=raw if isinstance(raw,list) else raw.get('accounts',[]) if raw.get('schema')=='folio/mail-accounts/v1' else []
    match=[x for x in registry if x['id']==a.account]
    if len(match)!=1:raise RuntimeError('Unknown intake account')
    settings=match[0]
    sys.path.insert(0,str(Path(a.worker_root)/'scripts'));os.environ['LIFE_MAIL_MAX_BODY']='48000'
    import production_worker as worker
    from folio_log_writer import write_log
    args=argparse.Namespace(folio_db=a.folio_db,account=a.account,mode='silent',board=None,no_telegram=True,no_kanban=True,dry_run=False,imap_fixture=None,assignee='production_worker',run_uuid=a.run_uuid)
    with sqlite3.connect(a.folio_db,timeout=30) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS mail_intake_coverage(account TEXT PRIMARY KEY,value TEXT NOT NULL)')
        processed=worker.loaded_processed_uids(a.account)
        if a.history:
            history_file=Path(a.folio_db).parent/'mail-intake-history.json'
            if not history_file.exists() or a.account not in json.loads(history_file.read_text()):raise RuntimeError('History not authorized for account')
            if settings['kind']!='imap':raise RuntimeError('History requires IMAP source')
            from mail_history import reconcile
            with worker._open_imap_session(args) as session:
                count=reconcile(conn,session,args,worker,history_batch_size(a.batch),write_log,persist)
        elif settings['kind']=='proton-export':
            conn.execute('CREATE TABLE IF NOT EXISTS mail_intake_export_items(account TEXT,uid INTEGER,sha256 TEXT NOT NULL,PRIMARY KEY(account,uid))')
            entries=export_entries(settings['exportPath'])
            done=dict(conn.execute('SELECT uid,sha256 FROM mail_intake_export_items WHERE account=?',(a.account,)))
            for uid,env,digest in entries:
                if uid in done and done[uid]!=digest:raise RuntimeError('Export identity changed')
            pending=[x for x in entries if x[0] not in done]
            coverage(conn,a.account,len(entries),len(pending),'export')
            for uid,env,digest in pending[:a.batch]:
                persist(env,1,args,conn,worker,processed,write_log)
                conn.execute('INSERT INTO mail_intake_export_items VALUES (?,?,?)',(a.account,uid,digest));conn.commit()
            coverage(conn,a.account,len(entries),max(0,len(pending)-a.batch),'export')
            count=min(len(pending),a.batch)
        elif settings['kind']=='imap':
            with worker._open_imap_session(args) as session:
                def select_readonly(folder='INBOX'):
                    status,data=session.conn.select(folder,readonly=True)
                    if status!='OK':raise RuntimeError('Read-only inbox unavailable')
                    _,values=session.conn.response('UIDVALIDITY')
                    return int(data[0] or 0),int(values[0]) if values and values[0] else 0
                session.select_folder=select_readonly
                session.search_uids=lambda **kwargs:search_inbox_uids(session,**kwargs)
                from mail_history import schema
                schema(conn)
                target,epoch,eligible,unread=select_incremental(session,conn,a.account,processed,a.batch,a.activated,settings.get('initialInbox',False),a.unread_first)
                all_uids=set(session.search_uids(skip_classified=False))
                captured={r[0] for r in conn.execute("SELECT uid FROM mail_intake_locations WHERE account=? AND folder='INBOX' AND epoch=?",(a.account,epoch))}
                advance_incremental_cursor(conn,a.account,eligible,captured)
                coverage(conn,a.account,len(all_uids),len(all_uids-captured),'inbox',len(unread-captured) if a.unread_first else None)
                for uid in target:
                    envelopes=list(session.fetch_envelopes([uid]))
                    if len(envelopes)!=1:raise RuntimeError('Mail disappeared; cursor preserved')
                    persist(envelopes[0],epoch,args,conn,worker,processed,write_log)
                    captured.add(uid)
                    advance_incremental_cursor(conn,a.account,eligible,captured)
                coverage(conn,a.account,len(all_uids),len(all_uids-captured),'inbox',len(unread-captured) if a.unread_first else None);count=len(target)
        else:raise RuntimeError('Unknown source kind')
        print(f'DONE processed={count}',flush=True)
    return 0
if __name__=='__main__':
    logging.basicConfig(level=logging.WARNING)
    sys.exit(main())
