"""Read-only folder reconciliation. Canonical content and explicit IMAP locations.
Historical non-INBOX feedback uses a non-connectable account namespace so legacy
INBOX-only mail actions cannot act on another folder's coincident UID.
"""
import argparse,dataclasses,datetime,hashlib,json,re,sqlite3
from pathlib import Path

def schema(conn):
    conn.executescript('''CREATE TABLE IF NOT EXISTS mail_intake_locations (
      account TEXT, folder TEXT, epoch INTEGER, uid INTEGER, feedback_id INTEGER NOT NULL,
      PRIMARY KEY(account,folder,epoch,uid));
    CREATE TABLE IF NOT EXISTS mail_intake_canonical (
      account TEXT, fingerprint TEXT, feedback_id INTEGER NOT NULL, PRIMARY KEY(account,fingerprint));''')

def fingerprint(env):
    # Message-ID alone is not sufficient: broken senders can reuse it.
    return hashlib.sha256(json.dumps([env.message_id,env.from_addr,env.subject,env.date,env.body_text],ensure_ascii=False).encode()).hexdigest()

def bind(conn,account,folder,epoch,uid,env,fid):
    schema(conn)
    conn.execute('INSERT OR IGNORE INTO mail_intake_locations VALUES (?,?,?,?,?)',(account,folder,epoch,uid,fid))
    conn.execute('INSERT OR IGNORE INTO mail_intake_canonical VALUES (?,?,?)',(account,fingerprint(env),fid));conn.commit()

def repair_incomplete_capture(conn,fid,account,uid,epoch,env):
    existing=conn.execute('SELECT truncated FROM mail_intake_sources WHERE feedback_id=?',(fid,)).fetchone()
    complete=not env.body_truncated and len(env.body_text)<=48000
    if complete and (existing is None or existing[0]):
        conn.execute('''INSERT INTO mail_intake_sources(feedback_id,account,uid,uidvalidity,body,truncated)
          VALUES (?,?,?,?,?,0) ON CONFLICT(feedback_id) DO UPDATE SET
          account=excluded.account,uid=excluded.uid,uidvalidity=excluded.uidvalidity,
          body=excluded.body,truncated=0''',(fid,account,uid,epoch,env.body_text))
        conn.execute('INSERT OR REPLACE INTO mail_intake_source_capture VALUES (?,?)',(fid,'decoded-body-v2'))
        conn.commit()
        return True
    return False

def folders(session):
    status,rows=session.conn.list()
    if status!='OK':raise RuntimeError('Folder inventory failed')
    result=[]
    for raw in rows:
        match=re.match(rb'^\((.*?)\) (?:"[^"]*"|NIL) (.*)$',raw)
        if not match:raise RuntimeError('Unsupported folder listing')
        flags=match[1].decode().lower();quoted=match[2].decode()
        if '\\noselect' in flags:continue
        name=quoted[1:-1].replace('\\"','"').replace('\\\\','\\') if quoted.startswith('"') else quoted
        result.append((name,quoted,flags))
    if any('\\all' in flags for _,_,flags in result):
        # Gmail All Mail includes archived/sent mail; labels are not extra copies.
        result=[x for x in result if x[0].upper()=='INBOX' or any(flag in x[2] for flag in ['\\all','\\junk','\\trash','\\drafts'])]
    return sorted(result,key=lambda x:(x[0].upper()!='INBOX',x[0]))

def prioritize_inventory(inventory, priorities):
    for folder in inventory:
        priority=priorities.get(folder['folder'],{})
        ids=set(priority.get('uids',[])) if priority.get('epoch')==folder['epoch'] else set()
        folder['priority_count']=sum(uid in ids for uid in folder['pending'])
        folder['pending'].sort(key=lambda uid:(uid not in ids,-uid))
    # A bounded targeted run must reach priority UIDs in non-INBOX folders before
    # spending its handled/queued budget on unrelated earlier folders.
    inventory.sort(key=lambda folder:(folder['priority_count']==0,-folder['priority_count'],folder['folder'].upper()!='INBOX',folder['folder']))

def prioritized_work(inventory):
    targeted=any(folder.get('priority_count',0) for folder in inventory)
    return [(folder,list(folder['pending'][:folder['priority_count']] if targeted else folder['pending'])) for folder in inventory if (folder['priority_count'] if targeted else folder['pending'])]

def reconcile(conn,session,args,worker,batch,write_log,persist):
    schema(conn);account=args.account;inventory=[]
    completed=set()
    for (value,) in conn.execute('SELECT value FROM mail_intake_runs'):
        run=json.loads(value)
        completed.update(i['id'] for i in run['items'] if i['stage']=='done' and i.get('outcome')!='source_incomplete')
    for name,quoted,flags in folders(session):
        status,data=session.conn.select(quoted,readonly=True)
        if status!='OK':raise RuntimeError('Read-only folder unavailable')
        _,values=session.conn.response('UIDVALIDITY');epoch=int(values[0]) if values and values[0] else 0
        if epoch<=0:raise RuntimeError('Folder epoch missing')
        status,data=session.conn.uid('SEARCH',None,'ALL')
        if status!='OK' or not data:raise RuntimeError('Folder search failed')
        uids={int(x) for x in (data[0] or b'').split()}
        known={r[0] for r in conn.execute('SELECT uid FROM mail_intake_locations WHERE account=? AND folder=? AND epoch=?',(account,name,epoch))}
        inventory.append({'folder':name,'quoted':quoted,'flags':flags,'epoch':epoch,'total':len(uids),'pending':sorted(uids-known,reverse=True)})
    total=sum(x['total'] for x in inventory);remaining=sum(len(x['pending']) for x in inventory)
    def snapshot():
        value={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'total':total,'remaining':remaining,'scope':'folders','folders':[{'name':x['folder'],'total':x['total'],'remaining':len(x['pending'])} for x in inventory]}
        conn.execute('INSERT INTO mail_intake_coverage VALUES (?,?) ON CONFLICT(account) DO UPDATE SET value=excluded.value',(account+'::history',json.dumps(value)));conn.commit()
    if getattr(args,'folio_db',None):
        path=Path(args.folio_db).parent/'mail-intake-priorities.json'
        priorities=json.loads(path.read_text()).get(account,{}) if path.exists() else {}
        prioritize_inventory(inventory,priorities)
    snapshot();handled=0;queued=0
    for folder,targets in prioritized_work(inventory):
        status,_=session.conn.select(folder['quoted'],readonly=True)
        _,values=session.conn.response('UIDVALIDITY')
        if status!='OK' or not values or int(values[0])!=folder['epoch']:raise RuntimeError('Folder changed during fetch')
        for uid in targets:
            envs=list(session.fetch_envelopes([uid]))
            if len(envs)!=1:raise RuntimeError('Message disappeared during history fetch')
            env=envs[0];fp=fingerprint(env)
            found=conn.execute('SELECT feedback_id FROM mail_intake_canonical WHERE account=? AND fingerprint=?',(account,fp)).fetchone()
            fid=found[0] if found else None
            if fid is not None:
                repair_incomplete_capture(conn,fid,account,uid,folder['epoch'],env)
            separate_empty=False
            if fid is None and folder['folder'].upper()=='INBOX':
                # Existing inbox IDs are reused only with matching content evidence.
                with sqlite3.connect(f'file:{worker.FEEDBACK_DB}?mode=ro',uri=True) as feedback:
                    old=feedback.execute('SELECT id,subject,sender,body_excerpt FROM feedback WHERE account_id=? AND imap_uid=?',(account,uid)).fetchone()
                if old:
                    prefix=(old[3] or '').replace('\\r\\n','\r\n')
                    fid=old[0]
                    bound=conn.execute('SELECT account,uid,uidvalidity FROM mail_intake_sources WHERE feedback_id=?',(fid,)).fetchone()
                    # An old empty excerpt without an epoch binding cannot prove identity.
                    # Capture the live message separately instead of overwriting that old row.
                    separate_empty=not prefix and not env.body_text and bound is None and old[1]==env.subject and env.from_addr.lower() in (old[2] or '').lower()
                    if separate_empty:
                        fid=None
                    else:
                        empty_verified=not prefix and not env.body_text and bound==(account,uid,folder['epoch'])
                        if old[1]!=env.subject or env.from_addr.lower() not in (old[2] or '').lower() or (not prefix and not empty_verified) or not env.body_text.startswith(prefix):
                            raise RuntimeError('Legacy source requires identity reconciliation')
                        if bound and bound!=(account,uid,folder['epoch']):raise RuntimeError('Legacy source epoch differs')
                        conn.execute('INSERT INTO mail_intake_sources VALUES (?,?,?,?,?,?) ON CONFLICT(feedback_id) DO UPDATE SET body=excluded.body,truncated=excluded.truncated',(fid,account,uid,folder['epoch'],env.body_text[:48000],int(env.body_truncated or len(env.body_text)>48000)))
                        conn.execute('INSERT OR REPLACE INTO mail_intake_source_capture VALUES (?,?)',(fid,'decoded-body-v2'));conn.commit()
            if fid is None:
                # A stable namespace prevents collisions with real inbox UIDs.
                source_args=argparse.Namespace(**vars(args))
                if folder['folder'].upper()=='INBOX' and not separate_empty:
                    copy=env;capture_epoch=folder['epoch']
                else:
                    synthetic=int(hashlib.sha256((account+fp).encode()).hexdigest()[:12],16)
                    source_args.account=account+'-history';copy=dataclasses.replace(env,uid=synthetic);capture_epoch=1
                fid=persist(copy,capture_epoch,source_args,conn,worker,worker.loaded_processed_uids(source_args.account),write_log)
                queued+=1
            elif fid not in completed:
                write_log(args.run_uuid,'heuristik','classified',f'#{fid} reconciled',mail_id=fid)
                queued+=1
            if fid not in completed and not conn.execute("SELECT 1 FROM worker_run_logs WHERE run_uuid=? AND mail_id=? AND event_type='classified'",(args.run_uuid,fid)).fetchone():raise RuntimeError('History handoff missing')
            bind(conn,account,folder['folder'],folder['epoch'],uid,env,fid)
            handled+=1;remaining-=1;folder['pending'].remove(uid);snapshot()
            if queued>=batch or handled>=max(batch,100):return queued
    return queued
