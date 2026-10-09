#!/usr/bin/env python3
"""Export only a verified retired snapshot using age; no repository key leaves the node."""
import base64,hashlib,json,os,re,shutil,subprocess
from pathlib import Path
from hosting_adapter import instance_adapter


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()


def snapshot(config,directory,proof):
    if directory.is_symlink():raise ValueError('Symlink instance')
    execution=json.loads((directory/'execution.json').read_text())
    if execution.get('phase')!='retained':raise ValueError('Retained instance required')
    instance_adapter(config,directory,verify=True)
    local=json.loads((directory/'exit-status.json').read_text())
    if local!=proof:raise ValueError('Snapshot evidence mismatch')
    backup=Path(config['backupRoot'])/proof['backupId']
    if not re.fullmatch(re.escape(directory.name)+r'-exit-[a-f0-9-]{36}',proof['backupId']) or backup.is_symlink():raise ValueError('Snapshot ownership mismatch')
    if digest(backup/'SHA256SUMS')!=proof['manifestSha256']:raise ValueError('Snapshot manifest mismatch')
    files=[]
    for line in (backup/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1)
        p=backup/name
        if not re.fullmatch('[a-f0-9]{64}',sha) or Path(name).is_absolute() or '..' in Path(name).parts or any(x.is_symlink() for x in [p,*p.parents]) or not p.is_file():raise ValueError('Invalid snapshot entry')
        if digest(p)!=sha:raise ValueError('Snapshot checksum mismatch')
        files.append(name)
    return backup,files+['SHA256SUMS']


def delivery_payload(backup,files,target):
    if target.is_symlink():raise ValueError('Symlink delivery payload')
    if target.exists():shutil.rmtree(target)
    target.mkdir(mode=0o700)
    environment=[]
    for line in (backup/'.env').read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):continue
        match=re.fullmatch(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)',line)
        if not match:raise ValueError('Multiline or unsupported environment format')
        key,value=match.groups()
        if value.rstrip().endswith('\\'):raise ValueError('Continued environment value refused')
        if value.startswith(('"',"'")):
            quote=value[0];escaped=False;closed=False
            for char in value[1:]:
                if escaped:escaped=False;continue
                if char=='\\':escaped=True;continue
                if char==quote:closed=True;break
            if not closed:raise ValueError('Multiline environment value refused')
        if key.upper().startswith(('ACR_','REGISTRY_','FD_STACK_')):continue
        environment.append(line)
    path=target/'.env'
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:f.write('\n'.join(environment)+'\n')
    for name in files:
        if name in ('.env','SHA256SUMS'):continue
        destination=target/name;destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        try:os.link(backup/name,destination)
        except OSError:shutil.copyfile(backup/name,destination);os.chmod(destination,0o600)
    names=[name for name in files if name!='SHA256SUMS']
    checksums=''.join(digest(target/name)+'  '+name+'\n' for name in sorted(names))
    with os.fdopen(os.open(target/'SHA256SUMS',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:f.write(checksums)
    return target


def execute(config,directory,operation,api):
    route='operations/'+operation['id']+'/data'
    remote=api(route)
    if remote['handover']['state']=='ready':
        stale=directory/'handover'/operation['id']
        if stale.exists() and not stale.is_symlink():shutil.rmtree(stale)
        return
    backup,files=snapshot(config,directory,remote['exitEvidence'])
    transfer=directory/'handover'/operation['id'];transfer.mkdir(parents=True,exist_ok=True,mode=0o700)
    if transfer.is_symlink():raise ValueError('Symlink transfer refused')
    identity=transfer/'identity.txt';encrypted=transfer/'data.tar.age';receipt=transfer/'receipt.json'
    maximum=remote['maxBytes']
    if not receipt.exists():
        estimate=sum((backup/f).stat().st_size+1024 for f in files)+65536
        if estimate>maximum or shutil.disk_usage(transfer).free<2*estimate+256*1024*1024:raise ValueError('Transfer size or disk budget exceeded')
        payload=delivery_payload(backup,files,transfer/'export-config')
        if not identity.exists():subprocess.run([config['ageKeygenBinary'],'-o',str(identity)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        os.chmod(identity,0o600)
        recipient=subprocess.check_output([config['ageKeygenBinary'],'-y',str(identity)],text=True).strip()
        temp=encrypted.with_suffix('.tmp')
        with os.fdopen(os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600),'wb') as out:
            tar=subprocess.Popen(['tar','-C',str(payload),'-cf','-','--',*files],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            try:
                subprocess.run([config['ageBinary'],'-r',recipient],stdin=tar.stdout,stdout=out,stderr=subprocess.DEVNULL,check=True,timeout=1800)
                tar.stdout.close()
                if tar.wait(timeout=30):raise ValueError('Archive creation failed')
            finally:
                if tar.poll() is None:tar.kill();tar.wait()
        os.replace(temp,encrypted)
        if encrypted.stat().st_size>maximum:raise ValueError('Encrypted transfer too large')
        value={'size':encrypted.stat().st_size,'sha256':digest(encrypted),'identity':next(l.strip() for l in identity.read_text().splitlines() if l.startswith('AGE-SECRET-KEY-'))}
        with os.fdopen(os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump(value,f)
    value=json.loads(receipt.read_text())
    if digest(encrypted)!=value['sha256']:raise ValueError('Local transfer was modified')
    state=api(route,{'kind':'begin',**value})
    with encrypted.open('rb') as f:
        offset=state['received'];f.seek(offset)
        while True:
            chunk=f.read(1048576)
            if not chunk:break
            state=api(route,{'kind':'chunk','offset':offset,'data':base64.b64encode(chunk).decode()});offset=state['received']
    api(route,{'kind':'finish'})
    # Remove the independent delivery key and ciphertext only after server verification.
    shutil.rmtree(transfer)


def cleanup_transfers(workspace):
    """Only disposable export workspaces expire; retained cold snapshots are never touched."""
    import time,uuid
    for directory in workspace.glob('*/handover/*'):
        try:
            uuid.UUID(directory.name);uuid.UUID(directory.parent.parent.name)
            if directory.is_symlink() or directory.parent.is_symlink() or directory.parent.parent.is_symlink():continue
            if not directory.is_dir() or directory.stat().st_mtime>time.time()-86400:continue
            state=json.loads((directory.parent.parent/'execution.json').read_text())
            if state.get('phase')!='retained':continue
            if set(p.name for p in directory.iterdir())-{'identity.txt','data.tar.age','data.tar.tmp','receipt.json','export-config'}:continue
            shutil.rmtree(directory)
        except (ValueError,OSError):continue
