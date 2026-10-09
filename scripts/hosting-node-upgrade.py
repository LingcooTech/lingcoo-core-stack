#!/usr/bin/env python3
"""Same-schema APP_IMAGE replacement with a cold backup and conservative crash rollback."""
import datetime,importlib.util,json,os,shutil,subprocess,time,urllib.request,uuid
from pathlib import Path
from hosting_upgrade import adapter,release

def load(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def store(path,value):load('hosting-node-retire').store(path,value)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def execute(config,directory,operation,api):
    oid=str(uuid.UUID(operation['id']));did=str(uuid.UUID(directory.name))
    if operation['deploymentId']!=did or operation['nodeId']!=config['nodeId']:raise ValueError('Upgrade ownership mismatch')
    plan=api('operations/'+oid+'/upgrade')
    descriptor,project,module=adapter(config,directory)
    execution_path=directory/'execution.json';execution=json.loads(execution_path.read_text())
    if execution['appCode']!=plan['appCode']:raise ValueError('Release application mismatch')
    root=directory/'upgrades';root.mkdir(mode=0o700,exist_ok=True)
    if root.is_symlink():raise ValueError('Symlink upgrade directory')
    record=root/(oid+'.json');saved=root/(oid+'.env')
    if record.is_symlink() or saved.is_symlink() or (directory/'.env').is_symlink():raise ValueError('Symlink upgrade state')
    state=json.loads(record.read_text()) if record.exists() else None
    if state and state['plan']!=plan:raise ValueError('Frozen plan mismatch')
    prefix=['docker','compose']
    if subprocess.run(prefix+['version'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:prefix=['docker-compose']
    command=prefix+['-p',project,'--env-file',str(directory/'.env'),'-f',str(directory/'docker-compose.prod.yml'),'-f',str(directory/'limits.json')]
    def run(args):subprocess.run(args,cwd=directory,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=600)
    def healthy():
        # Never permit an unregistered additional project container to be adopted.
        ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
        containers=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
        services=[c['Config']['Labels'].get('com.docker.compose.service') for c in containers]
        if module.read_env(directory/'.env')['APP_IMAGE'] not in [c['Config']['Image'] for c in containers]:raise ValueError('Runtime image differs from configuration')
        if len(services)!=len(set(services)) or set(services)!=set(descriptor['weights']):raise ValueError('Project inventory changed')
        for _ in range(60):
            rows=json.loads(subprocess.check_output(['docker','inspect',*ids]))
            if all(c['State']['Running'] and (c['Config']['Labels'].get('com.docker.compose.service') not in descriptor['healthyServices']+descriptor['infrastructureHealthyServices'] or c['State'].get('Health',{}).get('Status')=='healthy') for c in rows):break
            time.sleep(2)
        else:raise ValueError('Container health failed')
        for endpoint in descriptor['httpChecks']:
            for attempt in range(30):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:'+str(execution['port'])+endpoint,timeout=5) as response:
                        if response.status!=200:raise ValueError('HTTP check failed')
                    break
                except (OSError,ValueError):
                    if attempt==29:raise
                    time.sleep(2)
    def owned(allow_missing=False):
        # Reuse retirement preflight through original snapshot only; recovery checks every current mount.
        ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
        rows=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
        services=[]
        for row in rows:
            labels=row['Config'].get('Labels') or {};services.append(labels.get('com.docker.compose.service'))
            if labels.get('com.docker.compose.oneoff','false').lower()!='false':raise ValueError('Oneoff in project')
            for mount in row['Mounts']:
                if mount['Type']=='volume' and mount['Name'] not in [project+'_'+v for v in descriptor['volumes']]:raise ValueError('Foreign volume')
                if mount['Type']=='bind' and (mount.get('RW',True) or str(Path(mount['Source']).resolve().relative_to(directory.resolve())) not in descriptor['files']):raise ValueError('Foreign bind')
        if len(services)!=len(set(services)) or not set(services)<=set(descriptor['weights']) or (not allow_missing and set(services)!=set(descriptor['weights'])):raise ValueError('Incomplete owned inventory')
        for v in descriptor['volumes']:
            name=project+'_'+v;meta=json.loads(subprocess.check_output(['docker','volume','inspect',name]))[0];labels=meta.get('Labels') or {}
            if labels.get('com.docker.compose.project')!=project or labels.get('com.docker.compose.volume')!=v:raise ValueError('Foreign volume labels')
            refs=subprocess.check_output(['docker','ps','-aq','--filter','volume='+name],text=True).split()
            if any(not any(row['Id'].startswith(ref) for row in rows) for ref in refs):raise ValueError('Shared volume')
    def start():
        values=module.read_env(directory/'.env')
        for key in descriptor['imageVariables']:run(['docker','image','inspect',values[key]])
        owned(allow_missing=True)
        # Same schema/data; no init hooks, migrations, config refresh or data restore.
        run(command+['up','-d','--no-deps','--force-recreate',*descriptor['weights']])
        healthy()
        ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).split()
        images=[c['Config']['Image'] for c in json.loads(subprocess.check_output(['docker','inspect',*ids]))]
        expected=module.read_env(directory/'.env')['APP_IMAGE']
        if expected not in images or (plan['fromImage'] in images and expected==plan['toImage']):raise ValueError('Running image mismatch')
    def finish(outcome,backup):
        image=module.read_env(directory/'.env')['APP_IMAGE']
        expected=plan['toImage'] if outcome=='upgraded' else plan['fromImage']
        if image!=expected:raise ValueError('Result image mismatch')
        proof={'operationId':oid,'deploymentId':did,'releaseId':plan['id'],'outcome':outcome,'runningImage':image,'completedAt':now(),'backup':backup}
        store(record,{'plan':plan,'phase':'completed','evidence':proof})
        ready=json.loads(execution_path.read_text());ready['phase']='runtime_ready';ready.pop('exitOperation',None);store(execution_path,ready)
        (directory/'exit-status.json').unlink(missing_ok=True)
        saved.unlink(missing_ok=True)
        return proof
    if state and state['phase']=='completed':
        # No repeat side effects after acknowledgement loss.
        proof=state['evidence'];ready=json.loads(execution_path.read_text());ready['phase']='runtime_ready';ready.pop('exitOperation',None);store(execution_path,ready)
        (directory/'exit-status.json').unlink(missing_ok=True);saved.unlink(missing_ok=True)
        return proof
    if state:
        # Any uncertain interruption after preflight rolls back, rather than re-running new code.
        if not saved.is_file():raise ValueError('Original configuration missing')
        values=module.read_env(saved)
        if values['APP_IMAGE']!=plan['fromImage']:raise ValueError('Original image mismatch')
        store(record,{**state,'phase':'rolling_back'})
        module.write_private(directory/'.env',saved.read_text());start()
        return finish('rolled_back',state.get('backup'))
    if execution['phase']!='runtime_ready':raise ValueError('Instance not ready')
    values=module.read_env(directory/'.env')
    if values['APP_IMAGE']!=plan['fromImage']:raise ValueError('Current image changed')
    # Approval, cached digests and ownership checks before changing anything.
    try:
        approved=[r for r in config.get('upgradeReleases',[]) if r.get('id')==plan['id']]
        if len(approved)!=1 or release(config,approved[0])!=plan:raise ValueError('Unapproved release')
        if not config.get('offsite') or not config.get('snapshotImage'):raise ValueError('Backup not configured')
        if min(shutil.disk_usage(config['backupRoot']).free,shutil.disk_usage(directory).free)<1024**3:raise ValueError('Insufficient backup headroom')
        owned();healthy()
    except Exception:
        # A rejection is terminal only if the original application remains verified healthy.
        owned();healthy()
        return finish('rejected',None)
    module.write_private(saved,(directory/'.env').read_text())
    state={'plan':plan,'phase':'snapshot','backup':None};store(record,state)
    try:
        proof=load('hosting-node-retire').execute(config,directory,operation)
        state.update(phase='applying',backup=proof);store(record,state)
        values['APP_IMAGE']=plan['toImage'];module.write_private(directory/'.env',module.encode_env(values))
        active=json.loads(execution_path.read_text());active['phase']='upgrading';store(execution_path,active)
        start()
        return finish('upgraded',proof)
    except Exception:
        store(record,{**state,'phase':'rolling_back'})
        module.write_private(directory/'.env',saved.read_text());start()
        return finish('rolled_back',state.get('backup'))
